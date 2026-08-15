import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import {
  docTargetFingerprintChanged,
  type DocAnnotation,
} from "@codecaine-ai/docs-model/annotations-schema";

/**
 * Annotation id → whether its filed target no longer has the same text.
 *
 * Kept separate from dangling-target detection until AnnotationPanel exposes
 * a target-changed indicator prop.
 */
export function docAnnotationTargetFingerprintChanges(
  document: DocDocument | null,
  annotations: readonly DocAnnotation[],
): ReadonlyMap<string, boolean> {
  if (!document) return new Map();
  return new Map(
    annotations.map((annotation) => [
      annotation.id,
      docTargetFingerprintChanged(document, annotation),
    ]),
  );
}
