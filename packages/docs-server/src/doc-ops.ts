import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { serializeDocDocument, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { applyOps, type DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type {
  AnnotationsDocument,
  AnnotationTarget,
  DocAnnotation,
} from "@codecaine-ai/docs-model/annotations-schema";
import { validateAnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";

import { withPathLock } from "./path-mutex";
import { atomicWriteFile } from "./atomic-write";
import { createContentHash } from "./content-hash";
import { draftLockStore, type DraftLockInfo } from "./draft-locks";
import {
  ANNOTATIONS_SIDECAR_FILENAME,
  isValidAnnotationTarget,
  loadDocBundle,
  normalizeBundlePath,
  readAnnotationsSidecar,
  writeAnnotationsSidecar,
} from "./bundle";
import { indexDocSourceBestEffort } from "./backlinks-cache";
import { recordDocPatch } from "./patch-ledger";

/**
 * The docs mutation core: apply typed DocOps to a bundle's doc.json, and
 * add/resolve annotations on its sidecar. Every mutation carries the full
 * contract: validate -> content-hash precondition (409) -> draft-lock
 * precondition (423) -> apply -> full-document revalidation (422) ->
 * atomic persist -> record inverse in the undo ledger -> (fire-and-forget)
 * backlinks reindex. The entire
 * read-check-apply-write sequence runs inside `withPathLock`, keyed on the
 * target file's resolved absolute path, so two concurrent callers can never
 * both pass the hash check against the same pre-write state and race each
 * other's write.
 */

export type ApplyDocOpsResult =
  | { ok: true; doc: DocDocument; hash: string; patchId: string; inverse: DocOp[] }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      expected_hash?: string;
      issues?: unknown;
      held_by?: DraftLockInfo;
    };

/**
 * Applies a batch of typed DocOp mutations to a bundle's doc.json. The
 * `inverse` ops returned by applyOps are recorded in the shared undo ledger
 * keyed by a freshly minted `patchId`, so ANY successful apply — a UI save,
 * an agent tool call, a move-doc rewrite — is undoable through `undo_patch`.
 */
export async function applyDocOpsToBundle(
  docsRoot: string,
  path: string,
  ops: DocOp[],
  expectedHash: string | undefined,
  sessionId?: string,
  options?: { validateProps?: boolean },
): Promise<ApplyDocOpsResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }

  return withPathLock(jsonAbs, async (): Promise<ApplyDocOpsResult> => {
    const loaded = await loadDocBundle(docsRoot, path);
    if ("error" in loaded) {
      return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
    }
    if (expectedHash && expectedHash !== loaded.docHash) {
      return {
        ok: false,
        status: 409,
        detail: "Doc bundle is stale; reload before applying ops.",
        current_hash: loaded.docHash,
        expected_hash: expectedHash,
      };
    }

    const lockCheck = draftLockStore.checkForMutation(
      { kind: "doc", path: loaded.bundlePath },
      sessionId,
    );
    if (lockCheck.blocked) {
      return {
        ok: false,
        status: 423,
        detail: "Draft in progress — another session is editing this file.",
        held_by: lockCheck.heldBy,
      };
    }

    const result = applyOps(loaded.document, ops, () => randomUUID(), options);
    if (!result.ok) {
      return { ok: false, status: 400, detail: "Doc ops failed to apply", issues: result.issues };
    }

    // Write gate (invariant): no accepted write may produce bytes that fail
    // `validateDocDocument` on reload — a doc.json that saves but cannot load
    // bricks the whole bundle in the UI. Op application is shallower than
    // load-time validation (e.g. delta span `attributes` are copied verbatim,
    // so a malformed `reference` sails through applyOps), so the FULL
    // resulting document is revalidated here, in memory, before any bytes
    // touch disk. Failure -> 422 with the validator's issues; the on-disk
    // file is untouched. Persisting the validator's normalized `document`
    // (not `result.doc`) also guarantees the written bytes are the canonical
    // form the next load's hash derivation expects.
    const validated = validateDocDocument(result.doc);
    if (!validated.ok) {
      return {
        ok: false,
        status: 422,
        detail: "Doc ops produced an invalid document; save rejected.",
        issues: validated.issues,
      };
    }

    const serialized = serializeDocDocument(validated.document);
    await atomicWriteFile(loaded.jsonAbs, serialized);
    const hash = createContentHash(serialized);
    const patchId = randomUUID();
    recordDocPatch(patchId, loaded.bundlePath, result.inverse, hash);

    // Best-effort backlinks re-index — fire-and-forget, must never fail or
    // delay the save this just committed to disk.
    void indexDocSourceBestEffort(docsRoot, `${loaded.bundlePath}/doc.json`, validated.document);

    return { ok: true, doc: validated.document, hash, patchId, inverse: result.inverse };
  });
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

/** A bundle's `annotations.json` sidecar path (write target and path-lock key). */
function annotationsSidecarAbs(jsonAbs: string): string {
  return join(dirname(jsonAbs), ANNOTATIONS_SIDECAR_FILENAME);
}

export type BundleAnnotationsReadResult =
  | { ok: true; annotations: AnnotationsDocument; hash: string | null }
  | { ok: false; status: number; detail: string };

/** Reads a bundle's annotations sidecar ("no annotations.json yet" is a valid empty state). */
export async function getBundleAnnotations(
  docsRoot: string,
  path: string,
): Promise<BundleAnnotationsReadResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }
  const annotationsAbs = annotationsSidecarAbs(jsonAbs);
  const result = await readAnnotationsSidecar(annotationsAbs);
  if ("error" in result) {
    return { ok: false, status: result.error.status, detail: result.error.detail };
  }
  return { ok: true, annotations: result.annotations, hash: result.hash };
}

