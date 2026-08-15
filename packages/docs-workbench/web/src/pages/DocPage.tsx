import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Undo2Icon } from "lucide-react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import {
  type AnnotationIntent,
  type AnnotationTarget,
  type AnnotationsDocument,
} from "@codecaine-ai/docs-model/annotations-schema";
import DocBlockRenderer, {
  // Shared with the side-peek panel so the two surfaces cannot drift apart.
  DOC_SURFACE_TYPOGRAPHY_CLASSES,
  type DocBlockSaveResult,
} from "@codecaine-ai/docs-viewer/doc-block-renderer";
import DocEditor, {
  type DocEditorSaveState,
} from "@codecaine-ai/docs-viewer/editor/doc-editor";
import { getDocBlockDescriptor } from "@codecaine-ai/docs-viewer";
import type { PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import {
  useTargeting,
  type ResolvedTarget,
} from "@codecaine-ai/annotations/react";
import {
  AliasChip,
  InlineComposer,
  InlineThreadBar,
  ProposalActionBar,
  acceptDisabledReason,
  rejectDisabledReason,
  type DocEditRequest,
  type DocEditTarget,
  type LabPanelTab,
} from "@codecaine-ai/docs-viewer/lab";
import { useTransientHighlights } from "@codecaine-ai/docs-viewer/use-transient-highlights";
import {
  resolveBundleAssetSrc,
  resolveBundleCanvasSrc,
  resolveBundleSequenceSrc,
} from "@codecaine-ai/docs-viewer/bundle-src";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";

import {
  ApiError,
  IS_STATIC,
  applyDocOps,
  assetUrl,
  addAnnotation,
  addAnnotationReply,
  getBacklinks,
  getBundle,
  getCanvasBySrc,
  moveDoc,
  resolveAnnotation,
  subscribeDocsEvents,
  undoPatch,
  uploadVideoAsset,
  type BacklinkRow,
} from "../data/api";
import { docSegmentFromTitle, docTitleFromPath } from "../lib/doc-title";
import { blockTextRangeFromDomRange } from "../lib/annotate-range";
import { DocLab } from "../lab/DocLab";
import { useDocLabSession } from "../lab/doc-lab-controller";
import { useDocsKernelSession } from "../lab/use-docs-kernel-session";
import {
  blocksInStagedRegions,
  buildDocLabStagedRegions,
  narrowDocToRootChildren,
  topLevelAncestor,
  type DocLabStagedRegion,
} from "../lab/doc-lab-regions";
import { StandaloneCanvasEmbed } from "./CanvasEmbed";
import { StandaloneSequenceEmbed } from "./SequenceEmbed";

/**
 * One doc bundle as a full workbench (standalone), two modes:
 *
 *  - EDIT (default): Notion-style always-editable DocEditor over the whole
 *    page — no read mode, no Save button. Edits auto-save on a debounce
 *    (Cmd/Ctrl+S = manual flush) as a minimal op batch through `/api/ops`
 *    with the current hash as precondition; a 409 keeps the draft, shows the
 *    stale banner with a reload option, and pauses auto-save; the draft-lock
 *    lifecycle (acquire-on-dirty / 75s heartbeat / release) runs through the
 *    DocsClient provided in App.tsx. The header shows a subtle
 *    Saving…/Saved/Not saved indicator, and the "Referenced by" backlinks
 *    footer renders below the editor.
 *  - ANNOTATE/AI: selected from the glass panel tab. The shared targeting UX
 *    covers blocks, text ranges, and canvas objects; clicking pins a target
 *    and opens InlineComposer beneath it. Block/range filings enter the docs
 *    edit session, while canvas objects remain plain annotations. The glass
 *    panel combines the request queue and list-only annotation threads.
 *
 * Live changes: an `/api/events` SSE subscription refreshes the open bundle
 * when ANOTHER actor changes it (self-echoes are filtered by session id in
 * api.ts) and flashes the changed block/canvas-object ids via
 * `useTransientHighlights` + the `data-docs-changed` CSS animation. While
 * the editor is CLEAN the refresh applies silently (the editor reseeds from
 * the new doc); while dirty/saving it is suppressed — the save-time 409 owns
 * conflict handling there, so an in-progress draft is never clobbered.
 *
 * Undo: a successful save records its `patch_id`; the header offers a
 * single-use "Undo last save" (a reused patch id 404s server-side and is
 * surfaced as "Already undone").
 *
 * Static exports have no write routes: IS_STATIC pins the page to a
 * read-only DocBlockRenderer (plus the backlinks footer) and hides the lab,
 * undo, save indicator, and the SSE subscription entirely.
 */

/** Static author label — the standalone app has no identity concept. */
const ANNOTATION_AUTHOR = "you";

type WorkbenchMode = "edit" | "annotate";

type BundleState = { doc: DocDocument; hash: string };

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}

