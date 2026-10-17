import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import {
  moveDocBundle,
  type MoveDocFailure,
  type MoveDocResult,
} from "@codecaine-ai/docs-index/move-doc";
import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";
import {
  checkDocsPath,
  docsFs,
  isDocsPathRefusal,
  type DocsFs,
  type DocsPreflightTarget,
} from "@codecaine-ai/docs-index/safe-path";
import { guardWholeFolderOperation } from "@codecaine-ai/docs-index/subtree-guard";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { serializeDocDocument } from "@codecaine-ai/docs-model/doc-schema";

import { getBacklinksDb } from "../backlinks-cache";
import { applyDocOpsToBundle } from "../doc-ops";
import type { DocChangeSetTreeOp } from "./changesets-sidecar";

/** One byte-for-byte file captured before a bundle deletion. */
export type DeletedBundleFile = {
  relativePath: string;
  bytes: Uint8Array;
};

/**
 * Inverses are deliberately filesystem-level descriptors held in the
 * process-local patch ledger for change-set undo and rollback. Durable
 * recovery evidence lives on disk beside them: a deleted bundle is moved, not
 * removed, into `.changesets/tree-journal/<id>/deleted` with a manifest of
 * its file hashes, and a create only ever adds `doc.json` (the change-set
 * record names it).
 *
 * Every filesystem access goes through the docs-root chokepoint
 * (@codecaine-ai/docs-index/safe-path). Each operation and each inverse
 * preflights every target it will create, write, remove or rename (canonical
 * location inside the served root, outside every governing excluded path)
 * before its first change; the guarded operations check again at each
 * system call.
 */
export type TreeOpInverse =
  | {
      kind: "restore-created-doc";
      docPath: string;
      directoryExisted: boolean;
      directories: string[];
      files: DeletedBundleFile[];
      createdParentDirectories: string[];
      /** sha256 of the doc.json bytes the create wrote; undo refuses once they changed. */
      createdDocSha256: string;
      /** Record files (note.json, ...) already in the folder; undo never touches them. */
      recordFiles: string[];
    }
  | {
      kind: "restore-doc";
      docPath: string;
      directories: string[];
      files: DeletedBundleFile[];
      /** Docs-root-relative durable journal holding the deleted folder and its manifest. */
      journal?: string;
    }
  | {
      kind: "move-doc";
      from: string;
      to: string;
      createdParentDirectories: string[];
    };

type TreeOpError = {
  ok: false;
  status: number;
  detail: string;
  failures?: MoveDocFailure[];
};

export type CreateDocBundleResult =
  | {
      ok: true;
      docPath: string;
      document: DocDocument;
      inverse: Extract<TreeOpInverse, { kind: "restore-created-doc" }>;
    }
  | TreeOpError;

export type DeleteDocBundleResult =
  | {
      ok: true;
      docPath: string;
      inverse: Extract<TreeOpInverse, { kind: "restore-doc" }>;
    }
  | TreeOpError;

export type MoveDocTreeBundleResult =
  | {
      ok: true;
      moved: { fromPath: string; toPath: string };
      rewrittenSources: string[];
      failures: MoveDocFailure[];
      inverse: Extract<TreeOpInverse, { kind: "move-doc" }>;
    }
  | TreeOpError;

export type ExecuteTreeOpResult =
  | CreateDocBundleResult
  | DeleteDocBundleResult
  | MoveDocTreeBundleResult;

export type ReplayTreeOpInverseResult =
  | { ok: true; failures?: MoveDocFailure[] }
  | TreeOpError;

/** Deterministic minimal document shared by split staging and create-doc accept. */
export function createEmptyDocDocument(docPath: string, title: string): DocDocument {
  return {
    schemaVersion: 1,
    id: `doc-${createHash("sha256").update(docPath).digest("hex").slice(0, 32)}`,
    title,
    root: "root",
    blocks: {
      root: {
        id: "root",
        type: "paragraph",
        props: {},
        children: [],
      },
    },
  };
}

/**
 * Base-shapes record files a doc may be created beside. create-doc accepts a
 * folder that holds only these (and proposals.json); the record file is never
 * captured, rewritten or removed, by the create or by its undo.
 */
export const DOC_BESIDE_RECORD_FILES: ReadonlySet<string> = new Set([
  "entity.json",
  "session.json",
  "project.json",
  "source.json",
  "reference.json",
  "note.json",
  "task.json",
]);

