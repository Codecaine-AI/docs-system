import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { MessageSquareIcon, PencilIcon, Undo2Icon } from "lucide-react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type {
  CommentIntent,
  CommentTarget,
  CommentsDocument,
} from "@codecaine-ai/docs-model/comments-schema";
import DocBlockRenderer, {
  type DocBlockSaveResult,
} from "@codecaine-ai/docs-viewer/doc-block-renderer";
import DocEditor, {
  type DocEditorSaveState,
} from "@codecaine-ai/docs-viewer/editor/doc-editor";
import DocTargetingLayer from "@codecaine-ai/docs-viewer/doc-targeting-layer";
import type { PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import { useTransientHighlights } from "@codecaine-ai/docs-viewer/use-transient-highlights";
import {
  resolveBundleAssetSrc,
  resolveBundleCanvasSrc,
} from "@codecaine-ai/docs-viewer/bundle-src";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";

import {
  ApiError,
  IS_STATIC,
  applyDocOps,
  assetUrl,
  addComment,
  getBacklinks,
  getBundle,
  getCanvasBySrc,
  resolveComment,
  subscribeDocsEvents,
  undoPatch,
  type BacklinkRow,
} from "./api";
import { ActionPane } from "./ActionPane";
import { StandaloneCanvasEmbed } from "./CanvasEmbed";

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
 *  - ANNOTATE: Plannotator over blocks and canvas objects — click a
 *    `[data-block-id]` wrapper or a canvas object to select it, compose a
 *    comment in the side pane, resolve from the list. Dangling targets are
 *    detected against the live doc + a lazily-fetched canvas object index.
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
 * read-only DocBlockRenderer (plus the backlinks footer) and hides the mode
 * switcher, undo, save indicator, and the SSE subscription entirely.
 */

/** Static author label — the standalone app has no identity concept. */
const COMMENT_AUTHOR = "you";

type WorkbenchMode = "edit" | "annotate";

type BundleState = { doc: DocDocument; hash: string };

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}

/** Ids of canvas blocks in `doc` whose resolved src equals `canvasSrc`. */
function canvasBlockIdsForSrc(
  doc: DocDocument,
  bundlePath: string,
  canvasSrc: string,
): string[] {
  const ids: string[] = [];
  for (const block of Object.values(doc.blocks)) {
    if (
      block.flavour === "canvas" &&
      typeof block.props?.src === "string" &&
      resolveBundleCanvasSrc(bundlePath, block.props.src) === canvasSrc
    ) {
      ids.push(block.id);
    }
  }
  return ids;
}

