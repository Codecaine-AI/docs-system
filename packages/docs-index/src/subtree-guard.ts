import { isExcludedUnderDocsRoot } from "./paths";
import { checkDocsPath, docsFs, isDocsPathRefusal } from "./safe-path";

/**
 * Whole-folder guard for operations that delete, move, rename or merge a doc
 * bundle folder with everything below it.
 *
 * A knowledge-base folder may hold base-shapes record files beside its prose
 * (`note.json` next to `doc.json`, a Place's `entity.json`, a store's
 * `tasks/<slug>.json`). Those records belong to their own flat stores, not to
 * the docs system, so a docs operation must never carry them away. Frozen
 * paths a project excludes (codecaine.docs.json `exclude`) must not move or
 * vanish with an allowed ancestor either, and an allowed subtree must not be
 * moved to where part of it would become excluded. The guard walks the
 * physical subtree through the docs-root chokepoint (safe-path.ts) with lstat
 * semantics (symbolic links are reported, never followed), judges every entry
 * lexically and at its canonical location, and the caller refuses before
 * changing anything.
 */

/** Base-shapes record file names (base-shapes rule 7), plus `task.json`. */
export const RECORD_FILE_NAMES: ReadonlySet<string> = new Set([
  "entity.json",
  "source.json",
  "note.json",
  "reference.json",
  "project.json",
  "session.json",
  "task.json",
]);

/**
 * Docs-owned files: a bundle's doc.json, a flat `*.doc.json`, its
 * annotations/proposals sidecars, Canvas and Sequence sidecars, and atomic-write
 * temp files. They are never knowledge-base records, whatever folder holds them.
 */
export function isDocsOwnedFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === "doc.json" ||
    lower.endsWith(".doc.json") ||
    lower === "annotations.json" ||
    lower === "proposals.json" ||
    lower.endsWith(".canvas.json") ||
    lower.endsWith(".sequence.json") ||
    /\.tmp-[0-9a-f-]{36}$/.test(lower)
  );
}

/**
 * True for a docs-root-relative path that names a base-shapes record file:
 * a record file name (note.json, entity.json, ...) anywhere, or a Task record,
 * which is one `<slug>.json` file directly in a Task store folder named
 * `tasks/` (base-shapes rule 4 and the Stores table). A docs page folder that
 * happens to be named `tasks` is no Task store: its doc.json and docs-owned
 * sidecars are never records, and nothing inside a bundle's `assets/` folder
 * is. A non-docs `<slug>.json` directly in a `tasks/` folder stays a protected
 * Task record even when the folder also holds a doc.json: a refused whole-folder
 * operation is recoverable, a carried-away Task is not.
 */
export function isRecordFilePath(relPath: string): boolean {
  const segments = relPath.replaceAll("\\", "/").split("/").filter(Boolean);
  const name = segments.at(-1);
  if (!name) return false;
  if (RECORD_FILE_NAMES.has(name)) return true;
  if (segments.at(-2) !== "tasks" || !name.toLowerCase().endsWith(".json")) return false;
  if (isDocsOwnedFileName(name)) return false;
  if (segments.slice(0, -2).includes("assets")) return false;
  return true;
}

export type WholeFolderGuardFindings = {
  /** Record files in the subtree (docs-root-relative). */
  records: string[];
  /** Excluded paths in the subtree (docs-root-relative; the walk stops at each). */
  excluded: string[];
  /** Topmost subtree paths that would become excluded at the destination (destination paths). */
  excludedAtDestination: string[];
};

export type WholeFolderGuardResult =
  | { ok: true; findings: WholeFolderGuardFindings }
  | { ok: false; status: number; detail: string; findings: WholeFolderGuardFindings };

const MAX_LISTED = 20;

function listed(paths: string[]): string {
  const shown = paths.slice(0, MAX_LISTED).join(", ");
  return paths.length > MAX_LISTED ? `${shown}, and ${paths.length - MAX_LISTED} more` : shown;
}

