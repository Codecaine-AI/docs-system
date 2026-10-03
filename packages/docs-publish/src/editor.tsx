import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import DocEditor, { type DocEditorSaveState } from '../../docs-viewer/src/editor/DocEditor';
import { DocsClientProvider, type AcquireDraftLockResult, type CanvasEmbedProps, type DocsClient, type SequenceEmbedProps, type DocsTreeNode, type DraftLockKind } from '../../docs-viewer/src/client';
import type { DocBlockSaveResult } from '../../docs-viewer/src/render/DocBlockRenderer';
import { resolveBundleAssetSrc, resolveBundleCanvasSrc, resolveBundleSequenceSrc } from '../../docs-viewer/src/render/bundle-src';
import type { DocDocument } from '../../docs-model/src/doc-schema';
import type { DocOp } from '../../docs-model/src/doc-ops';
import { StandaloneCanvasEmbed } from '../../docs-workbench/web/src/pages/CanvasEmbed';
import { StandaloneSequenceEmbed } from '../../docs-workbench/web/src/pages/SequenceEmbed';
import { validateInteractiveCanvasDocument, type InteractiveCanvasDocument } from '../../../external/canvas/packages/canvas/src/state/schema';
import { validateSequenceDocument, type SequenceDocument } from '../../../external/sequence/packages/sequence/src/schema';
import { loadPublishedFonts } from './browser-fonts';

/**
 * Local draft editor for static-site hosts: mounts the Docs app's DocEditor
 * (Notion-style auto-save) over a same-origin proxy of one project's Docs
 * `/api`. Deployed pages never load this entry; they stay static HTML.
 */
export type DraftEditorStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'locked';
export type DraftEditorOptions = {
  /** Same-origin base URL proxying the project's Docs `/api` (no trailing slash needed). */
  api: string;
  /** Docs-root-relative bundle path, e.g. `publishing-proof`. */
  path: string;
  projectId?: string;
  onStatus?: (state: DraftEditorStatus, detail?: string) => void;
};
export type DraftEditorHandle = { reload(): Promise<void>; destroy(): void };

type Bundle = { doc: DocDocument; doc_hash: string; document_path?: string };
class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly payload: Record<string, unknown> | null) { super(message); }
}

const SESSION_KEY = 'codecaine-docs-draft-session-id';
let fallbackSessionId: string | null = null;
/** One id per tab, shared by draft locks and ops so the server's lock guard admits our own writes. */
function tabSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return (fallbackSessionId ??= crypto.randomUUID());
  }
}

const isAbsoluteUrl = (src: string) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src);

function createApi(base: string) {
  const root = base.replace(/\/+$/, '');
  const request = async <T,>(route: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${root}/${route}`, init);
    if (!response.ok) {
      let payload: Record<string, unknown> | null = null;
      try { payload = await response.json(); } catch { /* non-JSON error body */ }
      throw new HttpError(typeof payload?.detail === 'string' ? payload.detail : `HTTP ${response.status}`, response.status, payload);
    }
    return response.json() as Promise<T>;
  };
  const post = <T,>(route: string, body: unknown) => request<T>(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const lock = async (endpoint: 'acquire' | 'heartbeat', path: string, kind: DraftLockKind): Promise<AcquireDraftLockResult> => {
    const response = await fetch(`${root}/draft-lock/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, kind, sessionId: tabSessionId() }) });
    const payload = await response.json() as AcquireDraftLockResult & { detail?: string };
    // 423 (held by another session) is a normal lock result, not a failure.
    if (!response.ok && response.status !== 423) throw new HttpError(payload.detail ?? `HTTP ${response.status}`, response.status, null);
    return payload;
  };
  return {
    url: (route: string) => `${root}/${route}`,
    bundle: (path: string) => request<Bundle>(`bundle?path=${encodeURIComponent(path)}`),
    tree: () => request<{ tree: DocsTreeNode[] }>('tree'),
    canvas: (src: string) => request<{ canvas: unknown }>(`canvas?src=${encodeURIComponent(src)}`),
    sequence: (src: string) => request<{ sequence: unknown }>(`sequence?src=${encodeURIComponent(src)}`),
    ops: (path: string, ops: DocOp[], expectedHash: string) =>
      post<{ doc: DocDocument; hash: string; patch_id: string; normalization?: { ops: DocOp[]; message: string } }>('ops', { path, ops, expected_hash: expectedHash, session_id: tabSessionId() }),
    uploadVideo: (path: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('bundlePath', path);
      return request<{ src: string }>('assets/video', { method: 'POST', body: form });
    },
    acquire: (path: string, kind: DraftLockKind) => lock('acquire', path, kind),
    heartbeat: (path: string, kind: DraftLockKind) => lock('heartbeat', path, kind),
    release: (path: string, kind: DraftLockKind) => post<unknown>('draft-lock/release', { path, kind, sessionId: tabSessionId() }).then(() => undefined),
  };
}
type Api = ReturnType<typeof createApi>;

const frameClass = 'not-prose my-4 rounded-md border bg-background p-4 text-sm text-muted-foreground';

