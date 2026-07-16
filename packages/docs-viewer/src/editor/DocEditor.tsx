"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { applyOps, type DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type { DocBlockRenderContext } from "../render/block-registry";
import { INLINE_CODE_CLASSES } from "../render/block-classes";
import type { DocBlockSaveResult } from "../render/DocBlockRenderer";
import { useDocsClient, type DraftLockInfo } from "../client";
import { docToPM, pmToDoc, diffToOps, type PMNode } from "./core/convert";
import { TEXT_BLOCK_NODES } from "./core/schema";
import { DocItalic, DocStrike } from "../components/rich-text/editor-marks";
import { ATOM_BLOCK_NODES_WITH_VIEWS, DocCodeBlockWithView } from "./views/node-views";
import { DocDragHandle } from "./views/drag-handle";
import { DocCodeBlockHighlight } from "../components/code/editor-highlight";
import { DocEditorNodeViewProvider } from "./views/node-view-context";
import { SlashMenu, SlashMenuPopover } from "./menus/SlashMenu";
import { DocReference, ReferenceMention, ReferenceMentionPopover } from "./menus/reference-node";
import { LinkEditor, LinkEditorPopover } from "./menus/link-editor";
import { buildDocInputRules } from "./input/input-rules";
import { VideoDropHandler, type UploadVideoAsset } from "./input/video-embed";
import { ChangedFlash, setChangedFlashIds } from "./decorations/changed-flash";
import { DocKeymap } from "./input/keymap";
import { DocPlaceholder } from "./decorations/placeholder";

/**
 * M4 full block editor (Checkpoint 8, TG8.3) — composes schema.ts's PM node
 * types, node-views.tsx's atom NodeViews, SlashMenu.tsx, input-rules.ts,
 * reference-node.tsx's mention/reference extensions, and convert.ts's
 * doc.json <-> PM bridge into a single mounted TipTap editor that REPLACES
 * DocBlockRenderer's interim per-block textarea flow (TG5.2) wholesale.
 *
 * Save path: `pmToDoc(editor.getJSON(), baseDocRef.current, idFactory)`
 * reconstructs the edited DocDocument, `diffToOps` against the doc this
 * editor session STARTED from produces a small correct op batch, and
 * `onApplyOps` dispatches it through the same backend route the interim
 * editor used (`/docs/doc/ops`, hash precondition handled by the host's
 * `handleApplyBlockOps` — see DocsTab.tsx). On success, `baseDocRef` is
 * advanced to the freshly-saved doc so the next save's diff is against the
 * new baseline. On a stale (409) failure, the host is asked to reload the
 * bundle but THIS editor's in-progress content is left untouched (matching
 * the interim editor's "keep the draft, offer reload" UX).
 *
 * Auto-save (opt-in via `autoSave`, Notion-style hosts): the manual Save row
 * disappears and every edit schedules a debounced save (`autoSaveDelayMs`
 * idle, bounded by a max-wait so a continuous typist still persists).
 * Cmd/Ctrl+S stays as a manual flush, and the draft also flushes on window
 * blur, tab-hide, and unmount. A stale (409) result or a lock conflict
 * PAUSES the debounce — saving must not retry-loop into a known conflict —
 * and resumes when the host reloads the doc (reseed clears the error) or the
 * lock heartbeat re-acquires. `onSaveStateChange` reports the save state so
 * the host can render its own indicator (and gate SSE-driven refreshes on
 * "saved").
 */
export type DocEditorSaveState = "saved" | "dirty" | "saving" | "error";

