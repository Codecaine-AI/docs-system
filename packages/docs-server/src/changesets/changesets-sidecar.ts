import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { isSafeRelativePath } from "@codecaine-ai/docs-index/paths";

import { atomicWriteFile } from "../atomic-write";
import { withPathLock } from "../path-mutex";

/** Corpus-level directory containing one JSON file per change-set. */
export const CHANGESETS_DIRECTORY = ".changesets";

export type DocChangeSetStatus = "open" | "applied" | "declined";

export type DocChangeSetTreeOp =
  | { kind: "create-doc"; docPath: string; title: string }
  | { kind: "delete-doc"; docPath: string }
  | { kind: "move-doc"; from: string; to: string };

export type PositionedDocChangeSetTreeOp = DocChangeSetTreeOp & { position: number };

export type DocChangeSetEntry = { docPath: string; proposalId: string };

export type DocChangeSetAnnotationMigration = {
  fromDocPath: string;
  toDocPath: string;
  blockIds: string[];
  remap?: Record<string, string>;
};

export type DocChangeSet = {
  id: string;
  summary: string;
  status: DocChangeSetStatus;
  sessionId?: string;
  annotationId?: string;
  annotationDocPath?: string;
  alias?: string;
  entries: DocChangeSetEntry[];
  treeOps: PositionedDocChangeSetTreeOp[];
  annotationMigrations?: DocChangeSetAnnotationMigration[];
  createdAt: string;
  resolvedAt?: string;
  compoundPatchId?: string;
};

export type CreateDocChangeSetInput = {
  summary: string;
  sessionId?: string;
  annotationId?: string;
  annotationDocPath?: string;
  alias?: string;
  entries: DocChangeSetEntry[];
  treeOps?: PositionedDocChangeSetTreeOp[];
  annotationMigrations?: DocChangeSetAnnotationMigration[];
};

export type ChangeSetSidecarFailure = {
  ok: false;
  status: 400 | 404 | 422 | 500;
  detail: string;
};

export type ReadChangeSetRecordResult =
  | { ok: true; changeset: DocChangeSet }
  | ChangeSetSidecarFailure;

export type ListChangeSetRecordsResult =
  | { ok: true; changesets: DocChangeSet[] }
  | ChangeSetSidecarFailure;

export type WriteChangeSetRecordResult = ReadChangeSetRecordResult;
export type CreateChangeSetRecordResult = ReadChangeSetRecordResult;

const CHANGESET_ID_PATTERN = /^[A-Za-z0-9-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** IDs are also filenames, so only a single traversal-free path component is allowed. */
export function isValidChangeSetId(id: string): boolean {
  return CHANGESET_ID_PATTERN.test(id);
}

function isOptionalString(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || typeof record[key] === "string";
}

function isValidEntry(value: unknown): value is DocChangeSetEntry {
  return isRecord(value) &&
    typeof value.docPath === "string" &&
    isSafeRelativePath(value.docPath) &&
    typeof value.proposalId === "string" &&
    value.proposalId.length > 0;
}

function isValidTreeOp(
  value: unknown,
  entryCount: number,
): value is PositionedDocChangeSetTreeOp {
  if (!isRecord(value) || !Number.isInteger(value.position)) return false;
  const position = value.position as number;
  if (position < 0 || position > entryCount) return false;

  switch (value.kind) {
    case "create-doc":
      return typeof value.docPath === "string" &&
        isSafeRelativePath(value.docPath) &&
        typeof value.title === "string";
    case "delete-doc":
      return typeof value.docPath === "string" && isSafeRelativePath(value.docPath);
    case "move-doc":
      return typeof value.from === "string" &&
        isSafeRelativePath(value.from) &&
        typeof value.to === "string" &&
        isSafeRelativePath(value.to);
    default:
      return false;
  }
}

function isValidAnnotationMigration(
  value: unknown,
): value is DocChangeSetAnnotationMigration {
  if (!isRecord(value) ||
      typeof value.fromDocPath !== "string" ||
      !isSafeRelativePath(value.fromDocPath) ||
      typeof value.toDocPath !== "string" ||
      !isSafeRelativePath(value.toDocPath) ||
      !Array.isArray(value.blockIds) ||
      !value.blockIds.every((id) => typeof id === "string" && id.length > 0)) {
    return false;
  }
  if (value.remap === undefined) return true;
  return isRecord(value.remap) && Object.entries(value.remap).every(
    ([from, to]) => from.length > 0 && typeof to === "string" && to.length > 0,
  );
}

/** Runtime schema guard used for every record loaded from or written to disk. */
export function isDocChangeSet(value: unknown): value is DocChangeSet {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || !isValidChangeSetId(value.id)) return false;
  if (typeof value.summary !== "string") return false;
  if (value.status !== "open" && value.status !== "applied" && value.status !== "declined") {
    return false;
  }
  if (!isOptionalString(value, "sessionId") ||
      !isOptionalString(value, "annotationId") ||
      !isOptionalString(value, "alias") ||
      !isOptionalString(value, "resolvedAt")) {
    return false;
  }
  if (value.annotationDocPath !== undefined &&
      (typeof value.annotationDocPath !== "string" ||
       !isSafeRelativePath(value.annotationDocPath))) {
    return false;
  }
  if (value.compoundPatchId !== undefined &&
      (typeof value.compoundPatchId !== "string" || value.compoundPatchId.length === 0)) {
    return false;
  }
  if (!Array.isArray(value.entries) || !value.entries.every(isValidEntry)) return false;
  const entryCount = value.entries.length;
  if (!Array.isArray(value.treeOps) ||
      !value.treeOps.every((op) => isValidTreeOp(op, entryCount))) {
    return false;
  }
  if (value.annotationMigrations !== undefined &&
      (!Array.isArray(value.annotationMigrations) ||
       !value.annotationMigrations.every(isValidAnnotationMigration))) {
    return false;
  }
  return typeof value.createdAt === "string";
}