/** Hover-chip text preview: whitespace-collapsed, truncated like the old layer's. */
function truncateLabelText(text: string, max = 42): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

/** The pinned selection as the annotation target it submits. */
function selectionToTarget(selection: PlannotatorSelection): AnnotationTarget {
  if (selection.kind === "block") return { kind: "block", blockId: selection.blockId };
  if (selection.kind === "text-range") {
    return {
      kind: "text-range",
      blockId: selection.blockId,
      start: selection.start,
      end: selection.end,
      quote: selection.quote,
    };
  }
  return {
    kind: "canvas-object",
    canvasSrc: selection.canvasSrc,
    objectId: selection.objectId,
    connectionId: selection.connectionId,
    region: selection.region,
  };
}

function selectionToDocEditTarget(
  selection: PlannotatorSelection,
): DocEditTarget | null {
  if (selection.kind === "block") {
    return { kind: "block", blockId: selection.blockId };
  }
  if (selection.kind === "text-range") {
    return {
      kind: "text-range",
      blockId: selection.blockId,
      start: selection.start,
      end: selection.end,
      quote: selection.quote,
    };
  }
  return null;
}

function newLabAnnotationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `docs-lab-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/**
 * Annotate-mode cursor affordance: blocks read as pick targets. Text stays
 * natively selectable — the Cmd/Ctrl+drag range flow reads the DOM selection
 * on release.
 */
const ANNOTATE_CURSOR_CSS = `
  [data-annotation-targeting="true"] [data-block-id] {
    cursor: crosshair;
    -webkit-user-select: text;
    user-select: text;
  }