/** A bundle-relative path naming a top-level record file. */
function isBesideRecordFile(relativePath: string): boolean {
  return !relativePath.includes("/") && DOC_BESIDE_RECORD_FILES.has(relativePath);
}

/**
 * A 403 when the chokepoint refuses `docPath`: the project's `exclude` globs
 * match it (lexically or at its canonical location), or a symbolic link
 * carries it out of the docs root.
 */
function excludedPathError(docsRoot: string, docPath: string): TreeOpError | null {
  const checked = checkDocsPath(docsRoot, docPath, "read");
  if (checked.ok || checked.status !== 403) return null;
  return { ok: false, status: 403, detail: checked.detail };
}

/** A refusal before any change when the chokepoint refuses one of `targets`. */
function preflightError(fs: DocsFs, targets: DocsPreflightTarget[]): TreeOpError | null {
  const preflight = fs.preflight(targets);
  return preflight.ok ? null : { ok: false, status: preflight.status, detail: preflight.detail };
}

/** A refused system call as a tree-op error; anything else is rethrown. */
function refusalError(error: unknown): TreeOpError {
  if (isDocsPathRefusal(error)) return { ok: false, status: error.status, detail: error.message };
  throw error;
}

type ResolvedBundlePath = {
  docPath: string;
  bundleAbs: string;
  jsonAbs: string;
};

/**
 * Resolve only directory-style bundles. Standalone `*.doc.json` files and
 * the docs root itself are intentionally excluded: a tree op must never
 * remove or restore the whole corpus directory.
 */
function resolveBundlePath(docsRoot: string, docPath: string): ResolvedBundlePath | null {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, docPath);
  if (!jsonAbs || basename(jsonAbs).toLowerCase() !== "doc.json") return null;

  const rootAbs = resolve(docsRoot);
  const bundleAbs = resolve(dirname(jsonAbs));
  if (bundleAbs === rootAbs || !bundleAbs.startsWith(`${rootAbs}${sep}`)) return null;

  return {
    docPath: relative(rootAbs, bundleAbs).split(sep).join("/"),
    bundleAbs,
    jsonAbs: resolve(jsonAbs),
  };
}

/** lstat existence through the chokepoint; a refused target throws. */
async function pathExists(fs: DocsFs, absPath: string): Promise<boolean> {
  try {
    await fs.lstat(absPath);
    return true;
  } catch (error) {
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) return false;
    throw error;
  }
}

/** Records absent ancestors that a recursive mkdir may create below docsRoot. */
async function missingParentDirectories(docsRoot: string, bundleAbs: string): Promise<string[]> {
  const rootAbs = resolve(docsRoot);
  const fs = docsFs(docsRoot);
  const missing: string[] = [];
  let current = dirname(bundleAbs);
  while (current !== rootAbs) {
    if (await pathExists(fs, current)) break;
    missing.push(relative(rootAbs, current).split(sep).join("/"));
    current = dirname(current);
  }
  return missing;
}