/** Absolute `.changesets` directory for a corpus. */
export function changeSetsDirectoryAbs(docsRoot: string): string {
  return join(resolve(docsRoot), CHANGESETS_DIRECTORY);
}

/**
 * Resolves a record filename only after validating the id as one safe path
 * component. A null result is a caller error, never an on-disk lookup.
 */
export function changeSetRecordAbs(docsRoot: string, id: string): string | null {
  if (!isValidChangeSetId(id)) return null;
  return join(changeSetsDirectoryAbs(docsRoot), `${id}.json`);
}

function schemaFailure(id: string): ChangeSetSidecarFailure {
  return {
    ok: false,
    status: 422,
    detail: `Change-set record failed schema validation: ${id}`,
  };
}

export async function readChangeSetRecord(
  docsRoot: string,
  id: string,
): Promise<ReadChangeSetRecordResult> {
  const abs = changeSetRecordAbs(docsRoot, id);
  if (!abs) {
    return { ok: false, status: 400, detail: `Invalid change-set id: ${id}` };
  }

  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, status: 404, detail: `Change-set not found: ${id}` };
    }
    return { ok: false, status: 500, detail: `Failed to read change-set: ${id}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 422, detail: `Change-set record is not valid JSON: ${id}` };
  }
  if (!isDocChangeSet(parsed) || parsed.id !== id) return schemaFailure(id);
  return { ok: true, changeset: parsed };
}

export async function listChangeSetRecords(
  docsRoot: string,
): Promise<ListChangeSetRecordsResult> {
  let filenames: string[];
  try {
    const entries = await readdir(changeSetsDirectoryAbs(docsRoot), { withFileTypes: true });
    filenames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, changesets: [] };
    }
    return { ok: false, status: 500, detail: "Failed to list change-set records" };
  }

  const changesets: DocChangeSet[] = [];
  for (const filename of filenames) {
    const id = filename.slice(0, -".json".length);
    if (!isValidChangeSetId(id)) return schemaFailure(filename);
    const loaded = await readChangeSetRecord(docsRoot, id);
    if (!loaded.ok) return loaded;
    changesets.push(loaded.changeset);
  }

  changesets.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  return { ok: true, changesets };
}

export async function writeChangeSetRecord(
  docsRoot: string,
  changeset: DocChangeSet,
): Promise<WriteChangeSetRecordResult> {
  if (!isDocChangeSet(changeset)) {
    return { ok: false, status: 422, detail: "Change-set record failed schema validation" };
  }
  const abs = changeSetRecordAbs(docsRoot, changeset.id);
  if (!abs) {
    return { ok: false, status: 400, detail: `Invalid change-set id: ${changeset.id}` };
  }
  const content = `${JSON.stringify(changeset, null, 2)}\n`;

  return withPathLock(abs, async (): Promise<WriteChangeSetRecordResult> => {
    try {
      await atomicWriteFile(abs, content);
      return { ok: true, changeset };
    } catch {
      return {
        ok: false,
        status: 500,
        detail: `Failed to write change-set record: ${changeset.id}`,
      };
    }
  });
}

export async function createChangeSetRecord(
  docsRoot: string,
  input: CreateDocChangeSetInput,
): Promise<CreateChangeSetRecordResult> {
  const changeset: DocChangeSet = {
    id: randomUUID(),
    summary: input.summary,
    status: "open",
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    ...(input.annotationId === undefined ? {} : { annotationId: input.annotationId }),
    ...(input.annotationDocPath === undefined
      ? {}
      : { annotationDocPath: input.annotationDocPath }),
    ...(input.alias === undefined ? {} : { alias: input.alias }),
    entries: input.entries,
    treeOps: input.treeOps ?? [],
    ...(input.annotationMigrations === undefined
      ? {}
      : { annotationMigrations: input.annotationMigrations }),
    createdAt: new Date().toISOString(),
  };
  if (!isDocChangeSet(changeset)) {
    return { ok: false, status: 400, detail: "Invalid change-set input" };
  }
  return writeChangeSetRecord(docsRoot, changeset);
}
