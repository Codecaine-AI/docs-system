import { readFile, readdir, stat, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { isSafeRelativePath } from "@codecaine-ai/docs-index/paths";

import {
  MAX_CANVAS_FILE_BYTES,
  MAX_DOC_FILE_BYTES,
  inferDocsFormat,
  isAllowedDocsFilePath,
  isSafeCanvasMdxId,
  resolveCanvasSidecarRelativePath,
  resolveCanvasSidecarRootRelativePath,
  type DocsFormat,
} from "./confine";
import { withPathLock } from "./path-mutex";
import { atomicWriteFile } from "./atomic-write";
import { createContentHash } from "./content-hash";
import { draftLockStore, type DraftLockInfo } from "./draft-locks";
import { indexCanvasSourceBestEffort } from "./backlinks-cache";

/**
 * Canvas sidecar mutation core — doc-relative save / create / delete, the
 * src-rooted (docs-root-relative) save external canvas editors use — plus
 * the `<Canvas .../>` MDX reference helpers the create/delete flows use to
 * keep a legacy `.mdx` doc's embed references in sync with its sidecars.
 */

// ---------------------------------------------------------------------------
// Canvas payload structural check
// ---------------------------------------------------------------------------

/**
 * Light structural check on a canvas sidecar payload before it is persisted
 * or served (full schema validation happens via
 * `validateInteractiveCanvasDocument` in the typed canvas tools).
 */
export function validateCanvasPayload(value: unknown): { ok: true } | { ok: false; detail: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, detail: "Canvas payload must be an object" };
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    return { ok: false, detail: "Canvas schemaVersion must be 1" };
  }
  if (typeof record.id !== "string" || !record.id.trim()) {
    return { ok: false, detail: "Canvas id is required" };
  }
  if (record.mode !== "diagram") {
    return { ok: false, detail: "Canvas mode must be diagram" };
  }
  if (!Array.isArray(record.objects) || !Array.isArray(record.connections)) {
    return { ok: false, detail: "Canvas objects and connections must be arrays" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Canvas sidecar listing (GET /api/canvases)
// ---------------------------------------------------------------------------

export type CanvasSidecarListEntry = {
  /** Docs-root-relative sidecar path — the `src` GET /api/canvas accepts. */
  src: string;
  /** Same value as `src`; matches the `canvas_path` GET /api/canvas returns. */
  canvas_path: string;
  /** Canvas `id` from the sidecar JSON, or null when unreadable/unparsable. */
  id: string | null;
  /** Canvas `title` from the sidecar JSON, or null when absent/unparsable. */
  title: string | null;
  /** Sidecar file mtime as an ISO-8601 string. */
  updated_at: string;
};

/**
 * Read-only recursive scan of `docsRoot` for `*.canvas.json` sidecars — the
 * inventory behind `GET /api/canvases` (external canvas editors list the
 * repo's canvases through this). Only paths that
 * `resolveCanvasSidecarRootRelativePath` accepts are listed (i.e. sidecars a
 * `GET /api/canvas?src=` read can actually address); unparsable or oversized
 * sidecar JSON still lists, with null `id`/`title`. Dot-directories and
 * node_modules are skipped, matching the docs tree walker.
 */
export async function listCanvasSidecars(docsRoot: string): Promise<CanvasSidecarListEntry[]> {
  const entries: CanvasSidecarListEntry[] = [];

  async function walk(relPath: string): Promise<void> {
    let dirEntries;
    try {
      dirEntries = await readdir(join(docsRoot, relPath), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of dirEntries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(childRel);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".canvas.json")) continue;
      const canvasRelPath = resolveCanvasSidecarRootRelativePath(docsRoot, childRel);
      if (!canvasRelPath) continue;
      let st;
      try {
        st = await stat(join(docsRoot, canvasRelPath));
      } catch {
        continue;
      }
      let id: string | null = null;
      let title: string | null = null;
      if (st.size <= MAX_CANVAS_FILE_BYTES) {
        try {
          const parsed = JSON.parse(
            await readFile(join(docsRoot, canvasRelPath), "utf8"),
          ) as Record<string, unknown>;
          if (typeof parsed.id === "string") id = parsed.id;
          if (typeof parsed.title === "string") title = parsed.title;
        } catch {
          // Unparsable sidecars still list (null id/title) so editors can
          // surface — rather than silently hide — broken files.
        }
      }
      entries.push({
        src: canvasRelPath,
        canvas_path: canvasRelPath,
        id,
        title,
        updated_at: st.mtime.toISOString(),
      });
    }
  }

  await walk("");
  entries.sort((a, b) => a.canvas_path.localeCompare(b.canvas_path));
  return entries;
}

// ---------------------------------------------------------------------------
// MDX <Canvas /> reference helpers
// ---------------------------------------------------------------------------

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

export function canvasMdxReference(canvasId: string, src: string): string {
  return `<Canvas id="${canvasId}" src="${src}" />`;
}

export type CanvasReferenceInsertPosition = {
  source_range?: {
    start_offset: number;
    end_offset: number;
  };
  text_quote?: string;
};

function findCanvasReferenceInsertOffset(
  content: string,
  insertAfter?: CanvasReferenceInsertPosition | null,
): number | null {
  const range = insertAfter?.source_range;
  if (
    range &&
    Number.isInteger(range.start_offset) &&
    Number.isInteger(range.end_offset) &&
    range.start_offset >= 0 &&
    range.end_offset >= range.start_offset &&
    range.end_offset <= content.length
  ) {
    return range.end_offset;
  }

  const quote = insertAfter?.text_quote?.trim();
  if (quote) {
    const quoteIndex = content.indexOf(quote);
    if (quoteIndex >= 0) return quoteIndex + quote.length;
  }

  return null;
}

function insertReferenceAfterOffset(
  content: string,
  reference: string,
  offset: number | null,
): string {
  if (offset === null) {
    const withTrailingNewline = ensureTrailingNewline(content);
    return `${withTrailingNewline}\n${reference}\n`;
  }

  const nextLineBreak = content.indexOf("\n", offset);
  const insertAt = nextLineBreak >= 0 ? nextLineBreak + 1 : content.length;
  const before = content.slice(0, insertAt).replace(/[ \t]+$/g, "");
  const after = content.slice(insertAt);
  const beforeSeparator =
    before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";

  if (!after) return `${before}${beforeSeparator}${reference}\n`;

  return `${before}${beforeSeparator}${reference}\n\n${after.replace(/^\n+/, "")}`;
}

export function insertCanvasReferenceIntoContent(
  content: string,
  canvasId: string,
  src: string,
  insertAfter?: CanvasReferenceInsertPosition | null,
): string {
  const reference = canvasMdxReference(canvasId, src);
  const withTrailingNewline = ensureTrailingNewline(content);
  if (withTrailingNewline.includes(reference)) return withTrailingNewline;
  const insertOffset = findCanvasReferenceInsertOffset(withTrailingNewline, insertAfter);
  return insertReferenceAfterOffset(withTrailingNewline, reference, insertOffset);
}

export function appendCanvasReferenceToContent(
  content: string,
  canvasId: string,
  src: string,
): string {
  return insertCanvasReferenceIntoContent(content, canvasId, src);
}

export function removeCanvasReferenceFromContent(
  content: string,
  canvasId: string,
  src: string,
): string {
  const reference = canvasMdxReference(canvasId, src);
  const lines = content.split(/\r?\n/);
  const nextLines = lines.filter((line) => line.trim() !== reference);
  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ---------------------------------------------------------------------------
// Docs source-file + doc-relative sidecar loading
// ---------------------------------------------------------------------------

export type DocsSourceFileLoadResult = {
  docsRoot: string;
  fileAbs: string;
  content: string;
  contentHash: string;
  format: DocsFormat;
};

export type DocsSourceFileLoadError = {
  error: { status: number; detail: string };
};

/**
 * Loads a markdown/MDX docs source file confined under `docsRoot` (path
 * predicate + traversal guard + size cap).
 */
export async function loadDocsSourceFile(
  docsRoot: string,
  path: string,
): Promise<DocsSourceFileLoadResult | DocsSourceFileLoadError> {
  if (!isSafeRelativePath(path)) {
    return { error: { status: 400, detail: `Invalid docs path: ${path}` } };
  }
  if (!isAllowedDocsFilePath(path)) {
    return {
      error: { status: 400, detail: `Unsupported docs file extension: ${path}` },
    };
  }

  const fileAbs = join(docsRoot, path);
  const resolved = resolve(fileAbs);
  const docsRootResolved = resolve(docsRoot);
  if (resolved !== docsRootResolved && !resolved.startsWith(docsRootResolved + sep)) {
    return { error: { status: 400, detail: `Path escapes docs directory: ${path}` } };
  }

  let st;
  try {
    st = await stat(fileAbs);
  } catch {
    return { error: { status: 404, detail: `Docs file not found: ${path}` } };
  }
  if (!st.isFile()) {
    return { error: { status: 404, detail: `Docs path is not a file: ${path}` } };
  }
  if (st.size > MAX_DOC_FILE_BYTES) {
    return { error: { status: 413, detail: `Docs file exceeds size cap: ${path}` } };
  }

  const content = await readFile(fileAbs, "utf8");
  return {
    docsRoot,
    fileAbs,
    content,
    contentHash: createContentHash(content),
    format: inferDocsFormat(path),
  };
}

export type CanvasSidecarByDocPathLoadResult = {
  docsRoot: string;
  docsRootResolved: string;
  docPath: string;
  docAbs: string;
  docContent: string;
  docContentHash: string;
  canvasRelPath: string;
  canvasAbs: string;
  canvasContent: string;
  canvasContentHash: string;
  canvas: unknown;
};

export type CanvasSidecarByDocPathError = {
  error: { status: number; detail: string };
};

/**
 * Loads a canvas sidecar resolved RELATIVE TO a referencing doc's own
 * directory (the legacy `.mdx` `<Canvas src>` embed form), together with the
 * referencing doc's content (needed for MDX-reference bookkeeping).
 */
export async function loadCanvasSidecarByDocPath(
  docsRoot: string,
  docPath: string,
  src: string,
): Promise<CanvasSidecarByDocPathLoadResult | CanvasSidecarByDocPathError> {
  const loaded = await loadDocsSourceFile(docsRoot, docPath);
  if ("error" in loaded) return loaded;
  const canvasRelPath = resolveCanvasSidecarRelativePath(docPath, src);
  if (!canvasRelPath) {
    return {
      error: {
        status: 400,
        detail: `Invalid canvas sidecar path for ${docPath}: ${src}`,
      },
    };
  }
  const canvasAbs = join(docsRoot, canvasRelPath);
  const resolved = resolve(canvasAbs);
  const docsRootResolved = resolve(docsRoot);
  if (resolved !== docsRootResolved && !resolved.startsWith(docsRootResolved + sep)) {
    return {
      error: { status: 400, detail: `Canvas path escapes docs directory: ${src}` },
    };
  }
  let st;
  try {
    st = await stat(canvasAbs);
  } catch {
    return { error: { status: 404, detail: `Canvas sidecar not found: ${src}` } };
  }
  if (!st.isFile()) {
    return { error: { status: 404, detail: `Canvas sidecar is not a file: ${src}` } };
  }
  if (st.size > MAX_CANVAS_FILE_BYTES) {
    return { error: { status: 413, detail: `Canvas sidecar exceeds size cap: ${src}` } };
  }
  const canvasContent = await readFile(canvasAbs, "utf8");
  let canvas: unknown;
  try {
    canvas = JSON.parse(canvasContent);
  } catch {
    return { error: { status: 400, detail: `Canvas sidecar is invalid JSON: ${src}` } };
  }
  const payloadValidation = validateCanvasPayload(canvas);
  if (!payloadValidation.ok) {
    return { error: { status: 400, detail: payloadValidation.detail } };
  }
  return {
    docsRoot,
    docsRootResolved,
    docPath,
    docAbs: loaded.fileAbs,
    docContent: loaded.content,
    docContentHash: loaded.contentHash,
    canvasRelPath,
    canvasAbs,
    canvasContent,
    canvasContentHash: createContentHash(canvasContent),
    canvas,
  };
}

export type CanvasSidecarBySrcLoadResult = {
  canvasRelPath: string;
  canvasAbs: string;
  canvasContent: string;
  canvasContentHash: string;
  canvas: unknown;
};

export type CanvasSidecarBySrcError = {
  error: { status: number; detail: string };
};

/**
 * Loads a canvas sidecar addressed by a DOCS-ROOT-RELATIVE `src` (the form
 * `GET /api/canvas?src=` and `GET /api/canvases` speak) — no referencing doc
 * involved. Same confinement + validation ladder as the doc-relative loader:
 * bad path -> 400, missing -> 404, size cap -> 413, invalid JSON/payload -> 400.
 */
export async function loadCanvasSidecarBySrc(
  docsRoot: string,
  src: string,
): Promise<CanvasSidecarBySrcLoadResult | CanvasSidecarBySrcError> {
  const canvasRelPath = resolveCanvasSidecarRootRelativePath(docsRoot, src);
  if (!canvasRelPath) {
    return { error: { status: 400, detail: `Invalid canvas sidecar path: ${src}` } };
  }
  const canvasAbs = join(docsRoot, canvasRelPath);
  let st;
  try {
    st = await stat(canvasAbs);
  } catch {
    return { error: { status: 404, detail: `Canvas sidecar not found: ${src}` } };
  }
  if (!st.isFile()) {
    return { error: { status: 404, detail: `Canvas sidecar is not a file: ${src}` } };
  }
  if (st.size > MAX_CANVAS_FILE_BYTES) {
    return { error: { status: 413, detail: `Canvas sidecar exceeds size cap: ${src}` } };
  }
  const canvasContent = await readFile(canvasAbs, "utf8");
  let canvas: unknown;
  try {
    canvas = JSON.parse(canvasContent);
  } catch {
    return { error: { status: 400, detail: `Canvas sidecar is invalid JSON: ${src}` } };
  }
  const payloadValidation = validateCanvasPayload(canvas);
  if (!payloadValidation.ok) {
    return { error: { status: 400, detail: payloadValidation.detail } };
  }
  return {
    canvasRelPath,
    canvasAbs,
    canvasContent,
    canvasContentHash: createContentHash(canvasContent),
    canvas,
  };
}

/** The wire shape the doc-relative canvas read/save routes use. */
export function canvasSidecarResponse(loaded: CanvasSidecarByDocPathLoadResult) {
  return {
    path: loaded.docPath,
    document_path: `docs/${loaded.docPath}`,
    canvas_path: loaded.canvasRelPath,
    canvas_document_path: `docs/${loaded.canvasRelPath}`,
    content_hash: loaded.canvasContentHash,
    canvas: loaded.canvas,
  };
}

async function writeCanvasSidecarFile(
  canvasAbs: string,
  canvas: unknown,
): Promise<{ ok: true; content: string; content_hash: string } | { ok: false; detail: string }> {
  const payloadValidation = validateCanvasPayload(canvas);
  if (!payloadValidation.ok) return { ok: false, detail: payloadValidation.detail };
  const content = `${JSON.stringify(canvas, null, 2)}\n`;
  await atomicWriteFile(canvasAbs, content);
  return { ok: true, content, content_hash: createContentHash(content) };
}

// ---------------------------------------------------------------------------
// Save / create / delete
// ---------------------------------------------------------------------------

export type CanvasSidecarWireResponse = {
  path: string;
  document_path: string;
  canvas_path: string;
  canvas_document_path: string;
  content_hash: string;
  canvas: unknown;
  mdx_content?: string;
  mdx_content_hash?: string;
};

export type SaveCanvasSidecarInput = {
  docPath: string;
  src: string;
  canvas: unknown;
  originalHash?: string;
  sessionId?: string;
};

export type SaveCanvasSidecarResult =
  | { ok: true; response: CanvasSidecarWireResponse }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      original_hash?: string;
      held_by?: DraftLockInfo;
    };

/**
 * Whole-document save of an EXISTING doc-relative canvas sidecar with the
 * full mutation contract: hash precondition (409) -> draft-lock precondition
 * (423) -> validate -> atomic persist -> best-effort backlinks reindex. The
 * read-check-write sequence runs inside `withPathLock` keyed on the sidecar's
 * absolute path.
 */
export async function saveCanvasSidecar(
  docsRoot: string,
  input: SaveCanvasSidecarInput,
): Promise<SaveCanvasSidecarResult> {
  // Resolve the sidecar's absolute path first (read-only) purely to get the
  // lock key — the actual read-check-write sequence below re-loads INSIDE
  // the lock so no writer can interleave between the hash check and write.
  const keyLookup = await loadCanvasSidecarByDocPath(docsRoot, input.docPath, input.src);
  if ("error" in keyLookup) {
    return { ok: false, status: keyLookup.error.status, detail: keyLookup.error.detail };
  }

  return withPathLock(keyLookup.canvasAbs, async (): Promise<SaveCanvasSidecarResult> => {
    const loaded = await loadCanvasSidecarByDocPath(docsRoot, input.docPath, input.src);
    if ("error" in loaded) {
      return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
    }
    if (input.originalHash && input.originalHash !== loaded.canvasContentHash) {
      return {
        ok: false,
        status: 409,
        detail: "Canvas sidecar is stale; reload before saving.",
        current_hash: loaded.canvasContentHash,
        original_hash: input.originalHash,
      };
    }
    const lockCheck = draftLockStore.checkForMutation(
      { kind: "canvas", path: loaded.canvasRelPath },
      input.sessionId,
    );
    if (lockCheck.blocked) {
      return {
        ok: false,
        status: 423,
        detail: "Draft in progress — another session is editing this file.",
        held_by: lockCheck.heldBy,
      };
    }
    const written = await writeCanvasSidecarFile(loaded.canvasAbs, input.canvas);
    if (!written.ok) {
      return { ok: false, status: 400, detail: written.detail };
    }
    void indexCanvasSourceBestEffort(docsRoot, loaded.canvasRelPath, input.canvas);
    return {
      ok: true,
      response: {
        path: loaded.docPath,
        document_path: `docs/${loaded.docPath}`,
        canvas_path: loaded.canvasRelPath,
        canvas_document_path: `docs/${loaded.canvasRelPath}`,
        content_hash: written.content_hash,
        canvas: input.canvas,
      },
    };
  });
}

export type SaveCanvasSidecarBySrcInput = {
  src: string;
  canvas: unknown;
  originalHash?: string;
  sessionId?: string;
};

/**
 * Wire shape for src-rooted sidecar saves. Structurally the doc-relative
 * `CanvasSidecarWireResponse` minus the referencing doc: `path` and
 * `document_path` are EXPLICIT nulls (not omitted) so clients can branch on
 * one response type for both PUT forms.
 */
export type CanvasSidecarBySrcWireResponse = {
  path: null;
  document_path: null;
  canvas_path: string;
  canvas_document_path: string;
  content_hash: string;
  canvas: unknown;
};

export type SaveCanvasSidecarBySrcResult =
  | { ok: true; response: CanvasSidecarBySrcWireResponse }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      original_hash?: string;
      held_by?: DraftLockInfo;
    };

