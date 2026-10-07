import type {
  AnnotationIntent,
  AnnotationTarget,
  AnnotationsDocument,
  DocAnnotation,
} from "@codecaine-ai/docs-model/annotations-schema";
import { fetchJson, postJson, assertWritable, bundlePathOf } from "./http";
import { getSessionId } from "../session";

// ---------------------------------------------------------------------------
// Annotations (serve only)
// ---------------------------------------------------------------------------

export type AnnotationsPayload = { annotations: AnnotationsDocument; hash: string | null };

export async function getAnnotations(path: string): Promise<AnnotationsPayload> {
  assertWritable("Loading annotations");
  return fetchJson(`api/annotations?path=${encodeURIComponent(bundlePathOf(path))}`);
}

export async function addAnnotation(
  path: string,
  input: {
    target: AnnotationTarget;
    body: string;
    intent: AnnotationIntent;
    author: string;
    expectedHash?: string | null;
  },
): Promise<{ annotation: DocAnnotation; annotations: AnnotationsDocument; hash: string }> {
  assertWritable("Annotating");
  return postJson(`api/annotations`, {
    path: bundlePathOf(path),
    target: input.target,
    body: input.body,
    intent: input.intent,
    author: input.author,
    expected_hash: input.expectedHash ?? undefined,
    session_id: getSessionId(),
  });
}

export async function resolveAnnotation(
  path: string,
  annotationId: string,
  expectedHash?: string | null,
  response?: string,
): Promise<{ annotations: AnnotationsDocument; hash: string }> {
  assertWritable("Resolving annotations");
  return postJson(`api/annotations/${encodeURIComponent(annotationId)}/resolve`, {
    path: bundlePathOf(path),
    response,
    expected_hash: expectedHash ?? undefined,
    session_id: getSessionId(),
  });
}

export async function addAnnotationReply(
  path: string,
  annotationId: string,
  body: string,
  expectedHash?: string | null,
): Promise<{ annotations: AnnotationsDocument; hash: string }> {
  assertWritable("Replying to annotations");
  return postJson(`api/annotations/${encodeURIComponent(annotationId)}/replies`, {
    path: bundlePathOf(path),
    author: "you",
    body,
    expected_hash: expectedHash ?? undefined,
    session_id: getSessionId(),
  });
}