/**
 * Inspects the folder `folderRel` (docs-root-relative) before a whole-folder
 * operation. `destination` is the folder's docs-root-relative destination for
 * a move or rename. Refuses with 409 when the subtree holds a record file and
 * 403 when the subtree holds an excluded path or would put a path under an
 * excluded one at the destination. A missing folder passes (the caller
 * reports its own 404).
 */
export async function guardWholeFolderOperation(
  docsRoot: string,
  folderRel: string,
  options: { operation: string; destination?: string },
): Promise<WholeFolderGuardResult> {
  const folder = folderRel.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  const destination = options.destination?.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  const findings: WholeFolderGuardFindings = { records: [], excluded: [], excludedAtDestination: [] };
  const atDestination = (rel: string) =>
    destination === undefined ? undefined : `${destination}${rel.slice(folder.length)}`;

  // The folder and its destination, lexically and at their canonical locations.
  const source = checkDocsPath(docsRoot, folder, "rename-from");
  if (!source.ok) {
    if (source.reason !== "excluded") {
      return { ok: false, status: source.status, detail: `Cannot ${options.operation} ${folder}: ${source.detail}`, findings };
    }
    findings.excluded.push(folder);
  }
  let destinationCanonical: string | undefined;
  if (destination !== undefined) {
    const target = checkDocsPath(docsRoot, destination, "rename-to");
    if (!target.ok) {
      if (target.reason !== "excluded") {
        return { ok: false, status: target.status, detail: `Cannot ${options.operation} ${folder} to ${destination}: ${target.detail}`, findings };
      }
      findings.excludedAtDestination.push(destination);
    } else {
      destinationCanonical = target.canonicalRel;
    }
  }
  const excludedAt = (base: string | undefined, suffix: string) =>
    base !== undefined && isExcludedUnderDocsRoot(docsRoot, `${base}${suffix}`);

  const fs = docsFs(docsRoot);
  const walk = async (dirRel: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdirClassified(dirRel);
    } catch (error) {
      if (isDocsPathRefusal(error)) {
        findings.excluded.push(dirRel);
        return;
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return;
      throw error;
    }
    for (const item of entries) {
      const rel = item.rel;
      // Judged at the stored names too: a caller's `Places/Area/TASKS` spelling of `places/area/tasks`
      // on a case-insensitive volume still finds the Task records below it.
      if (isRecordFilePath(rel) || isRecordFilePath(item.canonicalRel)) findings.records.push(rel);
      if (item.excluded) {
        findings.excluded.push(rel);
        continue;
      }
      const suffix = rel.slice(folder.length);
      const moved = atDestination(rel);
      if (moved !== undefined && (isExcludedUnderDocsRoot(docsRoot, moved) || excludedAt(destinationCanonical, suffix))) {
        // The topmost path that would land on an excluded one stands for its subtree.
        findings.excludedAtDestination.push(moved);
        continue;
      }
      // Dirent types come from lstat: a symbolic link is an entry, never a folder to enter.
      if (item.entry.isDirectory()) await walk(rel);
    }
  };
  if (findings.excluded.length === 0) await walk(folder);

  if (findings.excluded.length > 0 || findings.excludedAtDestination.length > 0) {
    const parts = [
      ...(findings.excluded.length ? [`it holds paths this docs project excludes (${listed(findings.excluded)})`] : []),
      ...(findings.excludedAtDestination.length
        ? [`its contents would land on excluded paths (${listed(findings.excludedAtDestination)})`]
        : []),
    ];
    return {
      ok: false,
      status: 403,
      detail: `Cannot ${options.operation} ${folder} as a whole folder: ${parts.join("; ")}.`,
      findings,
    };
  }
  if (findings.records.length > 0) {
    return {
      ok: false,
      status: 409,
      detail:
        `Cannot ${options.operation} ${folder} as a whole folder: it holds knowledge-base record files ` +
        `(${listed(findings.records)}). Records belong to their own stores; move or remove them with the ` +
        `knowledge-base tools first.`,
      findings,
    };
  }
  return { ok: true, findings };
}