/**
 * Whole-document save of an EXISTING canvas sidecar addressed by a
 * docs-root-relative `src` (the form Canvas Studio saves through after
 * listing via GET /api/canvases). Identical mutation contract to the
 * doc-relative `saveCanvasSidecar`: sidecar must exist (404), hash
 * precondition (409) -> draft-lock precondition (423) -> validate -> atomic
 * persist -> best-effort backlinks reindex, all inside `withPathLock` keyed
 * on the sidecar's absolute path.
 */
export async function saveCanvasSidecarBySrc(
  docsRoot: string,
  input: SaveCanvasSidecarBySrcInput,
): Promise<SaveCanvasSidecarBySrcResult> {
  // Resolve the sidecar's absolute path first (read-only) purely to get the
  // lock key — the actual read-check-write sequence below re-loads INSIDE
  // the lock so no writer can interleave between the hash check and write.
  const keyLookup = await loadCanvasSidecarBySrc(docsRoot, input.src);
  if ("error" in keyLookup) {
    return { ok: false, status: keyLookup.error.status, detail: keyLookup.error.detail };
  }

  return withPathLock(keyLookup.canvasAbs, async (): Promise<SaveCanvasSidecarBySrcResult> => {
    const loaded = await loadCanvasSidecarBySrc(docsRoot, input.src);
    if ("error" in loaded) {
      return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
    }
    if (input.originalHash && input.originalHash !== loaded.canvasContentHash) {
      return {
        ok: false,
        status: 409,
        detail: "Canvas sidecar is stale; reload before saving.",
        current_hash: loaded.canvasContentHash,
        original_hash: input.originalHash,
      };
    }
    const lockCheck = draftLockStore.checkForMutation(
      { kind: "canvas", path: loaded.canvasRelPath },
      input.sessionId,
    );
    if (lockCheck.blocked) {
      return {
        ok: false,
        status: 423,
        detail: "Draft in progress — another session is editing this file.",
        held_by: lockCheck.heldBy,
      };
    }
    const written = await writeCanvasSidecarFile(loaded.canvasAbs, input.canvas);
    if (!written.ok) {
      return { ok: false, status: 400, detail: written.detail };
    }
    void indexCanvasSourceBestEffort(docsRoot, loaded.canvasRelPath, input.canvas);
    return {
      ok: true,
      response: {
        path: null,
        document_path: null,
        canvas_path: loaded.canvasRelPath,
        canvas_document_path: `docs/${loaded.canvasRelPath}`,
        content_hash: written.content_hash,
        canvas: input.canvas,
      },
    };
  });
}

