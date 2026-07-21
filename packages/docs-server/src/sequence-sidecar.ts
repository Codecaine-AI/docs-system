import { readFile, stat, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { validateSequenceDocument } from "@codecaine-ai/sequence/schema";

import {
  MAX_SEQUENCE_FILE_BYTES,
  resolveSequenceSidecarRelativePath,
} from "./confine";
import { loadDocsSourceFile } from "./canvas-sidecar";
import { withPathLock } from "./path-mutex";
import { atomicWriteFile } from "./atomic-write";
import { createContentHash } from "./content-hash";
import { draftLockStore, type DraftLockInfo } from "./draft-locks";

/**
 * Doc-relative sequence sidecar mutation core (save / create / delete) —
 * the sequence counterpart of `canvas-sidecar.ts`. Sequence blocks live in
 * doc.json bundles only (there is no legacy MDX `<Sequence>` embed form), so
 * the canvas module's MDX-reference helpers are intentionally absent.
 */

// ---------------------------------------------------------------------------
// Sequence payload validation
// ---------------------------------------------------------------------------

/**
 * Full schema validation of a sequence sidecar payload before it is
 * persisted or served (`validateSequenceDocument` is cheap enough to run on
 * every read/write — sequence has no lighter structural pre-check the way
 * canvas does).
 */
export function validateSequencePayload(
  value: unknown,
): { ok: true } | { ok: false; detail: string } {
  const result = validateSequenceDocument(value);
  if (!result.ok) {
    return { ok: false, detail: result.errors.join("; ") };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Doc-relative sidecar loading
// ---------------------------------------------------------------------------

export type SequenceSidecarByDocPathLoadResult = {
  docsRoot: string;
  docsRootResolved: string;
  docPath: string;
  docAbs: string;
  docContent: string;
  docContentHash: string;
  sequenceRelPath: string;
  sequenceAbs: string;
  sequenceContent: string;
  sequenceContentHash: string;
  sequence: unknown;
};

export type SequenceSidecarByDocPathError = {
  error: { status: number; detail: string };
};

/**
 * Loads a sequence sidecar resolved RELATIVE TO a referencing doc's own
 * directory, together with the referencing doc's content — mirrors
 * `loadCanvasSidecarByDocPath` exactly.
 */
export async function loadSequenceSidecarByDocPath(
  docsRoot: string,
  docPath: string,
  src: string,
): Promise<SequenceSidecarByDocPathLoadResult | SequenceSidecarByDocPathError> {
  const loaded = await loadDocsSourceFile(docsRoot, docPath);
  if ("error" in loaded) return loaded;
  const sequenceRelPath = resolveSequenceSidecarRelativePath(docPath, src);
  if (!sequenceRelPath) {
    return {
      error: {
        status: 400,
        detail: `Invalid sequence sidecar path for ${docPath}: ${src}`,
      },
    };
  }
  const sequenceAbs = join(docsRoot, sequenceRelPath);
  const resolved = resolve(sequenceAbs);
  const docsRootResolved = resolve(docsRoot);
  if (resolved !== docsRootResolved && !resolved.startsWith(docsRootResolved + sep)) {
    return {
      error: { status: 400, detail: `Sequence path escapes docs directory: ${src}` },
    };
  }
  let st;
  try {
    st = await stat(sequenceAbs);
  } catch {
    return { error: { status: 404, detail: `Sequence sidecar not found: ${src}` } };
  }
  if (!st.isFile()) {
    return { error: { status: 404, detail: `Sequence sidecar is not a file: ${src}` } };
  }
  if (st.size > MAX_SEQUENCE_FILE_BYTES) {
    return { error: { status: 413, detail: `Sequence sidecar exceeds size cap: ${src}` } };
  }
  const sequenceContent = await readFile(sequenceAbs, "utf8");
  let sequence: unknown;
  try {
    sequence = JSON.parse(sequenceContent);
  } catch {
    return { error: { status: 400, detail: `Sequence sidecar is invalid JSON: ${src}` } };
  }
  const payloadValidation = validateSequencePayload(sequence);
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
    sequenceRelPath,
    sequenceAbs,
    sequenceContent,
    sequenceContentHash: createContentHash(sequenceContent),
    sequence,
  };
}

/** The wire shape the doc-relative sequence read/save routes use. */
export function sequenceSidecarResponse(loaded: SequenceSidecarByDocPathLoadResult) {
  return {
    path: loaded.docPath,
    document_path: `docs/${loaded.docPath}`,
    sequence_path: loaded.sequenceRelPath,
    sequence_document_path: `docs/${loaded.sequenceRelPath}`,
    content_hash: loaded.sequenceContentHash,
    sequence: loaded.sequence,
  };
}

async function writeSequenceSidecarFile(
  sequenceAbs: string,
  sequence: unknown,
): Promise<{ ok: true; content: string; content_hash: string } | { ok: false; detail: string }> {
  const payloadValidation = validateSequencePayload(sequence);
  if (!payloadValidation.ok) return { ok: false, detail: payloadValidation.detail };
  const content = `${JSON.stringify(sequence, null, 2)}\n`;
  await atomicWriteFile(sequenceAbs, content);
  return { ok: true, content, content_hash: createContentHash(content) };
}

// ---------------------------------------------------------------------------
// Save / create / delete
// ---------------------------------------------------------------------------

export type SequenceSidecarWireResponse = {
  path: string;
  document_path: string;
  sequence_path: string;
  sequence_document_path: string;
  content_hash: string;
  sequence: unknown;
};

export type SaveSequenceSidecarInput = {
  docPath: string;
  src: string;
  sequence: unknown;
  originalHash?: string;
  sessionId?: string;
};

export type SaveSequenceSidecarResult =
  | { ok: true; response: SequenceSidecarWireResponse }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      original_hash?: string;
      held_by?: DraftLockInfo;
    };

/**
 * Whole-document save of an EXISTING doc-relative sequence sidecar with the
 * full mutation contract: hash precondition (409) -> draft-lock precondition
 * (423) -> validate -> atomic persist. The read-check-write sequence runs
 * inside `withPathLock` keyed on the sidecar's absolute path.
 */
export async function saveSequenceSidecar(
  docsRoot: string,
  input: SaveSequenceSidecarInput,
): Promise<SaveSequenceSidecarResult> {
  // Resolve the sidecar's absolute path first (read-only) purely to get the
  // lock key — the actual read-check-write sequence below re-loads INSIDE
  // the lock so no writer can interleave between the hash check and write.
  const keyLookup = await loadSequenceSidecarByDocPath(docsRoot, input.docPath, input.src);
  if ("error" in keyLookup) {
    return { ok: false, status: keyLookup.error.status, detail: keyLookup.error.detail };
  }

  return withPathLock(keyLookup.sequenceAbs, async (): Promise<SaveSequenceSidecarResult> => {
    const loaded = await loadSequenceSidecarByDocPath(docsRoot, input.docPath, input.src);
    if ("error" in loaded) {
      return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
    }
    if (input.originalHash && input.originalHash !== loaded.sequenceContentHash) {
      return {
        ok: false,
        status: 409,
        detail: "Sequence sidecar is stale; reload before saving.",
        current_hash: loaded.sequenceContentHash,
        original_hash: input.originalHash,
      };
    }
    const lockCheck = draftLockStore.checkForMutation(
      { kind: "sequence", path: loaded.sequenceRelPath },
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
    const written = await writeSequenceSidecarFile(loaded.sequenceAbs, input.sequence);
    if (!written.ok) {
      return { ok: false, status: 400, detail: written.detail };
    }
    return {
      ok: true,
      response: {
        path: loaded.docPath,
        document_path: `docs/${loaded.docPath}`,
        sequence_path: loaded.sequenceRelPath,
        sequence_document_path: `docs/${loaded.sequenceRelPath}`,
        content_hash: written.content_hash,
        sequence: input.sequence,
      },
    };
  });
}

export type CreateSequenceSidecarInput = {
  docPath: string;
  src: string;
  sequence: unknown;
  originalHash?: string;
  sessionId?: string;
};

export type CreateSequenceSidecarResult =
  | { ok: true; response: SequenceSidecarWireResponse }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      original_hash?: string;
      held_by?: DraftLockInfo;
    };

/**
 * Creates a NEW doc-relative sequence sidecar (409 when it already exists).
 * The exists-check + write runs inside the path lock so two concurrent
 * creates for the same new sidecar path can't both pass the "does not exist
 * yet" check. (No MDX-reference insertion: sequence blocks live in doc.json
 * bundles only.)
 */
export async function createSequenceSidecar(
  docsRoot: string,
  input: CreateSequenceSidecarInput,
): Promise<CreateSequenceSidecarResult> {
  const loadedDoc = await loadDocsSourceFile(docsRoot, input.docPath);
  if ("error" in loadedDoc) {
    return { ok: false, status: loadedDoc.error.status, detail: loadedDoc.error.detail };
  }
  if (input.originalHash && input.originalHash !== loadedDoc.contentHash) {
    return {
      ok: false,
      status: 409,
      detail: "Docs document is stale; reload before inserting a sequence.",
      current_hash: loadedDoc.contentHash,
      original_hash: input.originalHash,
    };
  }
  const sequenceRelPath = resolveSequenceSidecarRelativePath(input.docPath, input.src);
  if (!sequenceRelPath) {
    return {
      ok: false,
      status: 400,
      detail: `Invalid sequence sidecar path for ${input.docPath}: ${input.src}`,
    };
  }
  const sequenceAbs = join(docsRoot, sequenceRelPath);
  const resolved = resolve(sequenceAbs);
  const docsRootResolved = resolve(docsRoot);
  if (resolved !== docsRootResolved && !resolved.startsWith(docsRootResolved + sep)) {
    return {
      ok: false,
      status: 400,
      detail: `Sequence path escapes docs directory: ${input.src}`,
    };
  }

  return withPathLock(sequenceAbs, async (): Promise<CreateSequenceSidecarResult> => {
    let exists = false;
    try {
      exists = (await stat(sequenceAbs)).isFile();
    } catch {
      exists = false;
    }
    if (exists) {
      return {
        ok: false,
        status: 409,
        detail: `Sequence sidecar already exists: ${sequenceRelPath}`,
      };
    }
    const lockCheck = draftLockStore.checkForMutation(
      { kind: "sequence", path: sequenceRelPath },
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
    const written = await writeSequenceSidecarFile(sequenceAbs, input.sequence);
    if (!written.ok) {
      return { ok: false, status: 400, detail: written.detail };
    }
    return {
      ok: true,
      response: {
        path: input.docPath,
        document_path: `docs/${input.docPath}`,
        sequence_path: sequenceRelPath,
        sequence_document_path: `docs/${sequenceRelPath}`,
        content_hash: written.content_hash,
        sequence: input.sequence,
      },
    };
  });
}

export type DeleteSequenceSidecarInput = {
  docPath: string;
  src: string;
};

export type DeleteSequenceSidecarResult =
  | {
      ok: true;
      response: {
        path: string;
        sequence_path: string;
        deleted: true;
      };
    }
  | { ok: false; status: number; detail: string };

/** Deletes a doc-relative sequence sidecar. */
export async function deleteSequenceSidecar(
  docsRoot: string,
  input: DeleteSequenceSidecarInput,
): Promise<DeleteSequenceSidecarResult> {
  const loaded = await loadSequenceSidecarByDocPath(docsRoot, input.docPath, input.src);
  if ("error" in loaded) {
    return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
  }
  await unlink(loaded.sequenceAbs);
  return {
    ok: true,
    response: {
      path: loaded.docPath,
      sequence_path: loaded.sequenceRelPath,
      deleted: true as const,
    },
  };
}
