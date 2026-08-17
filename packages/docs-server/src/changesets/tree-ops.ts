import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import {
  moveDocBundle,
  type MoveDocFailure,
  type MoveDocResult,
} from "@codecaine-ai/docs-index/move-doc";
import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { serializeDocDocument } from "@codecaine-ai/docs-model/doc-schema";

import { atomicWriteFile } from "../atomic-write";
import { getBacklinksDb } from "../backlinks-cache";
import { applyDocOpsToBundle } from "../doc-ops";
import type { DocChangeSetTreeOp } from "./changesets-sidecar";

/** One byte-for-byte file captured before a bundle deletion. */
export type DeletedBundleFile = {
  relativePath: string;
  bytes: Uint8Array;
};

/**
 * Inverses are deliberately filesystem-level descriptors. They are retained
 * only for the duration of a change-set accept/rollback; the compound patch
 * ledger continues to contain proposal patch ids, not potentially-large
 * deleted bundle snapshots.
 */
export type TreeOpInverse =
  | { kind: "delete-doc"; docPath: string }
  | {
      kind: "restore-doc";
      docPath: string;
      directories: string[];
      files: DeletedBundleFile[];
    }
  | { kind: "move-doc"; from: string; to: string };

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
      inverse: Extract<TreeOpInverse, { kind: "delete-doc" }>;
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

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await lstat(absPath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
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
  const target = resolveBundlePath(docsRoot, docPath);
  if (!target) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${docPath}` };
  }

  try {
    let createdDirectory = false;
    if (await pathExists(target.bundleAbs)) {
      if (await pathExists(target.jsonAbs)) {
        return { ok: false, status: 409, detail: `A doc bundle already exists at ${docPath}` };
      }
      const pendingEntries = await readdir(target.bundleAbs);
      if (pendingEntries.some((entry) => entry !== "proposals.json")) {
        return { ok: false, status: 409, detail: `A path already exists at ${docPath}` };
      }
    } else {
      await mkdir(dirname(target.bundleAbs), { recursive: true });
      try {
        await mkdir(target.bundleAbs);
        createdDirectory = true;
      } catch (error) {
        if (isNodeError(error) && error.code === "EEXIST") {
          return { ok: false, status: 409, detail: `A path already exists at ${docPath}` };
        }
        throw error;
      }
    }

    const document = createEmptyDocDocument(target.docPath, title);

    try {
      await atomicWriteFile(target.jsonAbs, serializeDocDocument(document));
    } catch (error) {
      // The target directory was created by this call and contains no user
      // state if its sole atomic write failed.
      if (createdDirectory) {
        await rm(target.bundleAbs, { recursive: true, force: true }).catch(() => undefined);
      }
      throw error;
    }

    return {
      ok: true,
      docPath: target.docPath,
      document,
      inverse: { kind: "delete-doc", docPath: target.docPath },
    };
  } catch (error) {
    return { ok: false, status: 500, detail: `Failed to create doc bundle: ${errorDetail(error)}` };
  }
}

type BundleSnapshot = {
  directories: string[];
  files: DeletedBundleFile[];
  nestedBundlePath?: string;
};

/** Captures every regular file recursively and rejects symlinks/special files. */
async function snapshotBundle(bundleAbs: string): Promise<BundleSnapshot | TreeOpError> {
  const directories: string[] = [];
  const files: DeletedBundleFile[] = [];
  let nestedBundlePath: string | undefined;

  const walk = async (directoryAbs: string, directoryRel: string): Promise<TreeOpError | null> => {
    const entries = await readdir(directoryAbs, { withFileTypes: true });
    for (const entry of entries) {
      const entryRel = directoryRel ? `${directoryRel}/${entry.name}` : entry.name;
      const entryAbs = join(directoryAbs, entry.name);
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
      files.push({ relativePath: entryRel, bytes: new Uint8Array(await readFile(entryAbs)) });
    }
    return null;
  };

  try {
    const failure = await walk(bundleAbs, "");
    if (failure) return failure;
    return { directories, files, nestedBundlePath };
  } catch (error) {
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
  const target = resolveBundlePath(docsRoot, docPath);
  if (!target) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${docPath}` };
  }

  try {
    if (!(await pathExists(target.jsonAbs))) {
      return { ok: false, status: 404, detail: `No doc bundle found at ${docPath}` };
    }
  } catch (error) {
    return { ok: false, status: 500, detail: `Failed to inspect doc bundle: ${errorDetail(error)}` };
  }

  const snapshot = await snapshotBundle(target.bundleAbs);
  if ("ok" in snapshot) return snapshot;
  if (snapshot.nestedBundlePath) {
    return {
      ok: false,
      status: 409,
      detail: `Cannot delete ${docPath}: nested doc bundle exists at ${snapshot.nestedBundlePath}`,
    };
  }

  try {
    await rm(target.bundleAbs, { recursive: true });
  } catch (error) {
    return { ok: false, status: 500, detail: `Failed to delete doc bundle: ${errorDetail(error)}` };
  }

  return {
    ok: true,
    docPath: target.docPath,
    inverse: {
      kind: "restore-doc",
      docPath: target.docPath,
      directories: snapshot.directories,
      files: snapshot.files,
    },
  };
}