export type CreateCanvasSidecarInput = {
  docPath: string;
  src: string;
  canvas: unknown;
  insertMdx?: boolean;
  canvasId?: string;
  originalHash?: string;
  insertAfter?: CanvasReferenceInsertPosition | null;
  sessionId?: string;
};

export type CreateCanvasSidecarResult =
  | { ok: true; response: CanvasSidecarWireResponse }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      original_hash?: string;
      held_by?: DraftLockInfo;
    };

/**
 * Creates a NEW doc-relative canvas sidecar (409 when it already exists),
 * optionally inserting a `<Canvas id src />` MDX reference into the
 * referencing doc. The exists-check + write runs inside the path lock so two
 * concurrent creates for the same new sidecar path can't both pass the
 * "does not exist yet" check.
 */
export async function createCanvasSidecar(
  docsRoot: string,
  input: CreateCanvasSidecarInput,
): Promise<CreateCanvasSidecarResult> {
  const loadedDoc = await loadDocsSourceFile(docsRoot, input.docPath);
  if ("error" in loadedDoc) {
    return { ok: false, status: loadedDoc.error.status, detail: loadedDoc.error.detail };
  }
  if (input.originalHash && input.originalHash !== loadedDoc.contentHash) {
    return {
      ok: false,
      status: 409,
      detail: "Docs document is stale; reload before inserting a canvas.",
      current_hash: loadedDoc.contentHash,
      original_hash: input.originalHash,
    };
  }
  const canvasRelPath = resolveCanvasSidecarRelativePath(input.docPath, input.src);
  if (!canvasRelPath) {
    return {
      ok: false,
      status: 400,
      detail: `Invalid canvas sidecar path for ${input.docPath}: ${input.src}`,
    };
  }
  const canvasAbs = join(docsRoot, canvasRelPath);
  const resolved = resolve(canvasAbs);
  const docsRootResolved = resolve(docsRoot);
  if (resolved !== docsRootResolved && !resolved.startsWith(docsRootResolved + sep)) {
    return { ok: false, status: 400, detail: `Canvas path escapes docs directory: ${input.src}` };
  }

  return withPathLock(canvasAbs, async (): Promise<CreateCanvasSidecarResult> => {
    let exists = false;
    try {
      exists = (await stat(canvasAbs)).isFile();
    } catch {
      exists = false;
    }
    if (exists) {
      return { ok: false, status: 409, detail: `Canvas sidecar already exists: ${canvasRelPath}` };
    }
    const lockCheck = draftLockStore.checkForMutation(
      { kind: "canvas", path: canvasRelPath },
      input.sessionId,
    );
    if (lockCheck.blocked) {
      return {
        ok: false,
        status: 423,
        detail: "Draft in progress — another session is editing this file.",
        held_by: lockCheck.heldBy,
      };
    }
    const insertCanvasId = input.insertMdx
      ? typeof input.canvasId === "string" && input.canvasId.trim()
        ? input.canvasId.trim()
        : (input.canvas as Record<string, unknown>).id
      : null;
    if (input.insertMdx) {
      if (typeof insertCanvasId !== "string" || !isSafeCanvasMdxId(insertCanvasId)) {
        return { ok: false, status: 400, detail: "Canvas MDX id is invalid" };
      }
    }
    const written = await writeCanvasSidecarFile(canvasAbs, input.canvas);
    if (!written.ok) {
      return { ok: false, status: 400, detail: written.detail };
    }
    void indexCanvasSourceBestEffort(docsRoot, canvasRelPath, input.canvas);
    const response: CanvasSidecarWireResponse = {
      path: input.docPath,
      document_path: `docs/${input.docPath}`,
      canvas_path: canvasRelPath,
      canvas_document_path: `docs/${canvasRelPath}`,
      content_hash: written.content_hash,
      canvas: input.canvas,
    };
    if (input.insertMdx) {
      const nextContent = insertCanvasReferenceIntoContent(
        loadedDoc.content,
        insertCanvasId as string,
        input.src,
        input.insertAfter,
      );
      await atomicWriteFile(loadedDoc.fileAbs, nextContent);
      response.mdx_content = nextContent;
      response.mdx_content_hash = createContentHash(nextContent);
    }
    return { ok: true, response };
  });
}