export type AddBundleAnnotationInput = {
  target: unknown;
  body: string;
  intent: "note" | "agent-request";
  author: string;
  expectedHash?: string;
};

export type AddBundleAnnotationResult =
  | { ok: true; annotation: DocAnnotation; annotations: AnnotationsDocument; hash: string }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      expected_hash?: string;
      held_by?: DraftLockInfo;
    };

/** Adds an annotation to a bundle's sidecar (hash precondition + draft-lock guard). */
export async function addBundleAnnotation(
  docsRoot: string,
  path: string,
  input: AddBundleAnnotationInput,
  sessionId?: string,
): Promise<AddBundleAnnotationResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }
  if (!isValidAnnotationTarget(input.target)) {
    return { ok: false, status: 400, detail: "Annotation target is invalid" };
  }
  const annotationsAbs = annotationsSidecarAbs(jsonAbs);
  const bundlePath = normalizeBundlePath(path);

  return withPathLock(annotationsAbs, async (): Promise<AddBundleAnnotationResult> => {
    const existing = await readAnnotationsSidecar(annotationsAbs);
    if ("error" in existing) {
      return { ok: false, status: existing.error.status, detail: existing.error.detail };
    }
    if (input.expectedHash && input.expectedHash !== existing.hash) {
      return {
        ok: false,
        status: 409,
        detail: "Annotations sidecar is stale; reload before adding an annotation.",
        current_hash: existing.hash ?? undefined,
        expected_hash: input.expectedHash,
      };
    }

    const lockCheck = draftLockStore.checkForMutation({ kind: "doc", path: bundlePath }, sessionId);
    if (lockCheck.blocked) {
      return {
        ok: false,
        status: 423,
        detail: "Draft in progress — another session is editing this file.",
        held_by: lockCheck.heldBy,
      };
    }

    const annotation: DocAnnotation = {
      id: randomUUID(),
      target: input.target as AnnotationTarget,
      body: input.body,
      intent: input.intent,
      author: input.author,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    const nextDocument: AnnotationsDocument = {
      schemaVersion: 1,
      annotations: [...existing.annotations.annotations, annotation],
    };
    const validated = validateAnnotationsDocument(nextDocument);
    if (!validated.ok) {
      return {
        ok: false,
        status: 422,
        detail: `Annotation failed schema validation: ${validated.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      };
    }
    const written = await writeAnnotationsSidecar(annotationsAbs, validated.document);
    return { ok: true, annotation, annotations: validated.document, hash: written.hash };
  });
}

export type ResolveBundleAnnotationResult =
  | { ok: true; annotations: AnnotationsDocument; hash: string }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      expected_hash?: string;
      held_by?: DraftLockInfo;
    };

/**
 * Flips an annotation to `resolved` (with an optional resolution note
 * persisted on the annotation's additive `resolution` field). Hash
 * precondition + draft-lock guard, inside the sidecar's path lock.
 */
export async function resolveBundleAnnotation(
  docsRoot: string,
  path: string,
  annotationId: string,
  expectedHash: string | undefined,
  sessionId?: string,
  response?: string,
): Promise<ResolveBundleAnnotationResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }
  const annotationsAbs = annotationsSidecarAbs(jsonAbs);
  const bundlePath = normalizeBundlePath(path);

  return withPathLock(annotationsAbs, async (): Promise<ResolveBundleAnnotationResult> => {
    const existing = await readAnnotationsSidecar(annotationsAbs);
    if ("error" in existing) {
      return { ok: false, status: existing.error.status, detail: existing.error.detail };
    }
    if (expectedHash && expectedHash !== existing.hash) {
      return {
        ok: false,
        status: 409,
        detail: "Annotations sidecar is stale; reload before resolving.",
        current_hash: existing.hash ?? undefined,
        expected_hash: expectedHash,
      };
    }
    const annotationIndex = existing.annotations.annotations.findIndex(
      (annotation) => annotation.id === annotationId,
    );
    if (annotationIndex < 0) {
      return { ok: false, status: 404, detail: `Annotation not found: ${annotationId}` };
    }

    const lockCheck = draftLockStore.checkForMutation({ kind: "doc", path: bundlePath }, sessionId);
    if (lockCheck.blocked) {
      return {
        ok: false,
        status: 423,
        detail: "Draft in progress — another session is editing this file.",
        held_by: lockCheck.heldBy,
      };
    }

    const nextAnnotations = existing.annotations.annotations.map((annotation, index) =>
      index === annotationIndex
        ? {
            ...annotation,
            status: "resolved" as const,
            ...(response !== undefined ? { resolution: response } : {}),
          }
        : annotation,
    );
    const nextDocument: AnnotationsDocument = { schemaVersion: 1, annotations: nextAnnotations };
    const validated = validateAnnotationsDocument(nextDocument);
    if (!validated.ok) {
      return {
        ok: false,
        status: 422,
        detail: `Annotation failed schema validation: ${validated.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      };
    }
    const written = await writeAnnotationsSidecar(annotationsAbs, validated.document);
    return { ok: true, annotations: validated.document, hash: written.hash };
  });
}

export type AttachAgentRunInput = {
  annotationId: string;
  sessionId: string;
  patchId: string;
  summary: string;
  changedIds: string[];
};

export type AttachAgentRunResult =
  | { ok: true; annotation: DocAnnotation; annotations: AnnotationsDocument; hash: string }
  | { ok: false; status: number; detail: string };

/**
 * Records a completed agent run on its originating annotation
 * (`agentRun: {sessionId, patchId, summary, changedIds}`) and flips the
 * annotation to `resolved`. No `expectedHash`/draft-lock precondition here:
 * by the time this is called, the host route has ALREADY applied the agent's
 * mutation via `doc_update_blocks`/`canvas_apply_patch` (which enforce the
 * hash + draft-lock preconditions on the DOC/CANVAS being edited) — this
 * step only writes to `annotations.json`, a different file. Still runs
 * inside `withPathLock` on the sidecar so it can't race a concurrent
 * annotation mutation.
 */
export async function attachAgentRunToAnnotation(
  docsRoot: string,
  path: string,
  input: AttachAgentRunInput,
): Promise<AttachAgentRunResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }
  const annotationsAbs = annotationsSidecarAbs(jsonAbs);

  return withPathLock(annotationsAbs, async (): Promise<AttachAgentRunResult> => {
    const existing = await readAnnotationsSidecar(annotationsAbs);
    if ("error" in existing) {
      return { ok: false, status: existing.error.status, detail: existing.error.detail };
    }
    const annotationIndex = existing.annotations.annotations.findIndex(
      (annotation) => annotation.id === input.annotationId,
    );
    if (annotationIndex < 0) {
      return { ok: false, status: 404, detail: `Annotation not found: ${input.annotationId}` };
    }

    let updatedAnnotation: DocAnnotation | undefined;
    const nextAnnotations = existing.annotations.annotations.map((annotation, index) => {
      if (index !== annotationIndex) return annotation;
      updatedAnnotation = {
        ...annotation,
        status: "resolved" as const,
        agentRun: {
          sessionId: input.sessionId,
          patchId: input.patchId,
          summary: input.summary,
          changedIds: input.changedIds,
        },
      };
      return updatedAnnotation;
    });
    const nextDocument: AnnotationsDocument = { schemaVersion: 1, annotations: nextAnnotations };
    const validated = validateAnnotationsDocument(nextDocument);
    if (!validated.ok) {
      return {
        ok: false,
        status: 422,
        detail: `Annotation failed schema validation: ${validated.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      };
    }
    const written = await writeAnnotationsSidecar(annotationsAbs, validated.document);
    if (!updatedAnnotation) {
      return { ok: false, status: 500, detail: "Failed to attach agent run to annotation" };
    }
    return {
      ok: true,
      annotation: updatedAnnotation,
      annotations: validated.document,
      hash: written.hash,
    };
  });
}
