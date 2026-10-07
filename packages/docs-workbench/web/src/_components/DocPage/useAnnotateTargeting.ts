import { useCallback, useEffect, useMemo, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { AnnotationIntent, AnnotationTarget } from "@codecaine-ai/docs-model/annotations-schema";
import type { PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import { getDocBlockDescriptor } from "@codecaine-ai/docs-viewer";
import { useTargeting, type ResolvedTarget } from "@codecaine-ai/annotations/react";
import type { DocEditRequest } from "@codecaine-ai/docs-viewer/lab";
import { resolveBundleCanvasSrc } from "@codecaine-ai/docs-viewer/bundle-src";
import type { BundleState, WorkbenchMode } from "./types";
import { canvasBlockIdsForSrc, selectionToDocEditTarget, selectionToTarget, truncateLabelText } from "./utils";
import { cssEscape, newLabAnnotationId } from "./dom";
import { blockTextRangeFromDomRange } from "./annotate-range";
import { blocksInStagedRegions, buildDocLabStagedRegions, topLevelAncestor, type DocLabSessionResult } from "./lab";

type UseAnnotateTargetingOptions = {
  doc: DocDocument | null;
  selection: PlannotatorSelection | null;
  isStatic: boolean;
  mode: WorkbenchMode;
  path: string;
  pathRef: RefObject<string>;
  bundle: BundleState | null;
  canvasEpoch: number;
  lab: DocLabSessionResult;
  setSelection: Dispatch<SetStateAction<PlannotatorSelection | null>>;
  setPaneError: Dispatch<SetStateAction<string | null>>;
  handleModeChange: (nextMode: WorkbenchMode) => void;
  handleAddAnnotation: (input: { target: AnnotationTarget; body: string; intent: AnnotationIntent }) => Promise<void>;
};

export function useAnnotateTargeting({
  doc, selection, isStatic, mode, path, pathRef, bundle, canvasEpoch, lab,
  setSelection, setPaneError, handleModeChange, handleAddAnnotation,
}: UseAnnotateTargetingOptions) {
  // ---------------------------------------------------------------------
  // Annotate mode — shared targeting layer + inline lab composer
  // ---------------------------------------------------------------------
  //
  // The annotation UX standard (see prompt-kit's lab): a dotted glide ring +
  // label chip follow the hovered block; clicking pins the target and opens
  // InlineComposer anchored beneath it (every filing is an agent request —
  // no intent picker); Cmd/Ctrl+drag selects a text range
  // inside a block. Canvas-object selection stays on the canvas embed's own
  // object-select surface (onCanvasObjectSelect below) — the layer resolves
  // [data-canvas-object-id] hovers for the ring/chip but leaves their clicks
  // to the embed; either path lands in the same pinned `selection`.
  const docRef = useRef(doc);
  docRef.current = doc;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const annotateActive = !isStatic && mode === "annotate";
  // The targeting hook owns its containerRef; this mirror lets callbacks
  // passed INTO the hook (resolve/selected/anchors) reach the same element.
  const annotateContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // IME composition owns Escape, and the shell inspector (Style) closes
      // itself on Escape: neither may also leave AI mode.
      if (event.isComposing || (event.target instanceof Element && event.target.closest(".ds-inspector"))) return;
      if (event.key !== "Escape" || mode !== "annotate") return;
      // The targeting container owns Escape while a target is pinned. This
      // document-level path makes Escape exit AI mode when focus is elsewhere.
      if (selectionRef.current) {
        event.preventDefault();
        setSelection(null);
        return;
      }
      event.preventDefault();
      handleModeChange("edit");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleModeChange, mode]);
  const stagedRegions = useMemo(
    () =>
      annotateActive && doc
        ? buildDocLabStagedRegions(doc, lab.session.proposals)
        : [],
    [annotateActive, doc, lab.session.proposals],
  );
  const stagedBlockIds = useMemo(
    () => (doc ? blocksInStagedRegions(doc, stagedRegions) : new Set<string>()),
    [doc, stagedRegions],
  );
  const stagedBlockIdsRef = useRef(stagedBlockIds);
  stagedBlockIdsRef.current = stagedBlockIds;

  const resolveAnnotateTarget = useCallback(
    (element: HTMLElement): ResolvedTarget<PlannotatorSelection> | null => {
      const currentDoc = docRef.current;
      if (!currentDoc) return null;
      if (
        element.closest("[data-docs-staged-before], [data-docs-staged-after]")
      ) {
        return null;
      }
      const canvasEl = element.closest<HTMLElement>("[data-canvas-object-id]");
      if (canvasEl) {
        const objectId = canvasEl.getAttribute("data-canvas-object-id");
        const embeddingId = canvasEl
          .closest<HTMLElement>("[data-block-id]")
          ?.getAttribute("data-block-id");
        const embedding = embeddingId ? currentDoc.blocks[embeddingId] : undefined;
        const src =
          embedding && embedding.type === "canvas" && typeof embedding.props?.src === "string"
            ? embedding.props.src
            : null;
        if (!objectId || !src) return null;
        const canvasSrc = resolveBundleCanvasSrc(pathRef.current, src);
        const label = `Canvas object ${objectId}`;
        return {
          elements: [canvasEl],
          target: { kind: "canvas-object", canvasSrc, objectId, label },
          label,
        };
      }
      const blockEl = element.closest<HTMLElement>("[data-block-id]");
      const blockId = blockEl?.getAttribute("data-block-id");
      const block = blockId ? currentDoc.blocks[blockId] : undefined;
      if (!blockEl || !blockId || !block) return null;
      if (stagedBlockIdsRef.current.has(blockId)) return null;
      // Chip label mirrors the old layer's: registry descriptor label plus a
      // truncated text preview when the block has one.
      const typeLabel = getDocBlockDescriptor(block.type)?.label ?? block.type;
      const preview = truncateLabelText(blockEl.textContent ?? "");
      const label = preview ? `${typeLabel}: ${preview}` : typeLabel;
      return { elements: [blockEl], target: { kind: "block", blockId, label }, label };
    },
    [],
  );

  const handleAnnotateTargetSelect = useCallback(
    (resolved: ResolvedTarget<PlannotatorSelection>) => {
      // Canvas-object clicks are pinned by the embed's own onObjectSelect
      // path (which has the authoritative object identity); the layer only
      // supplies their hover affordance.
      if (resolved.target.kind === "canvas-object") return;
      setSelection(resolved.target);
    },
    [],
  );

  const handleAnnotateRangeSelect = useCallback(({ range }: { range: Range; text: string }) => {
    const rangeElement =
      range.commonAncestorContainer instanceof HTMLElement
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    if (
      rangeElement?.closest("[data-docs-staged-before], [data-docs-staged-after]")
    ) {
      return;
    }
    const mapped = blockTextRangeFromDomRange(range);
    if (
      !mapped ||
      !docRef.current?.blocks[mapped.blockId] ||
      stagedBlockIdsRef.current.has(mapped.blockId)
    ) {
      return;
    }
    setSelection({ kind: "text-range", ...mapped });
  }, []);

  // Selected ring + composer anchor elements for the pinned target: block
  // and text-range targets ring their block element; canvas objects ring the
  // object's element, falling back to the embedding canvas block.
  const resolveSelectedElements = useCallback((): HTMLElement[] | null => {
    const container = annotateContainerRef.current;
    const current = selectionRef.current;
    if (!container || !current) return null;
    if (current.kind === "block" || current.kind === "text-range") {
      const el = container.querySelector<HTMLElement>(
        `[data-block-id="${cssEscape(current.blockId)}"]`,
      );
      return el ? [el] : null;
    }
    const objectId = current.objectId ?? current.connectionId;
    if (objectId) {
      const el = container.querySelector<HTMLElement>(
        `[data-canvas-object-id="${cssEscape(objectId)}"]`,
      );
      if (el) return [el];
    }
    const currentDoc = docRef.current;
    if (currentDoc) {
      for (const embeddingId of canvasBlockIdsForSrc(
        currentDoc,
        pathRef.current,
        current.canvasSrc,
      )) {
        const el = container.querySelector<HTMLElement>(
          `[data-block-id="${cssEscape(embeddingId)}"]`,
        );
        if (el) return [el];
      }
    }
    return null;
  }, []);

  const targeting = useTargeting<PlannotatorSelection>({
    active: annotateActive,
    resolveTarget: resolveAnnotateTarget,
    onTargetSelect: handleAnnotateTargetSelect,
    onRangeSelect: handleAnnotateRangeSelect,
    // Annotate mode is the selector; text-range selection requires holding
    // Cmd (Ctrl on non-mac). A plain drag neither pins nor opens anything.
    rangeModifier: "meta",
    resolveSelected: resolveSelectedElements,
    resolveToken: `${annotateActive}:${bundle?.hash ?? "none"}:${canvasEpoch}:${
      selection ? JSON.stringify(selection) : "none"
    }`,
    // While the composer popover is open the hover ring/chip would chase the
    // pointer underneath it; the pinned selected ring is affordance enough.
    suppressHover: selection !== null,
  });

  useEffect(() => {
    if (!selection || selection.kind === "canvas-object") return;
    if (!doc?.blocks[selection.blockId] || stagedBlockIds.has(selection.blockId)) {
      setSelection(null);
    }
  }, [doc, selection, stagedBlockIds]);

  const handleComposerSubmit = useCallback(
    async (body: string) => {
      const current = selectionRef.current;
      if (!current) return;
      const requestTarget = selectionToDocEditTarget(current);
      if (requestTarget) {
        await lab.session.onFileRequest?.({
          annotationId: newLabAnnotationId(),
          disposition: "batch",
          target: requestTarget,
          body,
        });
      } else {
        // Canvas-object requests stay plain annotations: DocEditTarget has no
        // canvas kind and the request projection intentionally excludes them.
        await handleAddAnnotation({
          target: selectionToTarget(current),
          body,
          intent: "agent-request",
        });
      }
      setPaneError(null);
      setSelection(null);
    },
    [handleAddAnnotation, lab.session],
  );

  // In-flow composer insertion point (prompt-lab style): the TOP-LEVEL block
  // group holding the pinned target — the composer renders as a flow
  // insertion directly ABOVE it, pushing it and the rest down. Canvas
  // objects resolve through their embedding canvas block; anything that
  // doesn't resolve to a root child falls back to the top of the flow.
  const composerTopLevelId = useMemo(() => {
    if (!doc || !selection) return null;
    if (selection.kind === "block" || selection.kind === "text-range") {
      return topLevelAncestor(doc, selection.blockId);
    }
    for (const embeddingId of canvasBlockIdsForSrc(doc, path, selection.canvasSrc)) {
      const topLevel = topLevelAncestor(doc, embeddingId);
      if (topLevel) return topLevel;
    }
    return null;
  }, [doc, selection, path]);

  const handleCanvasObjectSelect = useCallback(
    ({ canvasSrc, objectId }: { canvasSrc: string; objectId: string }) =>
      setSelection({
        kind: "canvas-object",
        canvasSrc,
        objectId,
        label: `Canvas object ${objectId}`,
      }),
    [],
  );

  const waitingRequests = useMemo(() => {
    const byTopLevel = new Map<string, DocEditRequest[]>();
    if (!doc) return { byTopLevel };
    for (const request of lab.session.requests) {
      if (request.status !== "waiting") continue;
      if (request.target.kind === "doc") continue;
      const topLevel = topLevelAncestor(doc, request.target.blockId);
      if (!topLevel) continue;
      const rows = byTopLevel.get(topLevel) ?? [];
      rows.push(request);
      byTopLevel.set(topLevel, rows);
    }
    return { byTopLevel };
  }, [doc, lab.session.requests]);

  return { selectionRef, annotateContainerRef, targeting, stagedRegions, composerTopLevelId, handleComposerSubmit, handleCanvasObjectSelect, waitingRequests };
}
