import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { AnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import type { PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import type { DocEditorSaveState } from "@codecaine-ai/docs-viewer/editor/doc-editor";
import { getBundle, getBacklinks, subscribeDocsEvents, type BacklinkRow } from "../../data/api";
import { projectStorage } from "../../data/project-storage";
import { consumeAiModeHandoff } from "./lab";
import type { BundleState, WorkbenchMode } from "./types";
import { canvasBlockIdsForSrc } from "./utils";
import { cssEscape } from "./dom";

/** The same document apart from its title. */
function sameExceptTitle(a: unknown, b: unknown): boolean {
  const strip = (doc: unknown) => JSON.stringify({ ...(doc as Record<string, unknown>), title: undefined });
  return strip(a) === strip(b);
}

export function useDocBundle({
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
  setCanvasEpoch
}: {
  path: string;
  bundle: BundleState | null;
  mode: WorkbenchMode;
  saveState: DocEditorSaveState;
  isStatic: boolean;
  canvasEpoch: number;
  contentRef: RefObject<HTMLDivElement | null>;
  highlightedIds: ReadonlySet<string>;
  flash: (ids: string[]) => void;
  setBundle: Dispatch<SetStateAction<BundleState | null>>;
  setAnnotations: Dispatch<SetStateAction<AnnotationsDocument | null>>;
  setAnnotationsHash: Dispatch<SetStateAction<string | null>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLoadedPath: Dispatch<SetStateAction<string | null>>;
  setBacklinks: Dispatch<SetStateAction<BacklinkRow[]>>;
  setLabPanelHidden: Dispatch<SetStateAction<boolean>>;
  setSaveState: Dispatch<SetStateAction<DocEditorSaveState>>;
  setSelection: Dispatch<SetStateAction<PlannotatorSelection | null>>;
  setPaneError: Dispatch<SetStateAction<string | null>>;
  setLastPatch: Dispatch<SetStateAction<{ patchId: string; changedIds: string[] } | null>>;
  setUndoNotice: Dispatch<SetStateAction<string | null>>;
  setCanvasEpoch: Dispatch<SetStateAction<number>>;
}) {
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
  // Outgoing editors can remain mounted during a fade. Their save flush
  // must retain the old page hash even after the next bundle has loaded.
  const expectedHashRef = useMemo(() => ({ current: undefined as string | undefined }), [path]);
  const pathRef = useRef(path);
  pathRef.current = path;
  /** The server title a skipped or failed keepDraft refresh left out of the bundle, or null. */
  const pendingTitleRef = useRef<string | null>(null);
  const fetchBundle = useCallback(
    /**
     * `keepDraft`: when the editor holds unsaved edits as the bundle arrives, the
     * page keeps its doc, because a new doc would reseed the editor over the draft.
     * It takes the new hash only when the doc differs from the page's doc by its
     * title alone, so an outside edit still meets the save's 409 conflict path.
     * A failed keepDraft fetch leaves the page as it is, with no error screen.
     * `submittedTitle` is the title the caller wrote: the hash is adopted only when
     * the fetched title is that one, so another actor's title meets the 409 path.
     * A skipped or failed keepDraft refresh runs again once the editor is clean.
     */
    async (options?: { showLoading?: boolean; keepDraft?: boolean; submittedTitle?: string }) => {
      const seq = ++loadSeqRef.current;
      if (options?.showLoading) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const payload = await getBundle(path);
        if (seq !== loadSeqRef.current) return;
        const live = liveStateRef.current;
        if (options?.keepDraft && live.mode === "edit" && live.saveState !== "saved") {
          const fetchedTitle = (payload.doc as { title?: string } | null)?.title;
          const ownTitle = options.submittedTitle === undefined || fetchedTitle === options.submittedTitle;
          if (live.doc && ownTitle && sameExceptTitle(payload.doc, live.doc)) expectedHashRef.current = payload.doc_hash;
          pendingTitleRef.current = fetchedTitle ?? null;
          return;
        }
        expectedHashRef.current = payload.doc_hash;
        setBundle({ doc: payload.doc as DocDocument, hash: payload.doc_hash });
        setAnnotations(payload.annotations ?? { schemaVersion: 1, annotations: [] });
        setAnnotationsHash(payload.annotations_hash);
        setError(null);
      } catch (loadError) {
        if (seq !== loadSeqRef.current) return;
        // A keepDraft refresh follows a write that already landed: on failure the page
        // stays as it is, so the editor and any draft stay mounted.
        if (options?.keepDraft) {
          pendingTitleRef.current = options.submittedTitle ?? null;
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Failed to load doc");
      } finally {
        if (seq === loadSeqRef.current) {
          setIsLoading(false);
          setLoadedPath(path);
        }
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
    if (consumeAiModeHandoff()) {
      setLabPanelHidden(false);
      try { projectStorage.setItem("docs-lab-panel-hidden", "false"); } catch {}
    }
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

  // Once the editor is clean, a title that a keepDraft refresh left out comes in.
  // A body save reply that already carries it clears the wait without a refetch.
  useEffect(() => {
    const pending = pendingTitleRef.current;
    if (pending === null || (mode === "edit" && saveState !== "saved")) return;
    pendingTitleRef.current = null;
    // The retry keeps a draft too: body edits can start again while it runs.
    if (bundle?.doc?.title !== pending) void fetchBundle({ keepDraft: true, submittedTitle: pending });
  }, [mode, saveState, bundle, fetchBundle]);

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

  return { expectedHashRef, pathRef, fetchBundle, fetchBundleRef, liveStateRef };
}