async function removeCreatedParentDirectories(
  docsRoot: string,
  paths: string[],
): Promise<ReplayTreeOpInverseResult> {
  const rootAbs = resolve(docsRoot);
  const fs = docsFs(docsRoot);
  const deepestFirst = [...paths].sort(
    (left, right) => right.split("/").length - left.split("/").length,
  );
  const refused = preflightError(fs, deepestFirst.map((path) => ({ path, intent: "remove" as const })));
  if (refused) return refused;
  for (const path of deepestFirst) {
    if (!isSafeSnapshotPath(path)) {
      return { ok: false, status: 422, detail: "Tree inverse contains an invalid parent path." };
    }
    const directoryAbs = resolve(rootAbs, path);
    if (!directoryAbs.startsWith(`${rootAbs}${sep}`)) {
      return { ok: false, status: 422, detail: "Tree inverse contains an invalid parent path." };
    }
    try {
      await fs.rmdir(directoryAbs);
    } catch (error) {
      if (isDocsPathRefusal(error)) return refusalError(error);
      if (isNodeError(error) && error.code === "ENOENT") continue;
      if (isNodeError(error) && error.code === "ENOTEMPTY") {
        return {
          ok: false,
          status: 409,
          detail: `Cannot restore the original tree: created parent is no longer empty (${path})`,
        };
      }
      return {
        ok: false,
        status: 500,
        detail: `Failed to remove created parent directory ${path}: ${errorDetail(error)}`,
      };
    }
  }
  return { ok: true };
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Creates a minimal valid bundle with one empty root block. */
export async function createDocBundle(
  docsRoot: string,
  docPath: string,
  title: string,
): Promise<CreateDocBundleResult> {
  const excluded = excludedPathError(docsRoot, docPath);
  if (excluded) return excluded;
  const target = resolveBundlePath(docsRoot, docPath);
  if (!target) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${docPath}` };
  }

  const fs = docsFs(docsRoot);
  // Every target the create may make, before the first change.
  const refused = preflightError(fs, [
    { path: dirname(target.bundleAbs), intent: "mkdir" },
    { path: target.bundleAbs, intent: "mkdir" },
    { path: target.jsonAbs, intent: "write" },
  ]);
  if (refused) return refused;

  try {
    const directoryExisted = await pathExists(fs, target.bundleAbs);
    const createdParentDirectories = directoryExisted
      ? []
      : await missingParentDirectories(docsRoot, target.bundleAbs);
    let previous: BundleSnapshot = { directories: [], files: [] };
    let recordFiles: string[] = [];
    if (directoryExisted) {
      if (await pathExists(fs, target.jsonAbs)) {
        return { ok: false, status: 409, detail: `A doc bundle already exists at ${docPath}` };
      }
      // Pending proposals and base-shapes record files may already sit in the
      // folder; anything else (an excluded entry included) is a different path
      // and still conflicts.
      const pendingEntries = await fs.readdirClassified(target.bundleAbs);
      if (pendingEntries.some((item) =>
        item.excluded ||
        (item.name !== "proposals.json" &&
          !(item.entry.isFile() && DOC_BESIDE_RECORD_FILES.has(item.name))))) {
        return { ok: false, status: 409, detail: `A path already exists at ${docPath}` };
      }
      const snapshot = await snapshotBundle(fs, target.bundleAbs);
      if ("ok" in snapshot) return snapshot;
      // Record files stay out of the inverse: undo leaves them as they are then.
      previous = {
        directories: snapshot.directories,
        files: snapshot.files.filter((file) => !isBesideRecordFile(file.relativePath)),
      };
      recordFiles = snapshot.files
        .filter((file) => isBesideRecordFile(file.relativePath))
        .map((file) => file.relativePath);
    } else {
      await fs.mkdir(dirname(target.bundleAbs), { recursive: true });
      try {
        await fs.mkdir(target.bundleAbs);
      } catch (error) {
        if (isNodeError(error) && error.code === "EEXIST") {
          return { ok: false, status: 409, detail: `A path already exists at ${docPath}` };
        }
        throw error;
      }
    }

    const document = createEmptyDocDocument(target.docPath, title);
    const serialized = serializeDocDocument(document);
    const inverse: Extract<TreeOpInverse, { kind: "restore-created-doc" }> = {
      kind: "restore-created-doc",
      docPath: target.docPath,
      directoryExisted,
      directories: previous.directories,
      files: previous.files,
      createdParentDirectories,
      createdDocSha256: sha256(serialized),
      recordFiles,
    };

    try {
      await fs.atomicWrite(target.jsonAbs, serialized);
    } catch (error) {
      const restored = await restoreCreatedDocBundle(docsRoot, inverse);
      if (!restored.ok) {
        return {
          ok: false,
          status: 500,
          detail: `Failed to create doc bundle: ${errorDetail(error)}; ${restored.detail}`,
        };
      }
      throw error;
    }

    return {
      ok: true,
      docPath: target.docPath,
      document,
      inverse,
    };
  } catch (error) {
    if (isDocsPathRefusal(error)) return refusalError(error);
    return { ok: false, status: 500, detail: `Failed to create doc bundle: ${errorDetail(error)}` };
  }
}

type BundleSnapshot = {
  directories: string[];
  files: DeletedBundleFile[];
  nestedBundlePath?: string;
};

/**
 * Captures every regular file recursively and rejects symlinks, special
 * files and excluded entries (the chokepoint judges each entry lexically and
 * at its canonical location).
 */
async function snapshotBundle(fs: DocsFs, bundleAbs: string): Promise<BundleSnapshot | TreeOpError> {
  const directories: string[] = [];
  const files: DeletedBundleFile[] = [];
  let nestedBundlePath: string | undefined;

  const walk = async (directoryAbs: string, directoryRel: string): Promise<TreeOpError | null> => {
    const entries = await fs.readdirClassified(directoryAbs);
    for (const { entry, excluded, rel } of entries) {
      const entryRel = directoryRel ? `${directoryRel}/${entry.name}` : entry.name;
      const entryAbs = join(directoryAbs, entry.name);
      if (excluded) {
        return { ok: false, status: 403, detail: `Doc bundle holds a path this docs project excludes: ${rel}` };
      }
      if (entry.isSymbolicLink()) {
        return {
          ok: false,
          status: 422,
          detail: `Doc bundle contains an unsupported symbolic link: ${entryRel}`,
        };
      }
      if (entry.isDirectory()) {
        directories.push(entryRel);
        const failure = await walk(entryAbs, entryRel);
        if (failure) return failure;
        continue;
      }
      if (!entry.isFile()) {
        return {
          ok: false,
          status: 422,
          detail: `Doc bundle contains an unsupported filesystem entry: ${entryRel}`,
        };
      }
      if (directoryRel && entry.name.toLowerCase() === "doc.json") {
        nestedBundlePath = directoryRel;
      }
      files.push({ relativePath: entryRel, bytes: new Uint8Array(await fs.readFile(entryAbs)) });
    }
    return null;
  };

  try {
    const failure = await walk(bundleAbs, "");
    if (failure) return failure;
    return { directories, files, nestedBundlePath };
  } catch (error) {
    if (isDocsPathRefusal(error)) return refusalError(error);
    return {
      ok: false,
      status: 500,
      detail: `Failed to capture doc bundle: ${errorDetail(error)}`,
    };
  }
}

/** Deletes a bundle after capturing byte-identical contents for rollback. */
export async function deleteDocBundle(
  docsRoot: string,
  docPath: string,
): Promise<DeleteDocBundleResult> {
  const excluded = excludedPathError(docsRoot, docPath);
  if (excluded) return excluded;
  const target = resolveBundlePath(docsRoot, docPath);
  if (!target) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${docPath}` };
  }

  const fs = docsFs(docsRoot);
  try {
    if (!(await pathExists(fs, target.jsonAbs))) {
      return { ok: false, status: 404, detail: `No doc bundle found at ${docPath}` };
    }
  } catch (error) {
    if (isDocsPathRefusal(error)) return refusalError(error);
    return { ok: false, status: 500, detail: `Failed to inspect doc bundle: ${errorDetail(error)}` };
  }

  // The whole folder goes: refuse before any change when it holds a
  // knowledge-base record file (note.json, entity.json, tasks/*.json, ...)
  // or a path the project excludes.
  let guard;
  try {
    guard = await guardWholeFolderOperation(docsRoot, target.docPath, { operation: "delete" });
  } catch (error) {
    return { ok: false, status: 500, detail: `Failed to inspect doc bundle: ${errorDetail(error)}` };
  }
  if (!guard.ok) return { ok: false, status: guard.status, detail: guard.detail };

  const snapshot = await snapshotBundle(fs, target.bundleAbs);
  if ("ok" in snapshot) return snapshot;
  if (snapshot.nestedBundlePath) {
    return {
      ok: false,
      status: 409,
      detail: `Cannot delete ${docPath}: nested doc bundle exists at ${snapshot.nestedBundlePath}`,
    };
  }

  const journaled = await journalDeletedBundle(docsRoot, target, snapshot);
  if ("ok" in journaled) return journaled;

  return {
    ok: true,
    docPath: target.docPath,
    inverse: {
      kind: "restore-doc",
      docPath: target.docPath,
      directories: snapshot.directories,
      files: snapshot.files,
      journal: journaled.journal,
    },
  };
}

