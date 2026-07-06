import { readFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Database } from "bun:sqlite";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import {
  extractCanvasRefs,
  extractDocRefs,
  queryInboundTolerant,
  removeForSource,
  upsertForSource,
  type BacklinkRow,
} from "./backlinks";
import { normalizeDocRefPath, rewriteDocRefPath, sameDocRef } from "./ref-match";
import { isSafeRelativePath, resolveDocBundleJsonPath } from "./paths";

/**
 * Move-doc (D27, CP7 TG7.2): moves a doc bundle folder and rewrites every
 * inbound reference that pointed at its old path — both delta `reference`
 * spans in other doc.json bundles and `links[].target` entries in canvas
 * sidecars — through the SAME save boundaries normal edits use
 * (`applyDocOpsToBundle` for docs, a caller-supplied canvas writer for
 * canvases), so hash preconditions and validation stay identical to a normal
 * save. Non-atomic by design (v1): the folder move happens first, then each
 * inbound source is patched one at a time with a fresh hash read. If a
 * later source's patch fails, the move and any already-rewritten sources are
 * NOT rolled back — the returned summary's `failures[]` surfaces exactly
 * which sources didn't get rewritten so the caller (or a human) can re-run
 * `docs links check` / fix up manually. This tradeoff is accepted for v1;
 * documented here per the checkpoint brief.
 */

export type MoveDocFailure = { sourcePath: string; reason: string };

export type MoveDocResult =
  | {
      ok: true;
      moved: { fromPath: string; toPath: string };
      rewrittenSources: string[];
      failures: MoveDocFailure[];
    }
  | { ok: false; status: number; detail: string };

/** Injected (rather than imported) so tests can wrap/instrument the doc-ops
 * save boundary without touching index.ts's real implementation. */
export type ApplyDocOpsFn = (
  docsRoot: string,
  path: string,
  ops: DocOp[],
  expectedHash: string | undefined,
  projectId: string,
) => Promise<
  | { ok: true; doc: DocDocument; hash: string; patchId: string; inverse: DocOp[] }
  | { ok: false; status: number; detail: string; current_hash?: string; expected_hash?: string; issues?: unknown }
>;

export type LoadCanvasFn = (
  docsRoot: string,
  canvasRelPath: string,
) => Promise<{ ok: true; canvas: InteractiveCanvasDocument } | { ok: false; reason: string }>;

export type SaveCanvasFn = (
  docsRoot: string,
  canvasRelPath: string,
  canvas: InteractiveCanvasDocument,
) => Promise<{ ok: true } | { ok: false; reason: string }>;

/** True when `sourcePath` (an index row's source_path) names a canvas sidecar. */
function isCanvasSourcePath(sourcePath: string): boolean {
  return sourcePath.toLowerCase().endsWith(".canvas.json");
}

/** Strips a trailing `/doc.json` to get the bundle path a doc source_path indexes under. */
function bundlePathFromDocSource(sourcePath: string): string {
  return sourcePath.replace(/\/doc\.json$/i, "");
}

export type MoveDocDeps = {
  applyDocOps: ApplyDocOpsFn;
  loadCanvas: LoadCanvasFn;
  saveCanvas: SaveCanvasFn;
  /** Open backlinks db handle (caller owns lifecycle/closing). */
  backlinksDb: Database;
  projectId: string;
};

/**
 * Rewrites every delta `reference` span across a doc's blocks whose path
 * tolerantly matches `fromPath`, returning the `updateBlock` ops needed (one
 * per affected block — a block can have multiple matching spans, all
 * rewritten in a single op) or `null` if nothing in the doc matched.
 */
function buildDocRewriteOps(doc: DocDocument, fromPath: string, toPath: string): DocOp[] | null {
  const ops: DocOp[] = [];
  for (const block of Object.values(doc.blocks)) {
    if (!block.text) continue;
    let changed = false;
    const nextText = block.text.map((span) => {
      const reference = span.attributes?.reference;
      if (!reference || reference.kind !== "doc" || !sameDocRef(reference.path, fromPath)) {
        return span;
      }
      changed = true;
      return {
        ...span,
        attributes: {
          ...span.attributes,
          reference: {
            ...reference,
            path: rewriteDocRefPath(reference.path, fromPath, toPath),
          },
        },
      };
    });
    if (changed) {
      ops.push({ type: "updateBlock", blockId: block.id, text: nextText });
    }
  }
  return ops.length > 0 ? ops : null;
}

/** Rewrites every canvas link whose target tolerantly matches `fromPath`. Mutates a shallow copy. */
function buildCanvasRewrite(
  canvas: InteractiveCanvasDocument,
  fromPath: string,
  toPath: string,
): { changed: boolean; canvas: InteractiveCanvasDocument } {
  let changed = false;
  const links = (canvas.links ?? []).map((link) => {
    if (link.target.kind !== "doc" || !sameDocRef(link.target.path, fromPath)) return link;
    changed = true;
    return {
      ...link,
      target: { ...link.target, path: rewriteDocRefPath(link.target.path, fromPath, toPath) },
    };
  });
  return { changed, canvas: changed ? { ...canvas, links } : canvas };
}

/**
 * Moves a doc bundle folder from `fromPath` to `toPath` (both docs-root
 * relative bundle paths) and rewrites every inbound reference discovered via
 * the backlinks index. See module doc for the non-atomicity tradeoff.
 */
