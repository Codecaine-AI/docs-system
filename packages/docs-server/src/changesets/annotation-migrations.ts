import { readFile, unlink } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";
import {
  validateAnnotationsDocument,
  type AnnotationsDocument,
  type DocAnnotation,
} from "@codecaine-ai/docs-model/annotations-schema";
import { atomicWriteFile } from "../atomic-write";
import {
  ANNOTATIONS_SIDECAR_FILENAME,
  readAnnotationsSidecar,
  writeAnnotationsSidecar,
} from "../bundle";
import { createContentHash } from "../content-hash";
import { withPathLock } from "../path-mutex";
import type { DocChangeSetAnnotationMigration } from "./changesets-sidecar";

type PreparedSource = {
  migration: DocChangeSetAnnotationMigration;
  sourceAnnotations: AnnotationsDocument;
};
export type PreparedAnnotationMigrations = PreparedSource[];
export type AnnotationSidecarInverseFile = {
  path: string;
  beforeContent: string | null;
  hashAfterApply: string | null;
};
export type ApplyAnnotationMigrationsResult =
  | { ok: true; files: AnnotationSidecarInverseFile[]; migratedAnnotationPaths: Map<string, string> }
  | { ok: false; status: number; detail: string };

function annotationsAbs(docsRoot: string, docPath: string): string | null {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, docPath);
  return jsonAbs ? resolve(dirname(jsonAbs), ANNOTATIONS_SIDECAR_FILENAME) : null;
}

function annotationBlockId(annotation: DocAnnotation): string | null {
  return annotation.target.kind === "block" || annotation.target.kind === "text-range"
    ? annotation.target.blockId : null;
}

function remapAnnotation(
  annotation: DocAnnotation,
  remap: Record<string, string> | undefined,
): DocAnnotation {
  const blockId = annotationBlockId(annotation);
  if (!blockId || !remap?.[blockId]) return annotation;
  return { ...annotation, target: { ...annotation.target, blockId: remap[blockId] } } as DocAnnotation;
}

async function readRaw(abs: string): Promise<string | null> {
  try {
    return await readFile(abs, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function restoreRaw(abs: string, content: string | null): Promise<void> {
  if (content !== null) return atomicWriteFile(abs, content);
  try {
    await unlink(abs);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Capture sources before tree ops; merge deletes its source before migration. */
export async function prepareAnnotationMigrations(
  docsRoot: string,
  migrations: DocChangeSetAnnotationMigration[],
): Promise<PreparedAnnotationMigrations | { ok: false; status: number; detail: string }> {
  const prepared: PreparedAnnotationMigrations = [];
  for (const migration of migrations) {
    const abs = annotationsAbs(docsRoot, migration.fromDocPath);
    if (!abs) {
      return { ok: false, status: 400, detail: `Invalid docs path: ${migration.fromDocPath}` };
    }
    const read = await withPathLock(abs, () => readAnnotationsSidecar(abs));
    if ("error" in read) return { ok: false, status: read.error.status, detail: read.error.detail };
    prepared.push({ migration, sourceAnnotations: read.annotations });
  }
  return prepared;
}

/** Apply every migration under one lexicographically ordered lock set. */
export async function applyAnnotationMigrations(
  docsRoot: string,
  prepared: PreparedAnnotationMigrations,
): Promise<ApplyAnnotationMigrationsResult> {
  if (prepared.length === 0) return { ok: true, files: [], migratedAnnotationPaths: new Map() };
  const root = resolve(docsRoot);
  const paths = new Map<string, string>();
  for (const { migration } of prepared) {
    for (const docPath of [migration.fromDocPath, migration.toDocPath]) {
      const abs = annotationsAbs(docsRoot, docPath);
      if (!abs || !abs.startsWith(`${root}${sep}`)) {
        return { ok: false, status: 400, detail: `Invalid docs path: ${docPath}` };
      }
      paths.set(docPath, abs);
    }
  }
  const lockPaths = [...new Set(paths.values())].sort((a, b) => a.localeCompare(b));
  const acquire = async (index: number): Promise<ApplyAnnotationMigrationsResult> => {
    if (index < lockPaths.length) return withPathLock(lockPaths[index], () => acquire(index + 1));
    type State = { raw: string | null; annotations: AnnotationsDocument; changed: boolean };
    const states = new Map<string, State>();
    try {
      for (const abs of lockPaths) {
        const raw = await readRaw(abs);
        const read = await readAnnotationsSidecar(abs);
        if ("error" in read) return { ok: false, status: read.error.status, detail: read.error.detail };
        states.set(abs, { raw, annotations: read.annotations, changed: false });
      }
      const migratedAnnotationPaths = new Map<string, string>();
      for (const item of prepared) {
        const { migration } = item;
        const fromAbs = paths.get(migration.fromDocPath) as string;
        const toAbs = paths.get(migration.toDocPath) as string;
        const sourceState = states.get(fromAbs) as State;
        const destState = states.get(toAbs) as State;
        const idSet = new Set(migration.blockIds);
        const sourceDocument = sourceState.raw === null ? item.sourceAnnotations : sourceState.annotations;
        const moving = sourceDocument.annotations.filter((annotation) => {
          const blockId = annotationBlockId(annotation);
          return blockId !== null && idSet.has(blockId);
        });
        if (moving.length === 0) continue;
        const movingIds = new Set(moving.map((annotation) => annotation.id));
        const duplicate = destState.annotations.annotations.find(
          (annotation) => movingIds.has(annotation.id),
        );
        if (duplicate) {
          return {
            ok: false,
            status: 409,
            detail: `Annotation already exists in destination: ${duplicate.id}`,
          };
        }
        if (sourceState.raw !== null) {
          sourceState.annotations = {
            schemaVersion: 1,
            annotations: sourceState.annotations.annotations.filter((a) => !movingIds.has(a.id)),
          };
          sourceState.changed = true;
        }
        const moved = moving.map((annotation) => remapAnnotation(annotation, migration.remap));
        destState.annotations = {
          schemaVersion: 1,
          annotations: [...destState.annotations.annotations, ...moved],
        };
        destState.changed = true;
        for (const annotation of moved) migratedAnnotationPaths.set(annotation.id, migration.toDocPath);
      }
      const changedStates = [...states.entries()].filter(([, state]) => state.changed);
      for (const [, state] of changedStates) {
        const validated = validateAnnotationsDocument(state.annotations);
        if (!validated.ok) {
          return {
            ok: false,
            status: 422,
            detail: `Annotation migration failed schema validation: ${validated.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join("; ")}`,
          };
        }
        state.annotations = validated.document;
      }
      try {
        for (const [abs, state] of changedStates) {
          await writeAnnotationsSidecar(abs, state.annotations);
        }
      } catch (error) {
        for (const [abs, state] of [...changedStates].reverse()) {
          await restoreRaw(abs, state.raw).catch(() => undefined);
        }
        return {
          ok: false,
          status: 500,
          detail: `Failed to write annotation migration: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
      const files: AnnotationSidecarInverseFile[] = [];
      for (const [abs, state] of changedStates) {
        const after = await readRaw(abs);
        files.push({
          path: relative(root, abs).split(sep).join("/"),
          beforeContent: state.raw,
          hashAfterApply: after === null ? null : createContentHash(after),
        });
      }
      return { ok: true, files, migratedAnnotationPaths };
    } catch (error) {
      return { ok: false, status: 500, detail: `Failed to migrate annotations: ${error instanceof Error ? error.message : String(error)}` };
    }
  };
  return acquire(0);
}