export type DocEditorProps = {
  document: DocDocument;
  projectId?: string | null;
  documentPath?: string | null;
  renderCanvas?: DocBlockRenderContext["renderCanvas"];
  resolveAssetSrc?: DocBlockRenderContext["resolveAssetSrc"];
  /**
   * Host-injected asset uploader (same host-capability slot family as
   * `renderCanvas`/`resolveAssetSrc`): uploads a video file dropped onto the
   * editor and resolves to the bundle-relative `src` a `video` block's props
   * carry (e.g. `./assets/videos/demo.mp4`). Omit it and video-file drops
   * fall through to the browser default — docs-viewer stays host-neutral
   * about where bytes go.
   */
  uploadAsset?: UploadVideoAsset;
  onApplyOps: (ops: DocOp[]) => Promise<DocBlockSaveResult>;
  onReloadDoc?: () => void;
  /**
   * Receives the TipTap `Editor` instance once it exists. Primarily a test
   * seam: happy-dom's MutationObserver delivery isn't reliably synchronous
   * under load, so tests that only need "make the editor dirty" as a
   * precondition drive a real transaction through `editor.commands` instead
   * of racing the DOM-mutation pipeline (see DocEditor.test.tsx's
   * draft-lock suite). Hosts may also use it for imperative focus etc.
   */
  onEditorReady?: (editor: Editor) => void;
  /**
   * Notion-style always-editable mode: hides the Save button row and saves
   * automatically on a debounce (see the module doc comment). Off by default
   * — existing hosts (Spectre's docs tab) keep the explicit Save flow.
   */
  autoSave?: boolean;
  /** Debounce idle delay for `autoSave` (default 1s). The max-wait bound scales with it (5× , floor 5s) so a test passing a huge delay disables the max-wait flush too. */
  autoSaveDelayMs?: number;
  /** Reports every save-state transition so an autoSave host can render its own indicator. */
  onSaveStateChange?: (state: DocEditorSaveState) => void;
  /**
   * Block ids to mark with the transient `data-docs-changed` flash (SSE
   * change highlights). Rendered as a ProseMirror node decoration because
   * host-set DOM attributes don't survive inside the editor — PM's DOM
   * observer treats them as drift and strips them (see changed-flash.ts).
   */
  changedBlockIds?: ReadonlySet<string>;
};

// D22: draft locks are dumb TTL (2-5 min), heartbeat-refreshed. Renewing
// every 75s is comfortably inside that TTL even if one heartbeat is dropped.
const HEARTBEAT_INTERVAL_MS = 75_000;

// Auto-save debounce: ~1s idle feels Notion-like without saving per
// keystroke; the max-wait bound guarantees a continuous typist still
// persists every few seconds.
const AUTO_SAVE_DELAY_MS = 1_000;
const AUTO_SAVE_MAX_WAIT_MS = 5_000;

let idCounter = 0;

/** Mints a fresh block id — matches doc-ops.ts's `isId` charset (`[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}`). */
function makeBlockId(): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `pm-${Date.now().toString(36)}-${idCounter}-${random}`;
}

