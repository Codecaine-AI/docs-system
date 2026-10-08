import { projectStorage } from "../../data/project-storage";
import { PageTransition } from "@codecaine-ai/docs-viewer/page-transition";
import { useCallback, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import type { AnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import DocEditor, { type DocEditorSaveState } from "@codecaine-ai/docs-viewer/editor/doc-editor";
import type { PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import { DOCK_DEFAULT_WIDTH } from "@codecaine-ai/docs-viewer/lab";
import { useTransientHighlights } from "@codecaine-ai/docs-viewer/use-transient-highlights";
import { resolveBundleCanvasSrc, resolveBundleSequenceSrc } from "@codecaine-ai/docs-viewer/bundle-src";
import { IS_STATIC, type BacklinkRow } from "../../data/api";
import { StandaloneCanvasEmbed } from "../../shared/_components/CanvasEmbed";
import { StandaloneSequenceEmbed } from "../../shared/_components/SequenceEmbed";
import type { BundleState, WorkbenchMode } from "./types";
import { PageActions } from "./_components/PageActions";
import { DocPageContent } from "./_components/DocPageContent";
import { AiDocumentFlow } from "./_components/AiDocumentFlow";
import { DocLab } from "./_components/DocLab";
import { useTitleRename } from "./useTitleRename";
import { useDocBundle } from "./useDocBundle";
import { useDocSave } from "./useDocSave";
import { useDocAnnotations } from "./useDocAnnotations";
import { useDocLabWiring } from "./useDocLabWiring";
import { useUndo } from "./useUndo";
import { useRendererAssets } from "./useRendererAssets";
import { useModeChange } from "./useModeChange";
import { useAnnotateTargeting } from "./useAnnotateTargeting";

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
 *  - ANNOTATE/AI: opened from the AI toolbar toggle. The shared targeting UX
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

export type DocPageProps = {
  path: string;
  /** Hides the floating lab dock while a side preview uses the adjacent column. */
  sidePeekOpen?: boolean;
  /**
   * The style rail's layout.alignment. "centered" centers the page column
   * only while no right-side panel (lab panel, side peek) is open; otherwise
   * the page renders left-anchored exactly as "left" does.
   */
  alignment?: "left" | "centered";
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
  /**
   * The shell topbar's action slot (App renders it). DocPage portals its page
   * actions there: the save indicator, the undo notice and button, and the AI
   * panel toggle. Null or absent renders no actions (tests, static exports).
   */
  topbarActionsTarget?: HTMLElement | null;
};

export function DocPage({
  path,
  sidePeekOpen = false,
  alignment = "left",
  onEditorReady,
  isStatic = IS_STATIC,
  autoSaveDelayMs,
  onDocMoved,
  topbarActionsTarget = null,
}: DocPageProps) {
  const [bundle, setBundle] = useState<BundleState | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationsDocument | null>(null);
  const [annotationsHash, setAnnotationsHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [backlinks, setBacklinks] = useState<BacklinkRow[]>([]);

  // Reserved width of the lab rail (push layout, not overlay); GlassPanel
  // reports its real width on tab changes via onPanelWidthChange.
  const [labPanelHidden, setLabPanelHidden] = useState(() => {
    try {
      return projectStorage.getItem("docs-lab-panel-hidden") !== "false";
    } catch {
      return true;
    }
  });
  const mode: WorkbenchMode = labPanelHidden ? "edit" : "annotate";
  const labPanelVisible = !isStatic && !sidePeekOpen && !labPanelHidden;
  // Centered only while the right side is free: an open lab panel or side
  // peek needs the left-anchored layout (and its paddingRight reserve).
  const centered = alignment === "centered" && !labPanelVisible && !sidePeekOpen;
  const [labPanelWidth, setLabPanelWidth] = useState<number>(DOCK_DEFAULT_WIDTH);
  const [saveState, setSaveState] = useState<DocEditorSaveState>("saved");
  const [selection, setSelection] = useState<PlannotatorSelection | null>(null);
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

  const { commitTitleEdit } = useTitleRename({
    path,
    titleRef,
    revertTitleRef,
    onDocMoved,
    setPaneError,
  });
  const { highlightedIds, flash } = useTransientHighlights();
  const { expectedHashRef, pathRef, fetchBundle, fetchBundleRef, liveStateRef } = useDocBundle({
    path,
    bundle,
    mode,
    saveState,
    isStatic,
    canvasEpoch,
    contentRef,
    highlightedIds,
    flash,
    setBundle,
    setAnnotations,
    setAnnotationsHash,
    setIsLoading,
    setError,
    setLoadedPath,
    setBacklinks,
    setLabPanelHidden,
    setSaveState,
    setSelection,
    setPaneError,
    setLastPatch,
    setUndoNotice,
    setCanvasEpoch,
  });

  const doc = bundle?.doc ?? null;
  const { handleApplyOps, handleReloadDoc } = useDocSave({
    path,
    expectedHashRef,
    pathRef,
    fetchBundle,
    setBundle,
    setLastPatch,
    setUndoNotice,
  });
  const { handleAddAnnotation, handleResolveAnnotation, handleAddReply } = useDocAnnotations({
    path,
    annotationsHash,
    fetchBundleRef,
    setAnnotations,
    setAnnotationsHash,
    setPaneError,
    setIsAnnotationSubmitting,
  });
  const { kernelSession, lab, handleFocusTarget, handleFocusDocEditTarget } = useDocLabWiring({
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
    setBundle,
  });
  const { handleUndo } = useUndo({
    lastPatch,
    isUndoing,
    undoNotice,
    flash,
    fetchBundleRef,
    setIsUndoing,
    setUndoNotice,
    setLastPatch,
  });
  const { resolveAssetSrc, handleUploadAsset } = useRendererAssets({
    path,
  });
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
  const { handleModeChange } = useModeChange({
    setLabPanelHidden,
    setSelection,
    setPaneError,
    setSaveState,
  });
  const { selectionRef, annotateContainerRef, targeting, stagedRegions, composerTopLevelId, handleComposerSubmit, handleCanvasObjectSelect, waitingRequests } = useAnnotateTargeting({
    doc,
    selection,
    isStatic,
    mode,
    path,
    pathRef,
    bundle,
    canvasEpoch,
    lab,
    setSelection,
    setPaneError,
    handleModeChange,
    handleAddAnnotation,
  });

  // Page actions live in the shell topbar (App's action slot). They render
  // outside PageTransition, so a page change keeps one set of buttons (and
  // the focus on them) instead of fading a second set in.
  const topbarActions =
    !isStatic && topbarActionsTarget
      ? createPortal(
          <PageActions
            {...{ mode, saveState, undoNotice, lastPatch, isUndoing, handleUndo, labPanelHidden, sidePeekOpen, labPanelVisible, handleModeChange }}
          />,
          topbarActionsTarget,
        )
      : null;

  return (
    <>
      {topbarActions}
      <PageTransition pageKey={path} ready={!isLoading && loadedPath === path} className="flex h-full min-h-0 flex-col">
        <DocPageContent {...{ isLoading, path, error, doc, mode, canvasEpoch, contentRef, labPanelVisible, labPanelWidth, titleRef, isStatic, revertTitleRef, commitTitleEdit, resolveAssetSrc, renderEditorCanvas, renderEditorSequence, handleUploadAsset, handleApplyOps, handleReloadDoc, onEditorReady, autoSaveDelayMs, setSaveState, highlightedIds, annotateContainerRef, targeting, selectionRef, setSelection, lab, backlinks, sidePeekOpen, centered }} labPanel={<DocLab hidden={labPanelHidden} doc={doc!} openDocPath={path} lab={lab} onPanelWidthChange={setLabPanelWidth} annotationsError={paneError} onFocusTarget={handleFocusDocEditTarget} />} aiDocumentFlow={<AiDocumentFlow {...{ doc, path, stagedRegions, composerTopLevelId, selection, waitingRequests, lab, resolveAssetSrc, handleCanvasObjectSelect, handleComposerSubmit, setPaneError, setSelection }} />} />
      </PageTransition>
    </>
  );
}
