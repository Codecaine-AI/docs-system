import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback, useRef } from "react";
import type { AnnotationTarget, AnnotationIntent, AnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import { addAnnotation, resolveAnnotation, addAnnotationReply } from "../../data/api";
import { ANNOTATION_AUTHOR } from "./constants";

export function useDocAnnotations({
  path,
  annotationsHash,
  fetchBundleRef,
  setAnnotations,
  setAnnotationsHash,
  setPaneError,
  setIsAnnotationSubmitting
}: {
  path: string;
  annotationsHash: string | null;
  fetchBundleRef: RefObject<(options?: { showLoading?: boolean }) => Promise<void>>;
  setAnnotations: Dispatch<SetStateAction<AnnotationsDocument | null>>;
  setAnnotationsHash: Dispatch<SetStateAction<string | null>>;
  setPaneError: Dispatch<SetStateAction<string | null>>;
  setIsAnnotationSubmitting: Dispatch<SetStateAction<boolean>>;
}) {
  // ---------------------------------------------------------------------
  // Annotations
  // ---------------------------------------------------------------------

  const annotationsHashRef = useRef(annotationsHash);
  annotationsHashRef.current = annotationsHash;

  const handleAddAnnotation = useCallback(
    async (input: { target: AnnotationTarget; body: string; intent: AnnotationIntent }) => {
      setIsAnnotationSubmitting(true);
      try {
        const response = await addAnnotation(path, {
          ...input,
          author: ANNOTATION_AUTHOR,
          expectedHash: annotationsHashRef.current,
        });
        setAnnotations(response.annotations);
        setAnnotationsHash(response.hash);
        setPaneError(null);
      } catch (annotationError) {
        // Refresh so a retry runs against the current hash, then surface the
        // failure in Plannotator's composer (it catches and displays).
        void fetchBundleRef.current();
        throw annotationError;
      } finally {
        setIsAnnotationSubmitting(false);
      }
    },
    [path],
  );

  const handleResolveAnnotation = useCallback(
    async (annotationId: string) => {
      try {
        const response = await resolveAnnotation(path, annotationId, annotationsHashRef.current);
        setAnnotations(response.annotations);
        setAnnotationsHash(response.hash);
        setPaneError(null);
      } catch (resolveError) {
        setPaneError(
          resolveError instanceof Error ? resolveError.message : "Failed to resolve annotation.",
        );
        void fetchBundleRef.current();
      }
    },
    [path],
  );

  const handleAddReply = useCallback(
    async (annotationId: string, body: string) => {
      try {
        const response = await addAnnotationReply(
          path,
          annotationId,
          body,
          annotationsHashRef.current,
        );
        setAnnotations(response.annotations);
        setAnnotationsHash(response.hash);
        setPaneError(null);
      } catch (replyError) {
        setPaneError(replyError instanceof Error ? replyError.message : "Failed to add reply.");
        void fetchBundleRef.current();
        throw replyError;
      }
    },
    [path],
  );

  return { handleAddAnnotation, handleResolveAnnotation, handleAddReply };
}