export default function DocEditor({
  document,
  projectId,
  documentPath,
  renderCanvas,
  resolveAssetSrc,
  uploadAsset,
  onApplyOps,
  onReloadDoc,
  onEditorReady,
  autoSave = false,
  autoSaveDelayMs,
  onSaveStateChange,
  changedBlockIds,
}: DocEditorProps) {
  // The doc this editing session's diff is computed against. Advances to the
  // freshly-saved doc after a successful save; left untouched on failure
  // (including 409-stale) so the in-progress edit + next retry diff correctly.
  const baseDocRef = useRef<DocDocument>(document);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ stale: boolean; message: string } | null>(null);

  // CP9 (TG9.3) draft locks — D22: best-effort dumb TTL locks, not a
  // correctness mechanism (the backend's hash-precondition check on save is
  // the real backstop). A stable per-mount id identifies this editing
  // session to the lock so our own heartbeats/release never conflict with
  // ourselves.
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = crypto.randomUUID();
  const sessionId = sessionIdRef.current;
  // Draft locks go through the host-provided DocsClient. The lock methods
  // are OPTIONAL on the client — a read-only client omits them and every
  // lock effect below simply stays inert (the backend hash precondition on
  // save remains the real correctness backstop, per D22).
  const client = useDocsClient();
  const [lockConflict, setLockConflict] = useState<DraftLockInfo | null>(null);
  const hasAcquiredRef = useRef(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const isSavingRef = useRef(isSaving);
  isSavingRef.current = isSaving;
  const saveErrorRef = useRef(saveError);
  saveErrorRef.current = saveError;
  const lockConflictRef = useRef(lockConflict);
  lockConflictRef.current = lockConflict;

  // ---- auto-save plumbing (all inert unless `autoSave`) ------------------
  const autoSaveDelay = autoSaveDelayMs ?? AUTO_SAVE_DELAY_MS;
  const autoSaveMaxWait = Math.max(AUTO_SAVE_MAX_WAIT_MS, autoSaveDelay * 5);
  // Monotonic edit counter. A save captures it before diffing; if it moved
  // by completion, keystrokes landed DURING the in-flight save, so the doc
  // must stay dirty and reschedule instead of being marked clean (the saved
  // snapshot predates those edits).
  const updateSeqRef = useRef(0);
  // Latest PM state doc, captured in onUpdate. The unmount flush diffs from
  // THIS (an immutable PM node, cheap to hold) because React may destroy the
  // TipTap editor instance before our cleanup runs.
  const pmDocRef = useRef<Editor["state"]["doc"] | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Wall-clock start of the current pending-edit window, for the max-wait
  // bound. Null whenever nothing is pending.
  const firstPendingEditAtRef = useRef<number | null>(null);
  const onApplyOpsRef = useRef(onApplyOps);
  onApplyOpsRef.current = onApplyOps;

  const cancelPendingAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current !== null) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  // Latest-render closures for callbacks referenced from stable contexts
  // (onUpdate, timers, unmount cleanups). Assigned below once the real
  // functions exist.
  const handleSaveRef = useRef<() => Promise<void>>(async () => {});
  const scheduleAutoSaveRef = useRef<() => void>(() => {});

  const scheduleAutoSave = useCallback(() => {
    if (!autoSave) return;
    // In-flight save: its completion reschedules if the seq counter moved —
    // a timer armed now would just fire into the isSaving early-return.
    if (isSavingRef.current) return;
    // Paused: a known 409 (until reload reseeds) or a lock conflict (until
    // the heartbeat re-acquires) — auto-retrying would loop into the same
    // rejection.
    if (saveErrorRef.current?.stale || lockConflictRef.current) return;
    const now = Date.now();
    if (firstPendingEditAtRef.current === null) firstPendingEditAtRef.current = now;
    const remainingMaxWait = firstPendingEditAtRef.current + autoSaveMaxWait - now;
    cancelPendingAutoSave();
    autoSaveTimerRef.current = setTimeout(
      () => {
        autoSaveTimerRef.current = null;
        void handleSaveRef.current();
      },
      Math.max(0, Math.min(autoSaveDelay, remainingMaxWait)),
    );
  }, [autoSave, autoSaveDelay, autoSaveMaxWait, cancelPendingAutoSave]);
  scheduleAutoSaveRef.current = scheduleAutoSave;

  const DocInputRules = useMemo(
    () =>
      Extension.create({
        name: "docInputRules",
        addInputRules() {
          return buildDocInputRules(this.editor);
        },
      }),
    [],
  );

  // Video paste/drop authoring (input/video-embed.ts). The extension list is
  // built once, but the host's `uploadAsset` prop identity may change per
  // render — the option is a GETTER over a latest-render ref (same pattern as
  // onApplyOpsRef above).
  const uploadAssetRef = useRef(uploadAsset);
  uploadAssetRef.current = uploadAsset;
  const DocVideoDrop = useMemo(
    () => VideoDropHandler.configure({ getUploadAsset: () => uploadAssetRef.current }),
    [],
  );

  const editor = useEditor({
    extensions: [
      // StarterKit supplies the top-level `doc`/`text` nodes (its
      // `Document`/`Text`) plus the bold/italic/strike/code marks + link +
      // undo/redo — every NODE type it would otherwise register (paragraph,
      // heading, lists, blockquote, codeBlock, horizontalRule) is disabled
      // since schema.ts's Doc* nodes replace them one-for-one (matching the
      // input-rules.test.ts harness convention). `trailingNode` is ALSO
      // disabled: its whole purpose is auto-inserting an empty trailing
      // paragraph so users can always click below the last block, but here
      // that would silently insert a real, persisted empty `docParagraph`
      // DocBlock into every saved doc (diffToOps has no way to distinguish
      // "the user's content" from "TipTap's UX filler") — violates the
      // save-boundary contract (a no-op edit must diff to zero ops).
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        // Inline `code` MARK spans get the same Notion-style chip as the
        // read surface (renderDeltaSpans) so a mark applied while typing
        // looks identical in and out of edit mode.
        code: { HTMLAttributes: { class: INLINE_CODE_CLASSES } },
        codeBlock: false,
        // The drop-line drawn while dragging blocks (grip reorder). The
        // class hands its look to the host stylesheet — docs-workbench
        // styles color/thickness/opacity via the style rail's
        // --docs-dropcursor-* vars.
        dropcursor: { class: "docs-drop-cursor", width: 3 },
        heading: false,
        horizontalRule: false,
        // Italic/strike are re-registered below WITHOUT their markdown
        // typing shortcuts (see DocItalic/DocStrike in rich-text
        // editor-nodes) — bold + inline code are the only auto-converting
        // marks.
        italic: false,
        strike: false,
        // linkOnPaste is ALSO off: link-editor.tsx's paste plugin owns
        // paste-URL-over-selection (Notion semantics), and a URL pasted at a
        // collapsed cursor must insert as plain text — TipTap's default
        // linkOnPaste would mark it.
        link: { openOnClick: false, autolink: false, linkOnPaste: false },
        listItem: false,
        listKeymap: false,
        orderedList: false,
        paragraph: false,
        trailingNode: false,
      }),
      // Italic/strike marks minus their markdown typing shortcuts (see the
      // StarterKit config above).
      DocItalic,
      DocStrike,
      // The code block swaps in its React node view (language picker); its
      // live-highlight decorations ride the extension right after.
      ...TEXT_BLOCK_NODES.filter((node) => node.name !== "docCodeBlock"),
      DocCodeBlockWithView,
      DocCodeBlockHighlight,
      ...ATOM_BLOCK_NODES_WITH_VIEWS,
      DocReference,
      SlashMenu,
      ReferenceMention,
      // Mod-K link popover + paste-URL-over-selection (authoring UI for the
      // link mark StarterKit already registers — autolink/openOnClick stay
      // off above; see link-editor.tsx).
      LinkEditor,
      // Paste/drop-a-video authoring: URL drops + file-drop upload (the
      // provider-URL PASTE path runs inside LinkEditor's handlePaste — see
      // input/video-embed.ts).
      DocVideoDrop,
      DocInputRules,
      ChangedFlash,
      // Notion-style Enter/Backspace behavior (sibling paragraph after a
      // heading, exit-list on empty item, ...) — see keymap.ts for why the
      // PM default splitBlock is wrong for the "docBlockText block*" shape.
      DocKeymap,
      // Gray placeholder hints on empty blocks (injects its own scoped CSS).
      DocPlaceholder,
      // Left-side ⠿ grip for reordering top-level blocks (drag rides PM's
      // native node-drag + the StarterKit dropCursor above).
      DocDragHandle,
    ],
    content: docToPM(document) as unknown as Record<string, unknown>,
    editorProps: {
      attributes: {
        class: "docs-editor-prosemirror focus:outline-none",
        "data-doc-editor": "true",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      updateSeqRef.current += 1;
      pmDocRef.current = updatedEditor.state.doc;
      setIsDirty(true);
      scheduleAutoSaveRef.current();
    },
    immediatelyRender: false,
  });

  // Hand the editor instance to the host once it exists (test seam — see
  // the `onEditorReady` prop doc).
  useEffect(() => {
    if (editor) onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  // Sync the host's changed-id flash set into the decoration plugin
  // (meta-only transaction — never dirties the doc).
  useEffect(() => {
    if (!editor || !changedBlockIds) return;
    setChangedFlashIds(editor, changedBlockIds);
  }, [editor, changedBlockIds]);

  // Re-seed the editor content whenever a NEW document identity/root arrives
  // from outside (e.g. after a reload following a stale save, or switching
  // to a different doc) — never on our own successful-save reconciliation,
  // which updates baseDocRef directly instead of round-tripping through this.
  const lastSeededDocRef = useRef<DocDocument>(document);
  useEffect(() => {
    if (!editor) return;
    if (document === lastSeededDocRef.current) return;
    lastSeededDocRef.current = document;
    // Identity changed but content didn't: typically the SSE echo of our own
    // save round-tripping back through the host's refetch (auto-save ->
    // file change -> events -> fetchBundle -> new object). setContent here
    // would destroy the caret/selection ~1s after every typing pause, so
    // only the diff baseline advances and in-progress edits (if any) stay.
    // A host reload after a 409 lands here too when the reloaded doc matches
    // our baseline — clearing the error below still unpauses auto-save.
    if (serializeDocDocument(document) === serializeDocDocument(baseDocRef.current)) {
      baseDocRef.current = document;
      setSaveError(null);
      return;
    }
    baseDocRef.current = document;
    cancelPendingAutoSave();
    firstPendingEditAtRef.current = null;
    editor.commands.setContent(docToPM(document) as unknown as Record<string, unknown>);
    setIsDirty(false);
    // Clearing the error also UNPAUSES auto-save after a 409: the host's
    // reload delivered a fresh doc, so the next edit may schedule again.
    setSaveError(null);
  }, [document, editor, cancelPendingAutoSave]);

  // Acquire the draft lock on the first dirty transition (not on every
  // render while dirty) — best-effort per D22: a network failure or thrown
  // error never blocks local editing, it's only logged. `hasAcquiredRef`
  // resets once the doc goes clean again (save/discard) so a later edit
  // re-acquires/re-checks the lock.
  useEffect(() => {
    if (!isDirty) {
      hasAcquiredRef.current = false;
      return;
    }
    if (!projectId || !documentPath) return;
    const acquire = client?.acquireDraftLock?.bind(client);
    if (!acquire) return;
    if (hasAcquiredRef.current) return;
    hasAcquiredRef.current = true;
    let cancelled = false;
    void acquire(projectId, documentPath, "doc", sessionId)
      .then((result) => {
        if (cancelled) return;
        setLockConflict(result.ok ? null : result.heldBy);
      })
      .catch((error) => {
        console.warn("acquireDraftLock failed (best-effort, ignoring):", error);
      });
    return () => {
      cancelled = true;
    };
  }, [isDirty, projectId, documentPath, sessionId, client]);

  // Heartbeat the lock on a fixed interval while dirty, renewing it well
  // inside the backend's TTL. Stops as soon as the doc goes clean or the
  // component unmounts.
  useEffect(() => {
    if (!isDirty || !projectId || !documentPath) return;
    const heartbeat = client?.heartbeatDraftLock?.bind(client);
    if (!heartbeat) return;
    const interval = setInterval(() => {
      void heartbeat(projectId, documentPath, "doc", sessionId)
        .then((result) => {
          // Clears a stale conflict too: if the other session released (or
          // its TTL lapsed), the heartbeat re-acquires and Save unblocks.
          setLockConflict(result.ok ? null : result.heldBy);
        })
        .catch((error) => {
          console.warn("heartbeatDraftLock failed (best-effort, ignoring):", error);
        });
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isDirty, projectId, documentPath, sessionId, client]);

  // Release the lock on unmount if the doc was still dirty (i.e. a lock may
  // still be held) — refs are used since this cleanup runs with whatever
  // values were captured at mount, not the latest render's.
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const documentPathRef = useRef(documentPath);
  documentPathRef.current = documentPath;
  const clientRef = useRef(client);
  clientRef.current = client;
  useEffect(() => {
    return () => {
      if (!isDirtyRef.current) return;
      const currentProjectId = projectIdRef.current;
      const currentDocumentPath = documentPathRef.current;
      if (!currentProjectId || !currentDocumentPath) return;
      const release = clientRef.current?.releaseDraftLock?.bind(clientRef.current);
      if (!release) return;
      void release(currentProjectId, currentDocumentPath, "doc", sessionId).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleSave = useCallback(async () => {
    if (!editor || isSaving) return;
    // This save subsumes any pending debounce; edits arriving while it is in
    // flight start a fresh window (via the seq-counter reschedule below).
    cancelPendingAutoSave();
    firstPendingEditAtRef.current = null;
    const seqAtStart = updateSeqRef.current;
    const currentDoc = pmToDoc(editor.getJSON() as PMNode, baseDocRef.current, makeBlockId);
    const ops = diffToOps(baseDocRef.current, currentDoc, makeBlockId);
    if (ops.length === 0) {
      setIsDirty(false);
      return;
    }
    setIsSaving(true);
    // Kept in sync manually (not just via the render-time mirror): the
    // scheduling decisions below run inside this same async function, before
    // any re-render has refreshed the mirror.
    isSavingRef.current = true;
    setSaveError(null);
    // Deferred past the `finally` so the fresh debounce window is armed
    // AFTER isSavingRef is false again (scheduleAutoSave skips while saving).
    let rescheduleAfter = false;
    try {
      const result = await onApplyOps(ops);
      if (result.ok) {
        if (result.doc) {
          // The host handed back the backend's post-save doc: it is both the
          // exact diff baseline for the next save AND — because hosts like
          // DocPage feed the SAME object back down as the `document` prop —
          // the identity token that lets the reseed effect above recognize
          // our own save reflected back and skip the cursor-resetting
          // setContent.
          baseDocRef.current = result.doc;
          lastSeededDocRef.current = result.doc;
        } else {
          // Advance the baseline to EXACTLY what the backend now has — i.e.
          // `ops` applied to the old baseline — not to `currentDoc`: diffToOps
          // may have re-identified doomed-survivor blocks (fresh ids for
          // block type changes / subtree-delete escapees, see convert.ts), in
          // which case currentDoc's ids no longer match the backend and every
          // subsequent diff would emit ops against ids the backend doesn't
          // have. When no re-identification happened, applyOps(base, ops)
          // equals currentDoc anyway; any residual PM-attr id divergence
          // (rare) heals through delete+insert churn on later saves instead of
          // failing them.
          const reconciled = applyOps(baseDocRef.current, ops, makeBlockId);
          baseDocRef.current = reconciled.ok ? reconciled.doc : currentDoc;
          lastSeededDocRef.current = currentDoc;
        }
        if (updateSeqRef.current !== seqAtStart) {
          // Keystrokes landed during the in-flight save: the doc is still
          // dirty relative to the new baseline. Keep the lock, keep the
          // dirty flag, and (in autoSave mode) arm a fresh debounce window.
          rescheduleAfter = true;
        } else {
          setIsDirty(false);
          if (projectId && documentPath) {
            void client?.releaseDraftLock?.(projectId, documentPath, "doc", sessionId).catch(
              () => {},
            );
          }
          setLockConflict(null);
        }
      } else {
        setSaveError({ stale: result.stale, message: result.message });
      }
    } catch (error) {
      setSaveError({
        stale: false,
        message: error instanceof Error ? error.message : "Failed to save document.",
      });
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
    if (rescheduleAfter) scheduleAutoSaveRef.current();
  }, [
    editor,
    isSaving,
    onApplyOps,
    projectId,
    documentPath,
    sessionId,
    client,
    cancelPendingAutoSave,
  ]);
  handleSaveRef.current = handleSave;

  // Cmd/Ctrl+S saves instead of triggering the browser's Save dialog.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  // Auto-save resume after a lock conflict: the 75s heartbeat clears
  // `lockConflict` once the other session releases (or its TTL lapses) — if
  // edits are still pending, arm the debounce they were denied.
  useEffect(() => {
    if (!autoSave || lockConflict) return;
    if (isDirtyRef.current) scheduleAutoSave();
  }, [autoSave, lockConflict, scheduleAutoSave]);

  // Auto-save flush on focus loss: window blur and tab-hide are the moments
  // a debounce window would otherwise silently outlive the user's attention.
  // (`window.document` throughout — the `document` PROP shadows the global.)
  useEffect(() => {
    if (!autoSave) return;
    const flush = () => {
      if (isDirtyRef.current) void handleSaveRef.current();
    };
    const onVisibilityChange = () => {
      if (window.document.visibilityState === "hidden") flush();
    };
    window.addEventListener("blur", flush);
    window.document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", flush);
      window.document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [autoSave]);

  // Auto-save flush on unmount (host navigated away / switched modes) —
  // fire-and-forget, diffed from the PM doc captured in onUpdate because the
  // TipTap instance may already be destroyed by the time this cleanup runs.
  // Skipped while paused: flushing into a known 409/423 can only re-fail.
  useEffect(() => {
    if (!autoSave) return;
    return () => {
      cancelPendingAutoSave();
      if (!isDirtyRef.current) return;
      if (saveErrorRef.current?.stale || lockConflictRef.current) return;
      const pmDoc = pmDocRef.current;
      if (!pmDoc) return;
      try {
        const currentDoc = pmToDoc(pmDoc.toJSON() as PMNode, baseDocRef.current, makeBlockId);
        const ops = diffToOps(baseDocRef.current, currentDoc, makeBlockId);
        if (ops.length > 0) void onApplyOpsRef.current(ops).catch(() => {});
      } catch {
        // Best-effort — a conversion failure must not break unmount.
      }
    };
  }, [autoSave, cancelPendingAutoSave]);

  // Save-state reporting for autoSave hosts (header indicator + SSE gating).
  useEffect(() => {
    if (!onSaveStateChange) return;
    onSaveStateChange(
      isSaving ? "saving" : saveError || lockConflict ? "error" : isDirty ? "dirty" : "saved",
    );
  }, [onSaveStateChange, isSaving, saveError, lockConflict, isDirty]);

  // beforeunload guard — a plain confirm-style guard is still the only way
  // to warn the user before a hard navigation/tab-close discards in-progress
  // edits. CP9 (TG9.3) draft-lock acquire/heartbeat/release (above) now runs
  // alongside this; here we additionally fire a best-effort release so the
  // lock doesn't sit held until its TTL expires.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      if (projectId && documentPath) {
        void client?.releaseDraftLock?.(projectId, documentPath, "doc", sessionId).catch(
          () => {},
        );
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, projectId, documentPath, sessionId, client]);

  const nodeViewContextValue = useMemo(
    () => ({ renderCanvas, resolveAssetSrc }),
    [renderCanvas, resolveAssetSrc],
  );

  if (!editor) return null;

  return (
    <DocEditorNodeViewProvider value={nodeViewContextValue}>
      <div data-doc-editor-root="true" className="relative">
        {/* autoSave hosts render their own indicator from onSaveStateChange — no manual Save row. */}
        {!autoSave && (
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isDirty && (
                <span
                  data-doc-editor-dirty="true"
                  className="inline-flex h-1.5 w-1.5 rounded-full bg-status-warning"
                  title="Unsaved changes"
                />
              )}
              {isDirty ? "Unsaved changes" : "Saved"}
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || !isDirty || !!lockConflict}
              className="rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
        {lockConflict && (
          <div
            data-doc-editor-lock-conflict="true"
            className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
          >
            Another session is editing this document (lock expires at{" "}
            {new Date(lockConflict.expiresAt).toLocaleTimeString()}). Saving is disabled until it
            is released.
          </div>
        )}
        {saveError && (
          <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            {saveError.stale ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>Doc changed elsewhere — reload to continue. Your edits are kept.</span>
                {onReloadDoc && (
                  <button
                    type="button"
                    className="rounded border border-destructive/40 px-1.5 py-0.5 font-medium hover:bg-destructive/10"
                    onClick={onReloadDoc}
                  >
                    Reload doc
                  </button>
                )}
              </div>
            ) : (
              saveError.message
            )}
          </div>
        )}
        <EditorContent editor={editor} />
        <SlashMenuPopover editor={editor} />
        <LinkEditorPopover editor={editor} />
        {projectId && <ReferenceMentionPopover editor={editor} projectId={projectId} />}
      </div>
    </DocEditorNodeViewProvider>
  );
}