const TREE_JOURNAL_DIR = ".changesets/tree-journal";

/**
 * Durable recovery evidence for a bundle deletion: the folder is moved (not
 * removed) into `.changesets/tree-journal/<id>/deleted`, next to a manifest
 * that names the doc path and every file's sha256. The bytes therefore
 * survive a service restart, which the in-memory undo ledger does not.
 */
async function journalDeletedBundle(
  docsRoot: string,
  target: ResolvedBundlePath,
  snapshot: BundleSnapshot,
): Promise<{ journal: string } | TreeOpError> {
  const rootAbs = resolve(docsRoot);
  const fs = docsFs(docsRoot);
  const id = randomUUID();
  const journal = `${TREE_JOURNAL_DIR}/${id}`;
  const journalAbs = join(rootAbs, journal);
  // The folder leaves, the journal receives it: every target before the first change.
  const refused = preflightError(fs, [
    { path: target.bundleAbs, intent: "rename-from" },
    { path: journalAbs, intent: "mkdir" },
    { path: join(journalAbs, "manifest.json"), intent: "write" },
    { path: join(journalAbs, "deleted"), intent: "rename-to" },
  ]);
  if (refused) return refused;
  try {
    for (const segment of [".changesets", TREE_JOURNAL_DIR]) {
      const segmentAbs = join(rootAbs, segment);
      if ((await pathExists(fs, segmentAbs)) && (await fs.lstat(segmentAbs)).isSymbolicLink()) {
        return { ok: false, status: 422, detail: `Recovery journal folder is a symbolic link: ${segment}` };
      }
    }
    await fs.mkdir(journalAbs, { recursive: true });
    const manifest = {
      id,
      kind: "delete-doc",
      docPath: target.docPath,
      deletedAt: new Date().toISOString(),
      directories: snapshot.directories,
      files: snapshot.files.map((file) => ({ path: file.relativePath, sha256: sha256(file.bytes) })),
    };
    await fs.writeFile(join(journalAbs, "manifest.json"), `${JSON.stringify({ ...manifest, status: "prepared" }, null, 2)}\n`);
    await fs.rename(target.bundleAbs, join(journalAbs, "deleted"));
    await fs.writeFile(join(journalAbs, "manifest.json"), `${JSON.stringify({ ...manifest, status: "deleted" }, null, 2)}\n`);
    return { journal };
  } catch (error) {
    if (!(await pathExists(fs, target.bundleAbs).catch(() => true)) && (await pathExists(fs, join(journalAbs, "deleted")).catch(() => false))) {
      await fs.rename(join(journalAbs, "deleted"), target.bundleAbs).catch(() => undefined);
    }
    if (isDocsPathRefusal(error)) return refusalError(error);
    return { ok: false, status: 500, detail: `Failed to delete doc bundle: ${errorDetail(error)}` };
  }
}