function isSafeSnapshotPath(relativePath: string): boolean {
  if (!relativePath || relativePath.includes("\0")) return false;
  if (relativePath.startsWith("/") || relativePath.startsWith("\\")) return false;
  return relativePath
    .split(/[\\/]/)
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

/** Restore into a sibling temp directory, then rename the completed snapshot into place. */
async function restoreDeletedDocBundle(
  docsRoot: string,
  inverse: Extract<TreeOpInverse, { kind: "restore-doc" }>,
): Promise<ReplayTreeOpInverseResult> {
  const target = resolveBundlePath(docsRoot, inverse.docPath);
  if (!target) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${inverse.docPath}` };
  }
  if (
    inverse.directories.some((path) => !isSafeSnapshotPath(path)) ||
    inverse.files.some((file) => !isSafeSnapshotPath(file.relativePath))
  ) {
    return { ok: false, status: 422, detail: "Deleted bundle snapshot contains an invalid path." };
  }

  const tempAbs = `${target.bundleAbs}.restore-${randomUUID()}`;
  try {
    if (await pathExists(target.bundleAbs)) {
      return {
        ok: false,
        status: 409,
        detail: `Cannot restore ${inverse.docPath}: the destination already exists`,
      };
    }

    await mkdir(dirname(target.bundleAbs), { recursive: true });
    await mkdir(tempAbs);
    const directories = [...inverse.directories].sort(
      (left, right) => left.split("/").length - right.split("/").length,
    );
    for (const directory of directories) {
      await mkdir(join(tempAbs, directory), { recursive: true });
    }
    for (const file of inverse.files) {
      const fileAbs = join(tempAbs, file.relativePath);
      await mkdir(dirname(fileAbs), { recursive: true });
      await writeFile(fileAbs, file.bytes);
    }
    await rename(tempAbs, target.bundleAbs);
    return { ok: true };
  } catch (error) {
    await rm(tempAbs, { recursive: true, force: true }).catch(() => undefined);
    return { ok: false, status: 500, detail: `Failed to restore doc bundle: ${errorDetail(error)}` };
  }
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
      loadCanvas: async (docsRootArg, canvasRelPath) => {
        try {
          const raw = await readFile(join(docsRootArg, canvasRelPath), "utf8");
          return { ok: true, canvas: JSON.parse(raw) as InteractiveCanvasDocument };
        } catch (error) {
          return { ok: false, reason: errorDetail(error) };
        }
      },
      saveCanvas: async (docsRootArg, canvasRelPath, canvas) => {
        try {
          await atomicWriteFile(
            join(docsRootArg, canvasRelPath),
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
  const moved = await executeMove(docsRoot, from, to);
  if (!moved.ok) return moved;
  return {
    ...moved,
    inverse: { kind: "move-doc", from: moved.moved.toPath, to: moved.moved.fromPath },
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
    case "delete-doc": {
      const deleted = await deleteDocBundle(docsRoot, inverse.docPath);
      return deleted.ok ? { ok: true } : deleted;
    }
    case "restore-doc":
      return restoreDeletedDocBundle(docsRoot, inverse);
    case "move-doc": {
      const moved = await executeMove(docsRoot, inverse.from, inverse.to);
      if (!moved.ok) return moved;
      return moved.failures.length > 0 ? { ok: true, failures: moved.failures } : { ok: true };
    }
  }
}