export async function moveDocBundle(
  docsRoot: string,
  fromPath: string,
  toPath: string,
  deps: MoveDocDeps,
): Promise<MoveDocResult> {
  if (!isSafeRelativePath(fromPath) || !isSafeRelativePath(toPath)) {
    return { ok: false, status: 400, detail: "fromPath and toPath must be safe relative paths." };
  }
  const canonicalFrom = normalizeDocRefPath(fromPath);
  const canonicalTo = normalizeDocRefPath(toPath);
  if (canonicalFrom === canonicalTo) {
    return { ok: false, status: 400, detail: "fromPath and toPath resolve to the same bundle." };
  }

  // Reuse the shared bundle resolver for docs-root confinement (resolves
  // before comparing against the root) instead of a local re-implementation;
  // the bundle DIR is its doc.json's dirname.
  const fromJsonAbs = resolveDocBundleJsonPath(docsRoot, canonicalFrom);
  const toJsonAbs = resolveDocBundleJsonPath(docsRoot, canonicalTo);
  if (!fromJsonAbs || !toJsonAbs) {
    return { ok: false, status: 400, detail: "Path escapes the docs directory." };
  }
  const fromAbs = dirname(fromJsonAbs);
  const toAbs = dirname(toJsonAbs);
  if (!existsSync(fromJsonAbs)) {
    return { ok: false, status: 404, detail: `No doc bundle found at ${fromPath}` };
  }
  if (existsSync(toAbs)) {
    return { ok: false, status: 409, detail: `A path already exists at ${toPath}` };
  }

  // 1. Move the bundle folder.
  await mkdirParent(toAbs);
  await rename(fromAbs, toAbs);

  // 2. Discover every inbound reference under any accepted on-disk alias.
  const inbound = queryInboundTolerant(deps.backlinksDb, canonicalFrom);

  const rewrittenSources: string[] = [];
  const failures: MoveDocFailure[] = [];

  // Group by source so a source with multiple matching rows is patched once.
  const bySource = new Map<string, BacklinkRow[]>();
  for (const row of inbound) {
    const list = bySource.get(row.sourcePath) ?? [];
    list.push(row);
    bySource.set(row.sourcePath, list);
  }

  for (const sourcePath of bySource.keys()) {
    // Sources that lived INSIDE the moved bundle (the bundle's own doc.json,
    // nested bundles, its canvas sidecars) were physically renamed along
    // with the folder in step 1 — rewriting them at their OLD path would
    // 404. Rewrite them at their NEW location instead, and re-home their
    // index rows under the new source path so no stale rows linger.
    const movedWithBundle = sourcePath.startsWith(`${canonicalFrom}/`);
    const effectiveSourcePath = movedWithBundle
      ? `${canonicalTo}${sourcePath.slice(canonicalFrom.length)}`
      : sourcePath;

    if (isCanvasSourcePath(effectiveSourcePath)) {
      const loaded = await deps.loadCanvas(docsRoot, effectiveSourcePath);
      if (!loaded.ok) {
        failures.push({ sourcePath: effectiveSourcePath, reason: loaded.reason });
        continue;
      }
      const { changed, canvas } = buildCanvasRewrite(loaded.canvas, canonicalFrom, canonicalTo);
      if (!changed) continue;
      const saved = await deps.saveCanvas(docsRoot, effectiveSourcePath, canvas);
      if (!saved.ok) {
        failures.push({ sourcePath: effectiveSourcePath, reason: saved.reason });
        continue;
      }
      rewrittenSources.push(effectiveSourcePath);
      if (movedWithBundle) removeForSource(deps.backlinksDb, sourcePath);
      upsertForSource(deps.backlinksDb, effectiveSourcePath, extractCanvasRefs(canvas));
      continue;
    }

    // Doc source: sourcePath from the index is the bundle's doc.json file
    // path (e.g. "10-system-design/00-overview/doc.json"); applyDocOps takes
    // a bundle path, so strip the trailing /doc.json.
    const bundlePath = bundlePathFromDocSource(effectiveSourcePath);
    // Fresh read + fresh hash every time (no expectedHash) — accepted
    // non-atomicity: a concurrent editor could race this, see module doc.
    const current = await deps.applyDocOps(docsRoot, bundlePath, [], undefined, deps.projectId);
    if (!current.ok) {
      failures.push({ sourcePath: effectiveSourcePath, reason: current.detail });
      continue;
    }
    const ops = buildDocRewriteOps(current.doc, canonicalFrom, canonicalTo);
    if (!ops) continue;
    const applied = await deps.applyDocOps(docsRoot, bundlePath, ops, current.hash, deps.projectId);
    if (!applied.ok) {
      failures.push({ sourcePath: effectiveSourcePath, reason: applied.detail });
      continue;
    }
    rewrittenSources.push(effectiveSourcePath);
    if (movedWithBundle) removeForSource(deps.backlinksDb, sourcePath);
    upsertForSource(deps.backlinksDb, effectiveSourcePath, extractDocRefs(applied.doc));
  }

  // 3. Re-index the moved doc itself under its new path.
  removeForSource(deps.backlinksDb, `${canonicalFrom}/doc.json`);
  try {
    const movedRaw = await readFile(join(toAbs, "doc.json"), "utf8");
    const movedDoc = JSON.parse(movedRaw) as DocDocument;
    upsertForSource(deps.backlinksDb, `${canonicalTo}/doc.json`, extractDocRefs(movedDoc));
  } catch {
    // Defensive only — the file was just moved successfully above.
  }

  return {
    ok: true,
    moved: { fromPath: canonicalFrom, toPath: canonicalTo },
    rewrittenSources,
    failures,
  };
}

async function mkdirParent(absPath: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(absPath), { recursive: true });
}