export type DeleteCanvasSidecarInput = {
  docPath: string;
  src: string;
  removeReference?: boolean;
  canvasId?: string;
  originalHash?: string;
};

export type DeleteCanvasSidecarResult =
  | {
      ok: true;
      response: {
        path: string;
        canvas_path: string;
        mdx_content_hash?: string;
        deleted: true;
      };
    }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      original_hash?: string;
    };

/**
 * Deletes a doc-relative canvas sidecar, optionally removing its `<Canvas>`
 * MDX reference from the referencing doc (hash-preconditioned).
 */
export async function deleteCanvasSidecar(
  docsRoot: string,
  input: DeleteCanvasSidecarInput,
): Promise<DeleteCanvasSidecarResult> {
  const loaded = await loadCanvasSidecarByDocPath(docsRoot, input.docPath, input.src);
  if ("error" in loaded) {
    return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
  }
  let mdxContentHash: string | undefined;
  if (input.removeReference) {
    if (input.originalHash && input.originalHash !== loaded.docContentHash) {
      return {
        ok: false,
        status: 409,
        detail: "Docs document is stale; reload before canceling canvas insertion.",
        current_hash: loaded.docContentHash,
        original_hash: input.originalHash,
      };
    }
    const canvasId =
      input.canvasId ?? ((loaded.canvas as Record<string, unknown>).id as string | undefined);
    if (!canvasId || !isSafeCanvasMdxId(canvasId)) {
      return { ok: false, status: 400, detail: "Canvas MDX id is invalid" };
    }
    const nextContent = removeCanvasReferenceFromContent(loaded.docContent, canvasId, input.src);
    if (nextContent !== loaded.docContent) {
      await atomicWriteFile(loaded.docAbs, nextContent);
    }
    mdxContentHash = createContentHash(nextContent);
  }
  await unlink(loaded.canvasAbs);
  return {
    ok: true,
    response: {
      path: loaded.docPath,
      canvas_path: loaded.canvasRelPath,
      mdx_content_hash: mdxContentHash,
      deleted: true as const,
    },
  };
}