`;

/** Ids of canvas blocks in `doc` whose resolved src equals `canvasSrc`. */
function canvasBlockIdsForSrc(
  doc: DocDocument,
  bundlePath: string,
  canvasSrc: string,
): string[] {
  const ids: string[] = [];
  for (const block of Object.values(doc.blocks)) {
    if (
      block.type === "canvas" &&
      typeof block.props?.src === "string" &&
      resolveBundleCanvasSrc(bundlePath, block.props.src) === canvasSrc
    ) {
      ids.push(block.id);
    }
  }
  return ids;
}

/** Canvas srcs referenced by the doc's canvas blocks + existing annotation targets. */
function referencedCanvasSrcs(
  doc: DocDocument | null,
  annotations: AnnotationsDocument | null,
  bundlePath: string,
): string[] {
  const srcs = new Set<string>();
  for (const annotation of annotations?.annotations ?? []) {
    if (annotation.target.kind === "canvas-object") srcs.add(annotation.target.canvasSrc);
  }
  if (doc) {
    for (const block of Object.values(doc.blocks)) {
      if (block.type === "canvas" && typeof block.props?.src === "string") {
        srcs.add(resolveBundleCanvasSrc(bundlePath, block.props.src));
      }
    }
  }
  return Array.from(srcs).sort();
}

type CanvasIndex = Record<
  string,
  { objectIds: ReadonlySet<string>; connectionIds: ReadonlySet<string> }
>;

export interface DocPageProps {
  path: string;
  /**
   * Test seam, forwarded to DocEditor's `onEditorReady`: happy-dom's DOM
   * mutation pipeline is unreliable for driving TipTap typing, so tests make
   * the editor dirty through `editor.commands` instead.
   */
  onEditorReady?: ComponentProps<typeof DocEditor>["onEditorReady"];
  /**
   * Static-export degradation override (defaults to the build-time flag):
   * true pins the page to a read-only render — no mode switcher, no undo,
   * no SSE subscription, no canvas-index fetching. Prop-injectable so tests
   * can cover the static shape without a static vite build.
   */
  isStatic?: boolean;
  /**
   * Test seam, forwarded to DocEditor: a large value keeps the auto-save
   * debounce from firing mid-test so conflict flows (409/423) can be staged
   * deterministically before an explicit Cmd+S flush.
   */
  autoSaveDelayMs?: number;
  /**
   * Fired after a page-title rename moves the bundle on disk (R2-D12).
   * The host owns what follows — navigate to the new path, refetch the
   * sidebar tree.
   */
  onDocMoved?: (newPath: string) => void;
}

export function DocPage({
  path,
  onEditorReady,
  isStatic = IS_STATIC,
  autoSaveDelayMs,
  onDocMoved,
}: DocPageProps) {
  const [bundle, setBundle] = useState<BundleState | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationsDocument | null>(null);
  const [annotationsHash, setAnnotationsHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [backlinks, setBacklinks] = useState<BacklinkRow[]>([]);

  const [mode, setMode] = useState<WorkbenchMode>("edit");
  const [saveState, setSaveState] = useState<DocEditorSaveState>("saved");
  const [selection, setSelection] = useState<PlannotatorSelection | null>(null);
  const [canvasIndex, setCanvasIndex] = useState<CanvasIndex | undefined>(undefined);
  const [paneError, setPaneError] = useState<string | null>(null);
  const [isAnnotationSubmitting, setIsAnnotationSubmitting] = useState(false);

  const [lastPatch, setLastPatch] = useState<{ patchId: string; changedIds: string[] } | null>(
    null,
  );
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoNotice, setUndoNotice] = useState<string | null>(null);

  /** Remount key for the rendered content — bumped when another actor changes an embedded canvas so the embeds refetch. */
  const [canvasEpoch, setCanvasEpoch] = useState(0);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  // Escape sets this so the following blur restores instead of committing.
  const revertTitleRef = useRef(false);

  // Page-title rename (R2-D12): committing an edited title re-slugs the
  // bundle folder name (numeric prefix kept) and moves the bundle through
  // the server — inbound references rewrite there; the host navigates and
  // refreshes the sidebar via onDocMoved.
  const commitTitleEdit = useCallback(async () => {
    const el = titleRef.current;
    if (!el) return;
    const current = docTitleFromPath(path);
    if (revertTitleRef.current) {
      revertTitleRef.current = false;
      el.textContent = current;
      return;
    }
    const next = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!next || next === current) {
      el.textContent = current;
      return;
    }
    const segments = path.replace(/\/+$/, "").split("/");
    const segment = segments.pop() ?? "";
    const newSegment = docSegmentFromTitle(next, segment);
    if (!newSegment || newSegment === segment) {
      el.textContent = current;
      return;
    }
    const newPath = [...segments, newSegment].join("/");
    try {
      await moveDoc(path, newPath);
      onDocMoved?.(newPath);
    } catch (error) {
      el.textContent = current;
      setPaneError(
        error instanceof Error ? `Rename failed: ${error.message}` : "Rename failed",
      );
    }
  }, [path, onDocMoved]);
  const { highlightedIds, flash } = useTransientHighlights();

  // ---------------------------------------------------------------------
  // Bundle + annotations loading
  // ---------------------------------------------------------------------

  const loadSeqRef = useRef(0);
  // Save precondition hash. Deliberately a SEPARATE ref from `bundle` (and
  // deliberately NOT cleared on path switch): when navigating away with
  // pending edits, DocEditor's unmount flush runs after the path-switch
  // effect has already nulled `bundle`, and its `/api/ops` call must still
  // carry the old doc's hash — an unconditioned save could silently clobber
  // remote changes.
  const expectedHashRef = useRef<string | undefined>(undefined);
  const pathRef = useRef(path);
  pathRef.current = path;
  const fetchBundle = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const seq = ++loadSeqRef.current;
      if (options?.showLoading) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const payload = await getBundle(path);
        if (seq !== loadSeqRef.current) return;
        expectedHashRef.current = payload.doc_hash;
        setBundle({ doc: payload.doc as DocDocument, hash: payload.doc_hash });
        setAnnotations(payload.annotations ?? { schemaVersion: 1, annotations: [] });
        setAnnotationsHash(payload.annotations_hash);
        setError(null);
      } catch (loadError) {
        if (seq !== loadSeqRef.current) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load doc");
      } finally {
        if (seq === loadSeqRef.current) setIsLoading(false);
      }
    },
    [path],
  );
  const fetchBundleRef = useRef(fetchBundle);
  fetchBundleRef.current = fetchBundle;

  useEffect(() => {
    setBundle(null);
    setAnnotations(null);
    setAnnotationsHash(null);
    setBacklinks([]);
    setMode("edit");
    setSaveState("saved");
    setSelection(null);
    setPaneError(null);
    setLastPatch(null);
    setUndoNotice(null);
    void fetchBundle({ showLoading: true });
    void getBacklinks(path)
      .then((rows) => setBacklinks(rows.filter((row) => row.targetKind === "doc")))
      .catch(() => {});
    // fetchBundle is keyed on path — this effect intentionally runs per path.
  }, [path, fetchBundle]);

  // ---------------------------------------------------------------------
  // Live change events (SSE) — serve mode only
  // ---------------------------------------------------------------------

  const liveStateRef = useRef<{
    path: string;
    doc: DocDocument | null;
    mode: WorkbenchMode;
    saveState: DocEditorSaveState;
  }>({ path, doc: null, mode, saveState });
  liveStateRef.current = { path, doc: bundle?.doc ?? null, mode, saveState };

  useEffect(() => {
    if (isStatic) return;
    return subscribeDocsEvents((event) => {
      const { path: openPath, doc, mode: currentMode, saveState: currentSaveState } =
        liveStateRef.current;
      // A CLEAN editor auto-applies remote changes silently (the fresh doc
      // reseeds it + the change flash marks what moved). While dirty/saving,
      // never auto-swap the doc under the draft — the save's hash
      // precondition (409 -> stale banner + reload) owns conflicts.
      const canRefresh = currentMode !== "edit" || currentSaveState === "saved";
      if (event.path === openPath || event.path === "") {
        if (canRefresh) void fetchBundleRef.current();
        flash(event.changedIds);
        return;
      }
      if (!doc) return;
      const embeddingIds = canvasBlockIdsForSrc(doc, openPath, event.path);
      if (embeddingIds.length > 0) {
        // A canvas sidecar embedded in the open doc changed: remount the
        // content so the embeds refetch, and flash the embedding blocks so
        // the change is visible even when the object itself isn't.
        if (canRefresh) setCanvasEpoch((epoch) => epoch + 1);
        flash([...event.changedIds, ...embeddingIds]);
      }
    });
  }, [flash]);

  // ---------------------------------------------------------------------
  // Changed-id highlight marking (data-docs-changed flash)
  // ---------------------------------------------------------------------

  useEffect(() => {
    const container = contentRef.current;
    if (!container || highlightedIds.size === 0) return;
    const marked: Element[] = [];
    for (const id of highlightedIds) {
      const matches = container.querySelectorAll(
        `[data-block-id="${cssEscape(id)}"], [data-canvas-object-id="${cssEscape(id)}"]`,
      );
      for (const element of matches) {
        // Never touch elements inside the editor's contenteditable:
        // ProseMirror owns that DOM and strips foreign attribute mutations
        // (its DOM observer treats them as drift). The editor renders its
        // own flash from `changedBlockIds` via a PM decoration instead.
        if (element.closest('[data-doc-editor="true"]')) continue;
        element.setAttribute("data-docs-changed", "true");
        marked.push(element);
      }
    }
    return () => {
      for (const element of marked) element.removeAttribute("data-docs-changed");
    };
  }, [highlightedIds, bundle, canvasEpoch, mode]);

  // ---------------------------------------------------------------------
  // Canvas object index (dangling-target detection for Plannotator)
  // ---------------------------------------------------------------------

  const doc = bundle?.doc ?? null;
  const canvasSrcs = useMemo(
    () => referencedCanvasSrcs(doc, annotations, path),
    [doc, annotations, path],
  );

  useEffect(() => {
    if (isStatic || mode !== "annotate") return;
    if (canvasSrcs.length === 0) {
      setCanvasIndex({});
      return;
    }
    let cancelled = false;
    setCanvasIndex(undefined); // loading — Plannotator skips canvas checks
    void Promise.all(
      canvasSrcs.map(async (src) => {
        try {
          const payload = await getCanvasBySrc(src);
          const canvas = payload.canvas as {
            objects?: Array<{ id: string }>;
            connections?: Array<{ id: string }>;
          };
          return [
            src,
            {
              objectIds: new Set((canvas.objects ?? []).map((object) => object.id)),
              connectionIds: new Set((canvas.connections ?? []).map((c) => c.id)),
            },
          ] as const;
        } catch {
          return null; // omitted -> detectDanglingTargets reports it dangling
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const index: CanvasIndex = {};
      for (const entry of entries) {
        if (entry) index[entry[0]] = entry[1];
      }
      setCanvasIndex(index);
    });
    return () => {
      cancelled = true;
    };
  }, [canvasSrcs, mode, canvasEpoch]);

  // ---------------------------------------------------------------------
  // Edit-mode save loop
  // ---------------------------------------------------------------------

  const handleApplyOps = useCallback(
    async (ops: DocOp[]): Promise<DocBlockSaveResult> => {
      try {
        const response = await applyDocOps(path, ops, expectedHashRef.current);
        // A late response from an unmount flush must not clobber the state
        // (bundle, hash, undo ledger) of a doc we have since navigated to —
        // the save itself still landed server-side.
        if (pathRef.current === path) {
          expectedHashRef.current = response.hash;
          setBundle({ doc: response.doc, hash: response.hash });
          setLastPatch({
            patchId: response.patch_id,
            changedIds: ops
              .map((op) => ("blockId" in op ? op.blockId : undefined))
              .filter((id): id is string => !!id),
          });
          setUndoNotice(null);
        }
        // Returning the server doc lets DocEditor advance its diff baseline
        // to exactly the backend state AND (same object identity as the
        // `document` prop after setBundle) skip the cursor-resetting reseed.
        return { ok: true, doc: response.doc };
      } catch (saveError) {
        if (saveError instanceof ApiError && saveError.status === 409) {
          return { ok: false, stale: true, message: "Document changed elsewhere." };
        }
        if (saveError instanceof ApiError && saveError.status === 423) {
          return {
            ok: false,
            stale: false,
            message: "Another session holds the draft lock for this document.",
          };
        }
        return {
          ok: false,
          stale: false,
          message: saveError instanceof Error ? saveError.message : "Failed to save document.",
        };
      }
    },
    [path],
  );

  const handleReloadDoc = useCallback(() => {
    void fetchBundle();
  }, [fetchBundle]);

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

  // ---------------------------------------------------------------------
  // Undo
  // ---------------------------------------------------------------------

  const handleUndo = useCallback(async () => {
    if (!lastPatch || isUndoing) return;
    setIsUndoing(true);
    setUndoNotice(null);
    try {
      const result = await undoPatch(lastPatch.patchId);
      if (result.ok) {
        setUndoNotice("Undo applied.");
        flash(lastPatch.changedIds);
        void fetchBundleRef.current();
      } else {
        setUndoNotice(result.alreadyUndone ? "Already undone." : result.detail);
      }
    } finally {
      // Single-use either way: success consumed it, 404 means it was
      // already consumed, other failures keep the server authoritative.
      setLastPatch(null);
      setIsUndoing(false);
    }
  }, [lastPatch, isUndoing, flash]);

  useEffect(() => {
    if (!undoNotice) return;
    const timer = setTimeout(() => setUndoNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [undoNotice]);

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  const resolveAssetSrc = useMemo(
    () => (src: string) => assetUrl(resolveBundleAssetSrc(path, src)),
    [path],
  );

  // Host uploader for video files dropped onto the editor (DocEditor's
  // `uploadAsset` slot): POSTs into this bundle's assets/videos/ and hands
  // back the bundle-relative src the inserted video block will carry.
  const handleUploadAsset = useCallback(
    async (file: File) => {
      const response = await uploadVideoAsset(path, file);
      return { src: response.src };
    },
    [path],
  );

  const renderEditorCanvas = useCallback(
    (input: { id: string; canvasId?: string; src?: string; view?: string; title?: string }) => (
      <StandaloneCanvasEmbed
        id={input.id}
        canvasId={input.canvasId}
        src={input.src ? resolveBundleCanvasSrc(path, input.src) : undefined}
        title={input.title}
        view={input.view}
        showEditAction
      />
    ),
    [path],
  );

  const renderEditorSequence = useCallback(
    (input: { id: string; sequenceId?: string; src?: string; title?: string }) => (
      <StandaloneSequenceEmbed
        id={input.id}
        sequenceId={input.sequenceId}
        src={input.src ? resolveBundleSequenceSrc(path, input.src) : undefined}
        title={input.title}
      />
    ),
    [path],
  );

  const handleModeChange = useCallback((next: WorkbenchMode) => {
    setMode(next);
    if (next !== "annotate") setSelection(null);
    setPaneError(null);
    // Leaving edit mode unmounts DocEditor (its unmount flush saves any
    // pending edits); entering it mounts a clean editor that re-reports.
    // Either way the stale indicator value must not linger.
    setSaveState("saved");
  }, []);

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

  const handleLabTabSelect = useCallback(
    (tab: LabPanelTab) => handleModeChange(tab === "ai" ? "annotate" : "edit"),
    [handleModeChange],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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

  // Composer anchors, re-read from the committed DOM (effect, not
  // render) so post-refresh elements are the ones measured.
  const [composerAnchors, setComposerAnchors] = useState<HTMLElement[] | null>(null);
  useEffect(() => {
    if (!annotateActive || !selection) {
      setComposerAnchors(null);
      return;
    }
    setComposerAnchors(resolveSelectedElements());
  }, [annotateActive, selection, bundle, canvasEpoch, resolveSelectedElements]);

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

  const composerPosition = useMemo(() => {
    const anchor = composerAnchors?.[0];
    const container = annotateContainerRef.current;
    if (!anchor || !container) return { top: 0, left: 0 };
    const anchorRect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      top: Math.max(0, anchorRect.bottom - containerRect.top + 8),
      left: Math.max(0, anchorRect.left - containerRect.left),
    };
  }, [composerAnchors]);

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
    const atDocument: DocEditRequest[] = [];
    const byTopLevel = new Map<string, DocEditRequest[]>();
    if (!doc) return { atDocument, byTopLevel };
    for (const request of lab.session.requests) {
      if (request.status !== "waiting") continue;
      if (request.target.kind === "doc") {
        atDocument.push(request);
        continue;
      }
      const topLevel = topLevelAncestor(doc, request.target.blockId);
      if (!topLevel) continue;
      const rows = byTopLevel.get(topLevel) ?? [];
      rows.push(request);
      byTopLevel.set(topLevel, rows);
    }
    return { atDocument, byTopLevel };
  }, [doc, lab.session.requests]);

  const renderThreadBars = (requests: readonly DocEditRequest[]): ReactNode =>
    requests.map((request) => {
      const latestAgent = [...request.thread]
        .reverse()
        .find((message) => message.author === "agent");
      return (
        <div key={`thread:${request.alias}`} className="mb-2">
          <InlineThreadBar
            alias={request.alias}
            message={latestAgent?.body ?? request.body}
            onReply={(body) =>
              void lab.session.onReplyToRequest?.(request.alias, body)
            }
          />
        </div>
      );
    });

  const renderDocRun = (
    sourceDoc: DocDocument,
    ids: readonly string[],
    key: string,
  ): ReactNode => {
    if (ids.length === 0) return null;
    return (
      <DocBlockRenderer
        key={key}
        document={narrowDocToRootChildren(sourceDoc, ids)}
        projectId="local"
        documentPath={`docs/${path}`}
        bundlePath={path}
        resolveAssetSrc={resolveAssetSrc}
        onCanvasObjectSelect={handleCanvasObjectSelect}
      />
    );
  };

  const renderStagedRegion = (region: DocLabStagedRegion): ReactNode => {
    const { proposal } = region;
    return (
      <section
        key={region.key}
        data-docs-staged-region={proposal.alias}
        className="my-3 space-y-2"
      >
        <ProposalActionBar
          alias={proposal.alias}
          summary={proposal.summary}
          acceptDisabledReason={acceptDisabledReason(
            lab.session.proposals,
            proposal.alias,
          )}
          rejectDisabledReason={rejectDisabledReason(
            lab.session.proposals,
            proposal.alias,
          )}
          onAccept={() => void lab.session.onAccept?.(proposal.alias)}
          onReject={() => void lab.session.onReject?.(proposal.alias)}
        />
        {lab.requestErrors[proposal.alias] ? (
          <p
            data-docs-staged-error={proposal.alias}
            className="text-xs text-destructive"
          >
            {lab.requestErrors[proposal.alias]}
          </p>
        ) : null}
        <div
          data-docs-staged-before={proposal.alias}
          className="rounded-sm border-l-2 px-3 py-1"
          style={{
            color: "var(--docs-annotation-del)",
            background: "var(--docs-annotation-del-bg)",
            borderColor: "var(--docs-annotation-del)",
          }}
        >
          {renderDocRun(doc!, region.beforeIds, `${region.key}:before`)}
        </div>
        <div
          data-docs-staged-after={proposal.alias}
          className="rounded-sm border-l-2 px-3 py-1"
          style={{
            color: "var(--docs-annotation-add)",
            background: "var(--docs-annotation-add-bg)",
            borderColor: "var(--docs-annotation-add)",
          }}
        >
          {renderDocRun(region.afterDoc, region.afterIds, `${region.key}:after`)}
        </div>
      </section>
    );
  };

  const renderAiDocumentFlow = (): ReactNode => {
    if (!doc) return null;
    const rootIds = doc.blocks[doc.root]?.children ?? [];
    const regionsAt = new Map<number, DocLabStagedRegion[]>();
    for (const region of stagedRegions) {
      const rows = regionsAt.get(region.startIndex) ?? [];
      rows.push(region);
      regionsAt.set(region.startIndex, rows);
    }
    const nodes: ReactNode[] = [];
    let cursor = 0;
    while (cursor < rootIds.length) {
      const starting = regionsAt.get(cursor) ?? [];
      const consuming = starting.filter((region) => region.endIndex >= cursor);
      const insertions = starting.filter((region) => region.endIndex < cursor);
      for (const region of insertions) nodes.push(renderStagedRegion(region));
      if (consuming.length > 0) {
        const targetIds = new Set(consuming.flatMap((region) => region.beforeIds));
        for (const id of targetIds) {
          nodes.push(renderThreadBars(waitingRequests.byTopLevel.get(id) ?? []));
        }
        for (const region of consuming) nodes.push(renderStagedRegion(region));
        cursor = Math.max(...consuming.map((region) => region.endIndex)) + 1;
        continue;
      }

      const id = rootIds[cursor]!;
      nodes.push(renderThreadBars(waitingRequests.byTopLevel.get(id) ?? []));
      let runEnd = cursor + 1;
      while (
        runEnd < rootIds.length &&
        !regionsAt.has(runEnd) &&
        !waitingRequests.byTopLevel.has(rootIds[runEnd]!)
      ) {
        runEnd += 1;
      }
      const run = rootIds.slice(cursor, runEnd);
      nodes.push(renderDocRun(doc, run, `untouched:${run.join(":")}`));
      cursor = runEnd;
    }
    for (const region of regionsAt.get(rootIds.length) ?? []) {
      nodes.push(renderStagedRegion(region));
    }
    return nodes;
  };

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading {path}...</div>;
  }
  if (error) {
    return (
      <div className="p-8 text-sm">
        <div className="font-medium text-destructive">Failed to load doc bundle</div>
        <div className="mt-1 text-muted-foreground">
          {path}: {error}
        </div>
      </div>
    );
  }
  if (!doc) return null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-docs-mode={mode}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={path}>
          docs/{path}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isStatic && mode === "edit" && (
            <span
              data-docs-save-state={saveState}
              className="text-xs text-muted-foreground"
              aria-live="polite"
            >
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : "Not saved"}
            </span>
          )}
          {undoNotice && (
            <span data-docs-undo-notice="" className="text-xs text-muted-foreground">
              {undoNotice}
            </span>
          )}
          {!isStatic && lastPatch && (
            <button
              type="button"
              data-docs-undo=""
              disabled={isUndoing}
              onClick={() => void handleUndo()}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Undo2Icon className="h-3 w-3" />
              {isUndoing ? "Undoing..." : "Undo last save"}
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1">
          <div data-docs-scroller="" className="h-full min-h-0 overflow-y-auto">
          <div
            key={canvasEpoch}
            ref={contentRef}
            data-docs-annotation-wash={mode === "annotate" ? "" : undefined}
            className="mx-auto w-full max-w-[var(--style-content-width,100ch)] px-[var(--style-content-margin,2rem)] pt-[var(--style-content-top,1.5rem)] pb-[var(--style-content-bottom,1.5rem)]"
            style={
              mode === "annotate"
                ? { background: "var(--docs-annotation-wash)" }
                : undefined
            }
          >
            {/* Fixed page furniture, not a block: mirrors the sidebar name
                so page and tree read as one thing (R2-D11). Lives outside
                the editor/renderer, so it can't be selected or dragged.
                Click to rename (R2-D12): Enter/blur commits — the bundle
                folder re-slugs (numeric prefix kept) and the sidebar
                follows; Escape reverts. Keyed by path so a rename or
                navigation always remounts with clean text. */}
            <h1
              key={path}
              ref={titleRef}
              className="docs-page-title"
              contentEditable={!isStatic}
              suppressContentEditableWarning
              spellCheck={false}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  revertTitleRef.current = true;
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => void commitTitleEdit()}
            >
              {docTitleFromPath(path)}
            </h1>
            {isStatic ? (
              // Static-export degradation: no write routes, so no editor —
              // the plain read-only renderer.
              <div className={DOC_SURFACE_TYPOGRAPHY_CLASSES}>
                <DocBlockRenderer
                  document={doc}
                  projectId="local"
                  documentPath={`docs/${path}`}
                  bundlePath={path}
                  resolveAssetSrc={resolveAssetSrc}
                />
              </div>
            ) : mode === "edit" ? (
              <div className={DOC_SURFACE_TYPOGRAPHY_CLASSES}>
                <DocEditor
                  // Keyed by path so navigating away UNMOUNTS this instance
                  // while its onApplyOps still closes over the old path —
                  // the unmount flush must save the doc it was editing, not
                  // the doc being navigated to.
                  key={path}
                  document={doc}
                  projectId="local"
                  documentPath={path}
                  renderCanvas={renderEditorCanvas}
                  renderSequence={renderEditorSequence}
                  resolveAssetSrc={resolveAssetSrc}
                  uploadAsset={handleUploadAsset}
                  onApplyOps={handleApplyOps}
                  onReloadDoc={handleReloadDoc}
                  onEditorReady={onEditorReady}
                  autoSave
                  autoSaveDelayMs={autoSaveDelayMs}
                  onSaveStateChange={setSaveState}
                  changedBlockIds={highlightedIds}
                />
              </div>
            ) : (
              /* Shared targeting container: targeting overlays, staged
                 review regions, waiting threads, and the inline composer. */
              <div
                ref={(element) => {
                  annotateContainerRef.current = element;
                  targeting.containerRef.current = element;
                }}
                {...targeting.containerProps}
                // Escape closes the anchored composer and drops the pinned
                // target (the popover itself has no Escape handling).
                onKeyDown={(event) => {
                  if (event.key === "Escape" && selectionRef.current) {
                    event.stopPropagation();
                    setSelection(null);
                  }
                }}
                className={cn("relative", DOC_SURFACE_TYPOGRAPHY_CLASSES)}
              >
                {lab.staleProposals.length > 0 && (
                  <div
                    data-docs-stale-proposals=""
                    className="mb-3 space-y-1 rounded-md border p-2"
                  >
                    {lab.staleProposals.map((proposal) => {
                      const alias =
                        proposal.alias ??
                        lab.session.requests.find(
                          (request) => request.annotationId === proposal.annotationId,
                        )?.alias ??
                        proposal.id.slice(0, 8);
                      return (
                        <div
                          key={proposal.id}
                          data-docs-stale-proposal={alias}
                          className="flex items-center gap-2 text-xs"
                        >
                          <AliasChip alias={alias} />
                          <span className="min-w-0 flex-1 truncate">
                            {proposal.summary}
                          </span>
                          <span
                            className="rounded border px-1 py-0.5 text-[10px]"
                            style={{
                              color: "var(--docs-annotation-del)",
                              background: "var(--docs-annotation-del-bg)",
                              borderColor: "var(--docs-annotation-del)",
                            }}
                          >
                            stale
                          </span>
                          <button
                            type="button"
                            aria-label={`Reject ${alias}`}
                            className="rounded border px-2 py-0.5"
                            onClick={() => void lab.session.onReject?.(alias)}
                          >
                            Reject
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {renderThreadBars(waitingRequests.atDocument)}
                {renderAiDocumentFlow()}
                {targeting.overlays}
                {selection && (
                  <div
                    className="absolute z-20"
                    style={composerPosition}
                    data-docs-inline-composer-anchor=""
                  >
                    <InlineComposer
                      onSubmit={(body) => {
                        void handleComposerSubmit(body).catch((submitError) => {
                          setPaneError(
                            submitError instanceof Error
                              ? submitError.message
                              : "Failed to file request.",
                          );
                        });
                      }}
                      onCancel={() => setSelection(null)}
                      documentTarget={false}
                    />
                  </div>
                )}
                <style>{ANNOTATE_CURSOR_CSS}</style>
              </div>
            )}

            {(isStatic || mode === "edit") && backlinks.length > 0 && (
              <footer className="mt-10 border-t pt-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Referenced by
                </div>
                <ul className="mt-2 space-y-1">
                  {[...new Set(backlinks.map((row) => row.sourcePath))].map((sourcePath) => {
                    // Index sources are doc.json / canvas sidecar file paths;
                    // link to the owning bundle folder.
                    const owningBundle = sourcePath
                      .replace(/\/assets\/canvases\/[^/]+$/i, "")
                      .replace(/\/doc\.json$/i, "");
                    return (
                      <li key={sourcePath}>
                        <a
                          href={`#/${owningBundle}`}
                          className="font-mono text-xs text-primary underline underline-offset-2"
                        >
                          {sourcePath}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </footer>
            )}
          </div>
          </div>
          {!isStatic && (
            <DocLab
              tab={mode === "annotate" ? "ai" : "edit"}
              onTabSelect={handleLabTabSelect}
              doc={doc}
              outlineScrollerSelector="[data-docs-scroller]"
              lab={lab}
              threads={{
                annotations: annotations?.annotations ?? [],
                document: doc,
                canvases: canvasIndex,
                selection,
                onClearSelection: () => setSelection(null),
                onAddAnnotation: handleAddAnnotation,
                onAddReply: handleAddReply,
                onResolveAnnotation: handleResolveAnnotation,
                onFocusTarget: handleFocusTarget,
                isSubmitting: isAnnotationSubmitting,
                error: paneError,
              }}
              onFocusTarget={handleFocusDocEditTarget}
            />
          )}
        </div>
      </div>
    </div>
  );
}
