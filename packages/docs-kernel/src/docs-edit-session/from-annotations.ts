/**
 * Annotation -> docs-edit request adapter.
 *
 * Only open agent-request annotations enter the queue. Optional scope ids are
 * applied before later gates, preserving the prompt-edit-session skipped
 * reason behavior and the sidecar's filed order.
 */
import type {
  DocAnnotation,
  AnnotationTarget,
} from "@codecaine-ai/docs-model/annotations-schema";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import {
  getBundleAnnotations,
  loadDocBundle,
} from "@codecaine-ai/docs-server";

import type {
  DocsEditRequestAuthor,
  DocsEditRequestInput,
  DocsEditTarget,
  DocsEditThreadReply,
} from "./types";
import { docsEditDispositionForTarget } from "./types";

export type SkippedDocsAnnotationReason =
  | "not-open"
  | "not-agent-request"
  | "out-of-scope"
  | "scope-unmatched"
  /** Canvas annotations belong to the canvas workflow, not DocOp sessions. */
  | "unsupported-target";

export interface SkippedDocsAnnotation {
  annotationId: string;
  reason: SkippedDocsAnnotationReason;
  detail?: string;
}

export interface DocsEditRequestsFromAnnotations {
  /** Annotation/filed order; session alias assignment turns these into R1... */
  requests: DocsEditRequestInput[];
  skipped: SkippedDocsAnnotation[];
}

export interface DocsEditRequestsFromAnnotationsOptions {
  scopeIds?: Iterable<string>;
}

function toRole(author: string): DocsEditRequestAuthor {
  return author === "agent" || author === "system" ? author : "human";
}

function toTarget(
  target: AnnotationTarget,
  docRoot: string,
): { target: DocsEditTarget; disposition: "batch" | "global" } | null {
  if (target.kind === "block") {
    if (target.blockId === docRoot) {
      const mapped: DocsEditTarget = { kind: "doc" };
      return {
        target: mapped,
        disposition: docsEditDispositionForTarget(mapped),
      };
    }
    const mapped: DocsEditTarget = {
      kind: "block",
      blockId: target.blockId,
      ...(target.fingerprint !== undefined
        ? { fingerprint: target.fingerprint }
        : {}),
    };
    return {
      target: mapped,
      disposition: docsEditDispositionForTarget(mapped),
    };
  }
  if (target.kind === "text-range") {
    const mapped: DocsEditTarget = {
      kind: "text-range",
      blockId: target.blockId,
      start: target.start,
      end: target.end,
      quote: target.quote,
      ...(target.fingerprint !== undefined
        ? { fingerprint: target.fingerprint }
        : {}),
    };
    return {
      target: mapped,
      disposition: docsEditDispositionForTarget(mapped),
    };
  }
  // Canvas-object requests are handled by the canvas workflow, not a
  // single-doc DocOp session. There is no canvas target in the settled docs
  // session wire type.
  return null;
}

export function docsEditRequestsFromAnnotations(
  annotations: readonly DocAnnotation[],
  doc: Pick<DocDocument, "id" | "root" | "blocks">,
  options: DocsEditRequestsFromAnnotationsOptions = {},
): DocsEditRequestsFromAnnotations {
  const scopeIds = options.scopeIds === undefined
    ? null
    : new Set(options.scopeIds);
  const seenScopeIds = new Set<string>();
  const requests: DocsEditRequestInput[] = [];
  const skipped: SkippedDocsAnnotation[] = [];

  for (const annotation of annotations) {
    if (scopeIds !== null) {
      if (!scopeIds.has(annotation.id)) {
        skipped.push({
          annotationId: annotation.id,
          reason: "out-of-scope",
          detail: "not in the requested scope",
        });
        continue;
      }
      seenScopeIds.add(annotation.id);
    }
    if (annotation.status !== "open") {
      skipped.push({
        annotationId: annotation.id,
        reason: "not-open",
        detail: `status is "${annotation.status}"`,
      });
      continue;
    }
    if (annotation.intent !== "agent-request") {
      skipped.push({
        annotationId: annotation.id,
        reason: "not-agent-request",
        detail: `intent is "${annotation.intent}"`,
      });
      continue;
    }

    const mapped = toTarget(annotation.target, doc.root);
    if (mapped === null) {
      skipped.push({
        annotationId: annotation.id,
        reason: "unsupported-target",
        detail: `target kind "${annotation.target.kind}" is outside docs-edit scope`,
      });
      continue;
    }

    const thread: DocsEditThreadReply[] = (annotation.replies ?? []).map(
      (reply) => ({
        author: toRole(reply.author),
        body: reply.body,
        createdAt: reply.createdAt,
      }),
    );
    requests.push({
      id: annotation.id,
      target: mapped.target,
      disposition: mapped.disposition,
      body: annotation.body,
      author: toRole(annotation.author),
      sidecarBacked: true,
      ...(thread.length > 0 ? { thread } : {}),
    });
  }

  if (scopeIds !== null) {
    for (const wanted of scopeIds) {
      if (seenScopeIds.has(wanted)) continue;
      skipped.push({
        annotationId: wanted,
        reason: "scope-unmatched",
        detail: "no annotation with this id on the sidecar",
      });
    }
  }

  return { requests, skipped };
}

export type LoadDocsEditRequestsFromAnnotationsResult =
  | {
      ok: true;
      document: DocDocument;
      path: string;
      docHash: string;
      annotationsHash: string | null;
      requests: DocsEditRequestInput[];
      skipped: SkippedDocsAnnotation[];
    }
  | { ok: false; status: number; detail: string };

/** Disk-backed adapter used by launch.ts; all annotation reads use the
 * docs-server in-process helper rather than a second server. */
export async function loadDocsEditRequestsFromAnnotations(
  docsRoot: string,
  path: string,
  options: DocsEditRequestsFromAnnotationsOptions = {},
): Promise<LoadDocsEditRequestsFromAnnotationsResult> {
  const loaded = await loadDocBundle(docsRoot, path);
  if ("error" in loaded) return { ok: false, ...loaded.error };
  const listed = await getBundleAnnotations(docsRoot, path);
  if (!listed.ok) {
    return { ok: false, status: listed.status, detail: listed.detail };
  }
  const mapped = docsEditRequestsFromAnnotations(
    listed.annotations.annotations,
    loaded.document,
    options,
  );
  return {
    ok: true,
    document: loaded.document,
    path: loaded.bundlePath,
    docHash: loaded.docHash,
    annotationsHash: listed.hash,
    ...mapped,
  };
}