function isSafeSnapshotPath(relativePath: string): boolean {
  if (!relativePath || relativePath.includes("\0")) return false;
  if (relativePath.startsWith("/") || relativePath.startsWith("\\")) return false;
  return relativePath
    .split(/[\\/]/)
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function hasSafeSnapshotPaths(directories: string[], files: DeletedBundleFile[]): boolean {
  return directories.every(isSafeSnapshotPath) &&
    files.every((file) => isSafeSnapshotPath(file.relativePath));
}

/**
 * Reconciles an existing directory to a byte-identical captured snapshot.
 * Files `preserve` accepts are neither removed nor written.
 */
async function restoreBundleContents(
  fs: DocsFs,
  bundleAbs: string,
  directories: string[],
  files: DeletedBundleFile[],
  preserve: (relativePath: string) => boolean = () => false,
): Promise<TreeOpError | null> {
  const current = await snapshotBundle(fs, bundleAbs);
  if ("ok" in current) return current;

  const expectedDirectories = new Set(directories);
  const expectedFiles = new Set(files.map((file) => file.relativePath));
  const removedFiles = current.files.filter((file) => !expectedFiles.has(file.relativePath) && !preserve(file.relativePath));
  const removedDirectories = current.directories.filter((directory) => !expectedDirectories.has(directory));
  const writtenFiles = files.filter((file) => !preserve(file.relativePath));
  // Every removal (unlink inverses included) and every write, before the first change.
  const refused = preflightError(fs, [
    ...removedFiles.map((file) => ({ path: join(bundleAbs, file.relativePath), intent: "remove" as const })),
    ...removedDirectories.map((directory) => ({ path: join(bundleAbs, directory), intent: "remove" as const })),
    ...directories.map((directory) => ({ path: join(bundleAbs, directory), intent: "mkdir" as const })),
    ...writtenFiles.map((file) => ({ path: join(bundleAbs, file.relativePath), intent: "write" as const })),
  ]);
  if (refused) return refused;
  try {
    for (const file of removedFiles) {
      await fs.rm(join(bundleAbs, file.relativePath));
    }
    for (const directory of [...removedDirectories].sort(
      (left, right) => right.split("/").length - left.split("/").length,
    )) {
      await fs.rm(join(bundleAbs, directory), { recursive: true });
    }

    for (const directory of [...directories].sort(
      (left, right) => left.split("/").length - right.split("/").length,
    )) {
      const directoryAbs = join(bundleAbs, directory);
      if (await pathExists(fs, directoryAbs)) {
        const stat = await fs.lstat(directoryAbs);
        if (!stat.isDirectory()) await fs.rm(directoryAbs);
      }
      await fs.mkdir(directoryAbs, { recursive: true });
    }
    for (const file of writtenFiles) {
      const fileAbs = join(bundleAbs, file.relativePath);
      if (await pathExists(fs, fileAbs)) {
        const stat = await fs.lstat(fileAbs);
        if (!stat.isFile()) await fs.rm(fileAbs, { recursive: true });
      }
      await fs.mkdir(dirname(fileAbs), { recursive: true });
      await fs.writeFile(fileAbs, file.bytes);
    }
    return null;
  } catch (error) {
    if (isDocsPathRefusal(error)) return refusalError(error);
    return {
      ok: false,
      status: 500,
      detail: `Failed to restore prior bundle contents: ${errorDetail(error)}`,
    };
  }
}

/**
 * Everything in the created bundle's folder (and in the parent folders the
 * create made) that the create did not make and the inverse will not
 * restore: later documents, annotations, assets, nested bundles, record
 * files, or an edited doc.json. Undo refuses on any of them before changing
 * anything, so it never removes record-owned content or later additions.
 */
async function laterAdditions(
  docsRoot: string,
  target: ResolvedBundlePath,
  inverse: Extract<TreeOpInverse, { kind: "restore-created-doc" }>,
): Promise<{ additions: string[] } | TreeOpError> {
  const additions: string[] = [];
  const fs = docsFs(docsRoot);
  if (await pathExists(fs, target.bundleAbs)) {
    const current = await snapshotBundle(fs, target.bundleAbs);
    if ("ok" in current) return current;
    const priorFiles = new Set(inverse.files.map((file) => file.relativePath));
    const priorDirectories = new Set(inverse.directories);
    const records = new Set(inverse.recordFiles);
    for (const directory of current.directories) {
      if (!priorDirectories.has(directory)) additions.push(`${inverse.docPath}/${directory}/`);
    }
    for (const file of current.files) {
      if (file.relativePath === "doc.json") {
        if (sha256(file.bytes) !== inverse.createdDocSha256) additions.push(`${inverse.docPath}/doc.json (edited since the create)`);
        continue;
      }
      if (priorFiles.has(file.relativePath) || records.has(file.relativePath)) continue;
      additions.push(`${inverse.docPath}/${file.relativePath}`);
    }
  }
  // Parent folders the create made hold only the next folder of the chain.
  const rootAbs = resolve(docsRoot);
  const chain = [target.docPath, ...[...inverse.createdParentDirectories].sort(
    (left, right) => right.split("/").length - left.split("/").length,
  )];
  for (let index = 1; index < chain.length; index += 1) {
    const parent = chain[index];
    if (!isSafeSnapshotPath(parent)) {
      return { ok: false, status: 422, detail: "Tree inverse contains an invalid parent path." };
    }
    let entries;
    try {
      // Excluded entries count as additions too: undo never removes a folder holding them.
      entries = (await fs.readdirClassified(join(rootAbs, parent))).map((item) => item.name);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") continue;
      throw error;
    }
    const expected = basename(chain[index - 1]);
    for (const name of entries) if (name !== expected) additions.push(`${parent}/${name}`);
  }
  return { additions };
}

/**
 * Restores the bundle-directory state captured immediately before create-doc:
 * removes the created doc.json (and the folders the create made) and restores
 * the prior proposals.json. Refuses with 409 before any change when anything
 * the create did not make is present. Base-shapes record files that sat in
 * the folder before the create are never removed or rewritten.
 */
async function restoreCreatedDocBundle(
  docsRoot: string,
  inverse: Extract<TreeOpInverse, { kind: "restore-created-doc" }>,
): Promise<ReplayTreeOpInverseResult> {
  const excluded = excludedPathError(docsRoot, inverse.docPath);
  if (excluded) return excluded;
  const target = resolveBundlePath(docsRoot, inverse.docPath);
  if (!target) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${inverse.docPath}` };
  }
  if (!hasSafeSnapshotPaths(inverse.directories, inverse.files)) {
    return { ok: false, status: 422, detail: "Created bundle snapshot contains an invalid path." };
  }

  const fs = docsFs(docsRoot);
  // The created doc.json and folder, and the parents the create made, before the first change.
  const refused = preflightError(fs, [
    { path: target.jsonAbs, intent: "remove" },
    ...(inverse.directoryExisted ? [] : [{ path: target.bundleAbs, intent: "remove" as const }]),
    ...inverse.createdParentDirectories.map((path) => ({ path, intent: "remove" as const })),
  ]);
  if (refused) return refused;

  try {
    const found = await laterAdditions(docsRoot, target, inverse);
    if ("ok" in found) return found;
    if (found.additions.length > 0) {
      const shown = found.additions.slice(0, 20).join(", ");
      return {
        ok: false,
        status: 409,
        detail:
          `Cannot undo the create of ${inverse.docPath}: it now holds content the create did not make ` +
          `(${shown}${found.additions.length > 20 ? `, and ${found.additions.length - 20} more` : ""}). ` +
          "Undo those changes first; nothing was changed.",
      };
    }
    if (!inverse.directoryExisted) {
      await fs.rm(target.jsonAbs, { force: true });
      try {
        await fs.rmdir(target.bundleAbs);
      } catch (error) {
        if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
      }
    } else {
      if (!(await pathExists(fs, target.bundleAbs))) {
        await fs.mkdir(target.bundleAbs, { recursive: true });
      }
      const records = new Set(inverse.recordFiles);
      const failure = await restoreBundleContents(
        fs,
        target.bundleAbs,
        inverse.directories,
        inverse.files,
        (relativePath) => records.has(relativePath),
      );
      if (failure) return failure;
    }
  } catch (error) {
    if (isDocsPathRefusal(error)) return refusalError(error);
    return {
      ok: false,
      status: 500,
      detail: `Failed to restore created doc bundle: ${errorDetail(error)}`,
    };
  }

  return removeCreatedParentDirectories(docsRoot, inverse.createdParentDirectories);
}

/** Restore into a sibling temp directory, then rename the completed snapshot into place. */
async function restoreDeletedDocBundle(
  docsRoot: string,
  inverse: Extract<TreeOpInverse, { kind: "restore-doc" }>,
): Promise<ReplayTreeOpInverseResult> {
  const excluded = excludedPathError(docsRoot, inverse.docPath);
  if (excluded) return excluded;
  const target = resolveBundlePath(docsRoot, inverse.docPath);
  if (!target) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${inverse.docPath}` };
  }
  if (!hasSafeSnapshotPaths(inverse.directories, inverse.files)) {
    return { ok: false, status: 422, detail: "Deleted bundle snapshot contains an invalid path." };
  }

  const fs = docsFs(docsRoot);
  const tempAbs = `${target.bundleAbs}.restore-${randomUUID()}`;
  // The landing folder, the temp folder and every restored file, before the first change.
  const refused = preflightError(fs, [
    { path: dirname(target.bundleAbs), intent: "mkdir" },
    { path: tempAbs, intent: "mkdir" },
    { path: target.bundleAbs, intent: "rename-to" },
    ...inverse.directories.map((directory) => ({ path: join(target.bundleAbs, directory), intent: "mkdir" as const })),
    ...inverse.files.map((file) => ({ path: join(target.bundleAbs, file.relativePath), intent: "write" as const })),
  ]);
  if (refused) return refused;
  try {
    if (await pathExists(fs, target.bundleAbs)) {
      return {
        ok: false,
        status: 409,
        detail: `Cannot restore ${inverse.docPath}: the destination already exists`,
      };
    }

    await fs.mkdir(dirname(target.bundleAbs), { recursive: true });
    await fs.mkdir(tempAbs);
    const directories = [...inverse.directories].sort(
      (left, right) => left.split("/").length - right.split("/").length,
    );
    for (const directory of directories) {
      await fs.mkdir(join(tempAbs, directory), { recursive: true });
    }
    for (const file of inverse.files) {
      const fileAbs = join(tempAbs, file.relativePath);
      await fs.mkdir(dirname(fileAbs), { recursive: true });
      await fs.writeFile(fileAbs, file.bytes);
    }
    await fs.rename(tempAbs, target.bundleAbs);
  } catch (error) {
    await fs.rm(tempAbs, { recursive: true, force: true }).catch(() => undefined);
    if (isDocsPathRefusal(error)) return refusalError(error);
    return { ok: false, status: 500, detail: `Failed to restore doc bundle: ${errorDetail(error)}` };
  }
  // The bundle is back in place: its durable deletion journal is spent.
  if (inverse.journal && isSafeSnapshotPath(inverse.journal) && inverse.journal.startsWith(`${TREE_JOURNAL_DIR}/`)) {
    await fs.rm(inverse.journal, { recursive: true, force: true }).catch(() => undefined);
  }
  return { ok: true };
}

