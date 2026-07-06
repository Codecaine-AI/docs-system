"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { applyOps, type DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type { DocFlavourRenderContext } from "../flavour-registry";
import type { DocBlockSaveResult } from "../DocBlockRenderer";
import { useDocsClient, type DraftLockInfo } from "../client";
import { docToPM, pmToDoc, diffToOps, type PMNode } from "./convert";
import { TEXT_BLOCK_NODES } from "./schema";
import { ATOM_BLOCK_NODES_WITH_VIEWS } from "./node-views";
import { DocEditorNodeViewProvider } from "./node-view-context";
import { SlashMenu, SlashMenuPopover } from "./SlashMenu";
import { DocReference, ReferenceMention, ReferenceMentionPopover } from "./reference-node";
import { buildDocInputRules } from "./input-rules";

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
 */
export type DocEditorProps = {
  document: DocDocument;
  projectId?: string | null;
  documentPath?: string | null;
  renderCanvas?: DocFlavourRenderContext["renderCanvas"];
  resolveAssetSrc?: DocFlavourRenderContext["resolveAssetSrc"];
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
};

// D22: draft locks are dumb TTL (2-5 min), heartbeat-refreshed. Renewing
// every 75s is comfortably inside that TTL even if one heartbeat is dropped.
const HEARTBEAT_INTERVAL_MS = 75_000;

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
  onApplyOps,
  onReloadDoc,
  onEditorReady,
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
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: false },
        listItem: false,
        listKeymap: false,
        orderedList: false,
        paragraph: false,
        trailingNode: false,
      }),
      ...TEXT_BLOCK_NODES,
      ...ATOM_BLOCK_NODES_WITH_VIEWS,
      DocReference,
      SlashMenu,
      ReferenceMention,
      DocInputRules,
    ],
    content: docToPM(document) as unknown as Record<string, unknown>,
    editorProps: {
      attributes: {
        class: "docs-editor-prosemirror focus:outline-none",
        "data-doc-editor": "true",
      },
    },
    onUpdate: () => setIsDirty(true),
    immediatelyRender: false,
  });

  // Hand the editor instance to the host once it exists (test seam — see
  // the `onEditorReady` prop doc).
  useEffect(() => {
    if (editor) onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  // Re-seed the editor content whenever a NEW document identity/root arrives
  // from outside (e.g. after a reload following a stale save, or switching
  // to a different doc) — never on our own successful-save reconciliation,
  // which updates baseDocRef directly instead of round-tripping through this.
  const lastSeededDocRef = useRef<DocDocument>(document);
  useEffect(() => {
    if (!editor) return;
    if (document === lastSeededDocRef.current) return;
    lastSeededDocRef.current = document;
    baseDocRef.current = document;
    editor.commands.setContent(docToPM(document) as unknown as Record<string, unknown>);
    setIsDirty(false);
    setSaveError(null);
  }, [document, editor]);

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
    const currentDoc = pmToDoc(editor.getJSON() as PMNode, baseDocRef.current, makeBlockId);
    const ops = diffToOps(baseDocRef.current, currentDoc, makeBlockId);
    if (ops.length === 0) {
      setIsDirty(false);
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await onApplyOps(ops);
      if (result.ok) {
        // Advance the baseline to EXACTLY what the backend now has — i.e.
        // `ops` applied to the old baseline — not to `currentDoc`: diffToOps
        // may have re-identified doomed-survivor blocks (fresh ids for
        // flavour changes / subtree-delete escapees, see convert.ts), in
        // which case currentDoc's ids no longer match the backend and every
        // subsequent diff would emit ops against ids the backend doesn't
        // have. When no re-identification happened, applyOps(base, ops)
        // equals currentDoc anyway; any residual PM-attr id divergence
        // (rare) heals through delete+insert churn on later saves instead of
        // failing them.
        const reconciled = applyOps(baseDocRef.current, ops, makeBlockId);
        baseDocRef.current = reconciled.ok ? reconciled.doc : currentDoc;
        lastSeededDocRef.current = currentDoc;
        setIsDirty(false);
        if (projectId && documentPath) {
          void client?.releaseDraftLock?.(projectId, documentPath, "doc", sessionId).catch(
            () => {},
          );
        }
        setLockConflict(null);
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
    }
  }, [editor, isSaving, onApplyOps, projectId, documentPath, sessionId, client]);

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
        {projectId && <ReferenceMentionPopover editor={editor} projectId={projectId} />}
      </div>
    </DocEditorNodeViewProvider>
  );
}
