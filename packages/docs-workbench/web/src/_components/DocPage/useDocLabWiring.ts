import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback, useRef } from "react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { AnnotationTarget, AnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import type { DocEditTarget } from "@codecaine-ai/docs-viewer/lab";
import type { DocEditorSaveState } from "@codecaine-ai/docs-viewer/editor/doc-editor";
import { useDocsKernelSession, useDocLabSession } from "./lab";
import type { BundleState, WorkbenchMode } from "./types";
import { cssEscape } from "./dom";
import { canvasBlockIdsForSrc } from "./utils";

export function useDocLabWiring({
  path,
  isStatic,
  doc,
  bundle,
  annotations,
  annotationsHash,
  expectedHashRef,
  fetchBundle,
  fetchBundleRef,
  contentRef,
  liveStateRef,
  flash,
  setBundle
}: {
  path: string;
  isStatic: boolean;
  doc: DocDocument | null;
  bundle: BundleState | null;
  annotations: AnnotationsDocument | null;
  annotationsHash: string | null;
  expectedHashRef: RefObject<string | undefined>;
  fetchBundle: (options?: { showLoading?: boolean }) => Promise<void>;
  fetchBundleRef: RefObject<(options?: { showLoading?: boolean }) => Promise<void>>;
  contentRef: RefObject<HTMLDivElement | null>;
  liveStateRef: RefObject<{ path: string; doc: DocDocument | null; mode: WorkbenchMode; saveState: DocEditorSaveState }>;
  flash: (ids: string[]) => void;
  setBundle: Dispatch<SetStateAction<BundleState | null>>;
}) {
  const handleLabDocApplied = useCallback((nextDoc: DocDocument, hash: string) => {
    expectedHashRef.current = hash;
    setBundle({ doc: nextDoc, hash });
  }, []);

  const labRefreshRef = useRef<() => void | Promise<void>>(() => {});
  const kernelSession = useDocsKernelSession({
    path,
    enabled: !isStatic,
    onSessionEnd: async () => {
      await fetchBundleRef.current();
      await labRefreshRef.current();
    },
    onDocChanged: () => fetchBundleRef.current(),
    onProposalStaged: () => labRefreshRef.current(),
  });

  const lab = useDocLabSession({
    path,
    doc,
    docHash: bundle?.hash ?? null,
    annotations,
    annotationsHash,
    refreshBundle: fetchBundle,
    onDocApplied: handleLabDocApplied,
    onApplyQueue: kernelSession.onApplyQueue,
    kernelSession: kernelSession.handle,
    kernelSnapshot: kernelSession.snapshot,
    enabled: !isStatic,
  });
  labRefreshRef.current = lab.refetchProposals;

  const handleFocusTarget = useCallback(
    (target: AnnotationTarget) => {
      const container = contentRef.current;
      const ids: string[] = [];
      let scrollTo: Element | null = null;
      if (target.kind === "block" || target.kind === "text-range") {
        ids.push(target.blockId);
        scrollTo = container?.querySelector(`[data-block-id="${cssEscape(target.blockId)}"]`) ?? null;
      } else {
        const objectId = target.objectId ?? target.connectionId;
        if (objectId) {
          ids.push(objectId);
          scrollTo =
            container?.querySelector(`[data-canvas-object-id="${cssEscape(objectId)}"]`) ?? null;
        }
        const currentDoc = liveStateRef.current.doc;
        if (currentDoc) {
          const embedding = canvasBlockIdsForSrc(currentDoc, path, target.canvasSrc);
          ids.push(...embedding);
          if (!scrollTo && embedding.length > 0) {
            scrollTo =
              container?.querySelector(`[data-block-id="${cssEscape(embedding[0])}"]`) ?? null;
          }
        }
      }
      scrollTo?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      if (ids.length > 0) flash(ids);
    },
    [path, flash],
  );

  const handleFocusDocEditTarget = useCallback(
    (target: DocEditTarget) => {
      if (target.kind === "doc") {
        const scroller = document.querySelector<HTMLElement>("[data-docs-scroller]");
        scroller?.scrollTo?.({ top: 0, behavior: "smooth" });
        return;
      }
      handleFocusTarget(target);
    },
    [handleFocusTarget],
  );

  return { kernelSession, lab, handleFocusTarget, handleFocusDocEditTarget };
}