/** Store-equivalent dependency adapter for docs-index's non-atomic move primitive. */
async function executeMove(
  docsRoot: string,
  from: string,
  to: string,
): Promise<MoveDocResult> {
  try {
    const backlinksDb = await getBacklinksDb(docsRoot);
    return await moveDocBundle(docsRoot, from, to, {
      applyDocOps: (docsRootArg, path, ops, expectedHash, _projectId) =>
        applyDocOpsToBundle(docsRootArg, path, ops, expectedHash, undefined),
      // Rewrites go through the docs-root chokepoint: a source that is excluded,
      // or that a symbolic link carries into an excluded folder or out of the
      // root, is refused at the read and at the write.
      loadCanvas: async (docsRootArg, canvasRelPath) => {
        try {
          const raw = await docsFs(docsRootArg).readFile(canvasRelPath, "utf8");
          return { ok: true, canvas: JSON.parse(raw) as InteractiveCanvasDocument };
        } catch (error) {
          return { ok: false, reason: errorDetail(error) };
        }
      },
      saveCanvas: async (docsRootArg, canvasRelPath, canvas) => {
        try {
          await docsFs(docsRootArg).atomicWrite(
            canvasRelPath,
            `${JSON.stringify(canvas, null, 2)}\n`,
          );
          return { ok: true };
        } catch (error) {
          return { ok: false, reason: errorDetail(error) };
        }
      },
      backlinksDb,
      projectId: "",
    });
  } catch (error) {
    return { ok: false, status: 500, detail: `Failed to move doc bundle: ${errorDetail(error)}` };
  }
}