/** Canvas srcs referenced by the doc's canvas blocks + existing comment targets. */
function referencedCanvasSrcs(
  doc: DocDocument | null,
  comments: CommentsDocument | null,
  bundlePath: string,
): string[] {
  const srcs = new Set<string>();
  for (const comment of comments?.comments ?? []) {
    if (comment.target.kind === "canvas-object") srcs.add(comment.target.canvasSrc);
  }
  if (doc) {
    for (const block of Object.values(doc.blocks)) {
      if (block.flavour === "canvas" && typeof block.props?.src === "string") {
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
}

export function DocPage({
  path,
  onEditorReady,
  isStatic = IS_STATIC,
  autoSaveDelayMs,
}: DocPageProps) {
  const [bundle, setBundle] = useState<BundleState | null>(null);
  const [comments, setComments] = useState<CommentsDocument | null>(null);
  const [commentsHash, setCommentsHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [backlinks, setBacklinks] = useState<BacklinkRow[]>([]);

  const [mode, setMode] = useState<WorkbenchMode>("edit");
  const [saveState, setSaveState] = useState<DocEditorSaveState>("saved");
  const [selection, setSelection] = useState<PlannotatorSelection | null>(null);
  const [canvasIndex, setCanvasIndex] = useState<CanvasIndex | undefined>(undefined);
  const [paneError, setPaneError] = useState<string | null>(null);
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);

  const [lastPatch, setLastPatch] = useState<{ patchId: string; changedIds: string[] } | null>(
    null,
  );
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoNotice, setUndoNotice] = useState<string | null>(null);

  /** Remount key for the rendered content — bumped when another actor changes an embedded canvas so the embeds refetch. */
  const [canvasEpoch, setCanvasEpoch] = useState(0);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const { highlightedIds, flash } = useTransientHighlights();

  // ---------------------------------------------------------------------
  // Bundle + comments loading
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
        setComments(payload.comments ?? { schemaVersion: 1, comments: [] });
        setCommentsHash(payload.comments_hash);
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
    setComments(null);
    setCommentsHash(null);
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

  // Selected-annotation-target ring (annotate mode): the targeting layer
  // renders the ring overlay from this id ([data-block-id] or
  // [data-canvas-object-id]); null clears it (e.g. composer cancel).
  const selectedTargetId =
    selection == null
      ? null
      : selection.kind === "block"
        ? selection.blockId
        : (selection.objectId ?? selection.connectionId ?? null);

  // ---------------------------------------------------------------------
  // Canvas object index (dangling-target detection for Plannotator)
  // ---------------------------------------------------------------------

  const doc = bundle?.doc ?? null;
  const canvasSrcs = useMemo(
    () => referencedCanvasSrcs(doc, comments, path),
    [doc, comments, path],
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
  // Comments
  // ---------------------------------------------------------------------

  const commentsHashRef = useRef(commentsHash);
  commentsHashRef.current = commentsHash;

  const handleAddComment = useCallback(
    async (input: { target: CommentTarget; body: string; intent: CommentIntent }) => {
      setIsCommentSubmitting(true);
      try {
        const response = await addComment(path, {
          ...input,
          author: COMMENT_AUTHOR,
          expectedHash: commentsHashRef.current,
        });
        setComments(response.comments);
        setCommentsHash(response.hash);
        setPaneError(null);
      } catch (commentError) {
        // Refresh so a retry runs against the current hash, then surface the
        // failure in Plannotator's composer (it catches and displays).
        void fetchBundleRef.current();
        throw commentError;
      } finally {
        setIsCommentSubmitting(false);
      }
    },
    [path],
  );

  const handleResolveComment = useCallback(
    async (commentId: string) => {
      try {
        const response = await resolveComment(path, commentId, commentsHashRef.current);
        setComments(response.comments);
        setCommentsHash(response.hash);
        setPaneError(null);
      } catch (resolveError) {
        setPaneError(
          resolveError instanceof Error ? resolveError.message : "Failed to resolve comment.",
        );
        void fetchBundleRef.current();
      }
    },
    [path],
  );

  const handleFocusTarget = useCallback(
    (target: CommentTarget) => {
      const container = contentRef.current;
      const ids: string[] = [];
      let scrollTo: Element | null = null;
      if (target.kind === "block") {
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

  const renderEditorCanvas = useCallback(
    (input: { id: string; canvasId?: string; src?: string; view?: string; title?: string }) => (
      <StandaloneCanvasEmbed
        id={input.id}
        canvasId={input.canvasId}
        src={input.src ? resolveBundleCanvasSrc(path, input.src) : undefined}
        title={input.title}
        view={input.view}
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

  // Block selection via the framework targeting layer (hover chip +
  // pinpoint click). Canvas-object selection stays on the canvas embed's own
  // object-select surface (onCanvasObjectSelect below) — the layer
  // intentionally ignores clicks on [data-canvas-object-id] elements.
  const docRef = useRef(doc);
  docRef.current = doc;
  const handleTargetSelect = useCallback(
    (target: { label: string; anchor: { block_id?: string | null } }) => {
      const blockId = target.anchor.block_id;
      if (!blockId || !docRef.current?.blocks[blockId]) return;
      setSelection({ kind: "block", blockId, label: target.label });
    },
    [],
  );

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

  const modeButtons: Array<{ value: WorkbenchMode; label: string; icon: typeof PencilIcon }> = [
    { value: "edit", label: "Edit", icon: PencilIcon },
    { value: "annotate", label: "Annotate", icon: MessageSquareIcon },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5">
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
          {!isStatic && (
            <div
              className="flex shrink-0 items-center gap-1 rounded-md bg-muted p-0.5"
              role="group"
              aria-label="Docs workbench mode"
            >
              {modeButtons.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  aria-label={`${label} mode`}
                  title={`${label} mode`}
                  data-docs-mode={value}
                  onClick={() => handleModeChange(value)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                    mode === value
                      ? "bg-background text-foreground shadow-sm ring-1 ring-primary/30"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div key={canvasEpoch} ref={contentRef} className="mx-auto w-full max-w-[88ch] px-5 py-6 sm:px-8">
            {isStatic ? (
              // Static-export degradation: no write routes, so no editor —
              // the plain read-only renderer.
              <div className="spectre-markdown prose prose-sm dark:prose-invert relative max-w-none font-sans text-sm leading-[1.7]">
                <DocBlockRenderer
                  document={doc}
                  projectId="local"
                  documentPath={`docs/${path}`}
                  bundlePath={path}
                  resolveAssetSrc={resolveAssetSrc}
                />
              </div>
            ) : mode === "edit" ? (
              <div className="spectre-markdown prose prose-sm dark:prose-invert relative max-w-none font-sans text-sm leading-[1.7]">
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
                  resolveAssetSrc={resolveAssetSrc}
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
              <DocTargetingLayer
                mode="pinpoint"
                contentHash={bundle?.hash ?? null}
                documentPath={`docs/${path}`}
                document={doc}
                canvasIndex={canvasIndex}
                selectedTargetId={selectedTargetId}
                onTargetSelect={handleTargetSelect}
                className="spectre-markdown prose prose-sm dark:prose-invert relative max-w-none font-sans text-sm leading-[1.7]"
              >
                <DocBlockRenderer
                  document={doc}
                  projectId="local"
                  documentPath={`docs/${path}`}
                  bundlePath={path}
                  resolveAssetSrc={resolveAssetSrc}
                  onCanvasObjectSelect={({ canvasSrc, objectId }) =>
                    setSelection({ kind: "canvas-object", canvasSrc, objectId })
                  }
                />
              </DocTargetingLayer>
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

        {mode === "annotate" && (
          <aside
            className="w-[360px] shrink-0 overflow-y-auto border-l bg-sidebar/40 p-3"
            aria-label="Comments pane"
            data-docs-action-pane=""
          >
            <ActionPane
              comments={comments?.comments ?? []}
              document={doc}
              canvases={canvasIndex}
              selection={selection}
              onClearSelection={() => setSelection(null)}
              onAddComment={handleAddComment}
              onResolveComment={handleResolveComment}
              onFocusTarget={handleFocusTarget}
              isSubmitting={isCommentSubmitting}
              error={paneError}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