type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };
/** Loads a sidecar through the proxy, then hands validated data to the Docs app's embed. */
function useSidecar<T>(src: string | undefined, load: (src: string) => Promise<Loaded<T>>) {
  const [state, setState] = useState<{ src?: string; value?: T; error?: string }>({});
  useEffect(() => {
    if (!src) return;
    let current = true;
    setState({ src });
    load(src).then(
      result => { if (current) setState(result.ok ? { src, value: result.value } : { src, error: result.error }); },
      error => { if (current) setState({ src, error: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { current = false; };
  }, [src, load]);
  return state.src === src ? state : {};
}

function ProxyCanvas({ api, input }: { api: Api; input: { id: string; canvasId?: string; src?: string; view?: string; title?: string } }) {
  const load = useCallback(async (src: string): Promise<Loaded<InteractiveCanvasDocument>> => {
    const validation = validateInteractiveCanvasDocument((await api.canvas(src)).canvas);
    return validation.ok ? { ok: true, value: validation.document } : { ok: false, error: validation.issues.map(issue => issue.message).join('; ') };
  }, [api]);
  const { value, error } = useSidecar<InteractiveCanvasDocument>(input.src, load);
  if (!input.src) return <StandaloneCanvasEmbed id={input.id} canvasId={input.canvasId} title={input.title} view={input.view} />;
  if (error) return <section className={frameClass} data-docs-block-type="canvas" data-source-id={input.id}><div className="font-medium text-destructive">Canvas failed to load</div><div className="mt-1">{error}</div></section>;
  if (!value) return <section className={frameClass} data-docs-block-type="canvas" data-source-id={input.id}>Loading canvas...</section>;
  return <StandaloneCanvasEmbed key={input.src} id={input.id} initialDocument={value} title={input.title} view={input.view} />;
}

function ProxySequence({ api, input }: { api: Api; input: { id: string; sequenceId?: string; src?: string; title?: string } }) {
  const load = useCallback(async (src: string): Promise<Loaded<SequenceDocument>> => {
    const sequence = (await api.sequence(src)).sequence;
    const validation = validateSequenceDocument(sequence);
    return validation.ok ? { ok: true, value: sequence as SequenceDocument } : { ok: false, error: validation.errors.join('; ') };
  }, [api]);
  const { value, error } = useSidecar<SequenceDocument>(input.src, load);
  if (!input.src) return <StandaloneSequenceEmbed id={input.id} sequenceId={input.sequenceId} title={input.title} />;
  if (error) return <section className={frameClass} data-docs-block-type="sequence" data-source-id={input.id}><div className="font-medium text-destructive">Sequence failed to load</div><div className="mt-1">{error}</div></section>;
  if (!value) return <section className={frameClass} data-docs-block-type="sequence" data-source-id={input.id}>Loading sequence...</section>;
  return <StandaloneSequenceEmbed key={input.src} id={input.id} initialDocument={value} title={input.title} />;
}

type HostProps = {
  api: Api; path: string; projectId: string; doc: DocDocument; client: DocsClient;
  onApplyOps: (ops: DocOp[]) => Promise<DocBlockSaveResult>;
  onReloadDoc: () => void;
  onSaveStateChange: (state: DocEditorSaveState) => void;
};

function DraftEditorHost({ api, path, projectId, doc, client, onApplyOps, onReloadDoc, onSaveStateChange }: HostProps) {
  const resolveAssetSrc = useCallback((src: string) => isAbsoluteUrl(src) ? src : api.url(`asset?path=${encodeURIComponent(resolveBundleAssetSrc(path, src))}`), [api, path]);
  const renderCanvas = useCallback((input: { id: string; canvasId?: string; src?: string; view?: string; title?: string }) =>
    <ProxyCanvas api={api} input={{ ...input, src: input.src ? resolveBundleCanvasSrc(path, input.src) : undefined }} />, [api, path]);
  const renderSequence = useCallback((input: { id: string; sequenceId?: string; src?: string; title?: string }) =>
    <ProxySequence api={api} input={{ ...input, src: input.src ? resolveBundleSequenceSrc(path, input.src) : undefined }} />, [api, path]);
  const uploadAsset = useCallback(async (file: File) => ({ src: (await api.uploadVideo(path, file)).src }), [api, path]);
  // Provider slots receive srcs already canonicalized by DocBlockRenderer (doc peeks).
  const embeds = useMemo(() => ({
    canvas: (props: CanvasEmbedProps) => <ProxyCanvas api={api} input={props} />,
    sequence: (props: SequenceEmbedProps) => <ProxySequence api={api} input={props} />,
  }), [api]);
  return (
    <DocsClientProvider client={client} canvasEmbed={embeds.canvas} sequenceEmbed={embeds.sequence}>
      <div className="docs-markdown">
        <DocEditor
          document={doc}
          projectId={projectId}
          documentPath={path}
          renderCanvas={renderCanvas}
          renderSequence={renderSequence}
          resolveAssetSrc={resolveAssetSrc}
          uploadAsset={uploadAsset}
          onApplyOps={onApplyOps}
          onReloadDoc={onReloadDoc}
          onSaveStateChange={onSaveStateChange}
          autoSave
        />
      </div>
    </DocsClientProvider>
  );
}

/**
 * Replaces `container`'s children with the Docs editor for `path`. Rejects
 * (leaving the container untouched) when the initial bundle cannot load.
 */
export async function mountDraftEditor(container: HTMLElement, options: DraftEditorOptions): Promise<DraftEditorHandle> {
  const { path, onStatus } = options;
  // Embedded diagrams measure text: load the measured fonts (they re-lay out when they arrive).
  void loadPublishedFonts();
  const projectId = options.projectId ?? 'local';
  const api = createApi(options.api);
  let bundle: Bundle;
  try {
    bundle = await api.bundle(path);
  } catch (error) {
    onStatus?.('error', error instanceof Error ? error.message : String(error));
    throw error;
  }
  let doc = bundle.doc;
  let hash = bundle.doc_hash;
  let editorState: DocEditorSaveState = 'saved';
  // Why the editor last reported "error": DocEditor folds stale saves and
  // lock conflicts into one state, while the host contract distinguishes them.
  let failure: { status: 'conflict' | 'locked' | 'error'; detail: string } | null = null;
  let lockHeldBy: string | null = null;
  let destroyed = false;
  let lastReported = '';

  const report = () => {
    if (destroyed) return;
    let status: DraftEditorStatus = editorState;
    let detail: string | undefined;
    if (editorState === 'error') {
      if (lockHeldBy) { status = 'locked'; detail = `Draft lock held by another session until ${lockHeldBy}.`; }
      else if (failure) { status = failure.status; detail = failure.detail; }
    }
    const key = `${status}\u0000${detail ?? ''}`;
    if (key === lastReported) return;
    lastReported = key;
    onStatus?.(status, detail);
  };
  const trackLock = (result: AcquireDraftLockResult) => {
    lockHeldBy = result.ok ? null : result.heldBy.expiresAt;
    return result;
  };

  const client: DocsClient = {
    getDocsTree: () => api.tree(),
    getDocBundle: async (_projectId, bundlePath) => {
      try {
        const payload = await api.bundle(bundlePath);
        return { doc: payload.doc, documentPath: payload.document_path };
      } catch {
        return null;
      }
    },
    // DocEditor mints a per-mount lock id; substitute the tab id so locks and ops agree.
    acquireDraftLock: (_projectId, lockPath, kind) => api.acquire(lockPath, kind).then(trackLock),
    heartbeatDraftLock: (_projectId, lockPath, kind) => api.heartbeat(lockPath, kind).then(trackLock),
    releaseDraftLock: (_projectId, lockPath, kind) => api.release(lockPath, kind),
  };

  const onApplyOps = async (ops: DocOp[]): Promise<DocBlockSaveResult> => {
    try {
      const response = await api.ops(path, ops, hash);
      hash = response.hash;
      doc = response.doc;
      failure = null;
      render();
      // Returning the server doc (the same object now passed as `document`)
      // advances DocEditor's diff baseline without resetting the caret.
      return { ok: true, doc: response.doc, normalization: response.normalization };
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        failure = { status: 'conflict', detail: 'Document changed elsewhere. Reload to continue; your edits are kept until then.' };
        return { ok: false, stale: true, message: 'Document changed elsewhere.' };
      }
      if (error instanceof HttpError && error.status === 423) {
        failure = { status: 'locked', detail: 'Another session holds the draft lock for this document.' };
        return { ok: false, stale: false, message: 'Another session holds the draft lock for this document.' };
      }
      const message = error instanceof Error ? error.message : 'Failed to save document.';
      failure = { status: 'error', detail: message };
      return { ok: false, stale: false, message };
    }
  };

  const loadAndSeed = async (force: boolean) => {
    const next = await api.bundle(path);
    if (destroyed) return;
    if (!force && (next.doc_hash === hash || editorState !== 'saved')) return;
    hash = next.doc_hash;
    doc = next.doc;
    failure = null;
    render();
  };
  // Explicit "Reload doc" from the stale banner discards the local draft, as in the Docs app.
  const onReloadDoc = () => { void loadAndSeed(true).catch(error => onStatus?.('error', error instanceof Error ? error.message : String(error))); };
  const onSaveStateChange = (state: DocEditorSaveState) => { editorState = state; report(); };

  container.replaceChildren();
  container.classList.add('docs-draft-editor');
  const root: Root = createRoot(container);
  function render() {
    if (destroyed) return;
    root.render(<DraftEditorHost api={api} path={path} projectId={projectId} doc={doc} client={client} onApplyOps={onApplyOps} onReloadDoc={onReloadDoc} onSaveStateChange={onSaveStateChange} />);
  }
  render();

  return {
    async reload() {
      if (destroyed || editorState !== 'saved') return;
      await loadAndSeed(false);
    },
    destroy() {
      if (destroyed) return;
      // Unmount first: DocEditor's unmount flush still saves pending edits.
      root.unmount();
      destroyed = true;
      container.classList.remove('docs-draft-editor');
    },
  };
}