/** Moves a bundle and returns a move-back inverse. */
export async function moveDocTreeBundle(
  docsRoot: string,
  from: string,
  to: string,
): Promise<MoveDocTreeBundleResult> {
  const excluded = excludedPathError(docsRoot, from) ?? excludedPathError(docsRoot, to);
  if (excluded) return excluded;
  const target = resolveBundlePath(docsRoot, to);
  if (!target) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${to}` };
  }
  let createdParentDirectories: string[];
  try {
    createdParentDirectories = await missingParentDirectories(docsRoot, target.bundleAbs);
  } catch (error) {
    return { ok: false, status: 500, detail: `Failed to inspect move destination: ${errorDetail(error)}` };
  }
  const moved = await executeMove(docsRoot, from, to);
  if (!moved.ok) return moved;
  return {
    ...moved,
    inverse: {
      kind: "move-doc",
      from: moved.moved.toPath,
      to: moved.moved.fromPath,
      createdParentDirectories,
    },
  };
}

/** Executes a positioned change-set tree op; `position` is ordering metadata only. */
export async function executeTreeOp(
  docsRoot: string,
  op: DocChangeSetTreeOp & { position: number },
): Promise<ExecuteTreeOpResult> {
  switch (op.kind) {
    case "create-doc":
      return createDocBundle(docsRoot, op.docPath, op.title);
    case "delete-doc":
      return deleteDocBundle(docsRoot, op.docPath);
    case "move-doc":
      return moveDocTreeBundle(docsRoot, op.from, op.to);
  }
}

/** Replays one inverse. Move-back residual rewrite failures remain visible to the caller. */
export async function replayTreeOpInverse(
  docsRoot: string,
  inverse: TreeOpInverse,
): Promise<ReplayTreeOpInverseResult> {
  switch (inverse.kind) {
    case "restore-created-doc":
      return restoreCreatedDocBundle(docsRoot, inverse);
    case "restore-doc":
      return restoreDeletedDocBundle(docsRoot, inverse);
    case "move-doc": {
      const moved = await executeMove(docsRoot, inverse.from, inverse.to);
      if (!moved.ok) return moved;
      if (moved.failures.length > 0) return { ok: true, failures: moved.failures };
      return removeCreatedParentDirectories(docsRoot, inverse.createdParentDirectories);
    }
  }
}
