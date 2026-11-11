import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, fireEvent, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import sampleDoc from '../../docs-model/src/__fixtures__/sample.doc.json';
import { DOC_PEEK_CLOSE_EVENT, mountDraftEditor, type DraftEditorHandle, type DraftEditorOptions, type SpectreRef } from './editor';

/**
 * The mounted handle's flush()/destroy() promises: they settle only after
 * the saves and draft-lock releases they started have, and never reject.
 * fetch is stubbed per route; an ops response can be held open with a
 * deferred so "in flight" is observable.
 */

type Deferred = { promise: Promise<Response>; resolve: (response: Response) => void };
function deferred(): Deferred {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(r => { resolve = r; });
  return { promise, resolve };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let requests: string[] = [];
/** Bundles by path; any other path 404s. */
let bundles: Record<string, unknown> = {};
let opsResponse: () => Promise<Response>;
const realFetch = globalThis.fetch;
const realWarn = console.warn;
let warnings: string[] = [];
let container: HTMLElement;
let handle: DraftEditorHandle | null = null;

beforeEach(() => {
  requests = [];
  bundles = { proof: sampleDoc };
  warnings = [];
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
  opsResponse = async () => json({ doc: sampleDoc, hash: 'h2', patch_id: 'p1' });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const [route = '', query = ''] = String(input).replace(/^\/api\//, '').split('?');
    requests.push(route);
    if (route === 'bundle') {
      const doc = bundles[new URLSearchParams(query).get('path') ?? ''];
      return doc ? json({ doc, doc_hash: 'h1' }) : json({ detail: 'not found' }, 404);
    }
    if (route === 'ops') return opsResponse();
    if (route.startsWith('draft-lock/')) return json({ ok: true, lock: { sessionId: 's', acquiredAt: '', expiresAt: '' } });
    return json({ detail: 'not found' }, 404);
  }) as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (handle) await act(() => handle!.destroy());
  handle = null;
  container.remove();
  globalThis.fetch = realFetch;
  console.warn = realWarn;
});

async function mount(extra: Partial<DraftEditorOptions> = {}) {
  handle = await act(() => mountDraftEditor(container, { api: '/api', path: 'proof', ...extra }));
  let editor: Editor | undefined;
  await waitFor(() => {
    editor = (container.querySelector('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null)?.editor;
    expect(editor).toBeDefined();
  });
  return editor!;
}

/** Type into the first text node (an auto-save debounce starts; destroy/flush beat it). */
function edit(editor: Editor) {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText) at = pos + node.nodeSize;
  });
  act(() => { editor.commands.insertContentAt(at, ' edited'); });
}

/** Resolves to which came first: the promise, or the next macrotask. */
const beforeNextTask = (promise: Promise<unknown>) =>
  Promise.race([promise.then(() => 'settled'), new Promise(resolve => setTimeout(() => resolve('pending'), 0))]);

describe('mountDraftEditor handle', () => {
  it('destroy() resolves only after an in-flight final save resolves', async () => {
    const editor = await mount();
    const held = deferred();
    opsResponse = () => held.promise;
    edit(editor);

    const destroying = handle!.destroy();
    handle = null;
    expect(requests).toContain('ops');
    expect(container.classList.contains('docs-draft-editor')).toBe(false);
    expect(await beforeNextTask(destroying)).toBe('pending');

    held.resolve(json({ doc: sampleDoc, hash: 'h2', patch_id: 'p1' }));
    await destroying;
    expect(warnings).toEqual([]);
  });

  it('destroy() with nothing pending resolves at once', async () => {
    await mount();
    const destroying = handle!.destroy();
    handle = null;
    expect(await beforeNextTask(destroying)).toBe('settled');
    expect(requests).not.toContain('ops');
  });

  it('a failing final save still resolves destroy(), logging the reason', async () => {
    const editor = await mount();
    opsResponse = async () => json({ detail: 'disk full' }, 500);
    edit(editor);

    await handle!.destroy();
    handle = null;
    expect(requests).toContain('ops');
    expect(warnings.some(line => line.includes('save for proof failed: disk full'))).toBe(true);
  });

  it('a rejected final save request still resolves destroy()', async () => {
    const editor = await mount();
    opsResponse = async () => { throw new Error('network down'); };
    edit(editor);

    await handle!.destroy();
    handle = null;
    expect(warnings.some(line => line.includes('network down'))).toBe(true);
  });

  it('flush() saves pending edits now and resolves after the save lands', async () => {
    const editor = await mount();
    const held = deferred();
    opsResponse = () => held.promise;
    edit(editor);

    const flushing = handle!.flush();
    await waitFor(() => expect(requests).toContain('ops'));
    expect(await beforeNextTask(flushing)).toBe('pending');
    held.resolve(json({ doc: sampleDoc, hash: 'h2', patch_id: 'p1' }));
    await flushing;
    expect(container.querySelector('.ProseMirror')).toBeTruthy();

    // Everything saved: tearing down sends no second save.
    const opsSoFar = requests.filter(route => route === 'ops').length;
    await act(() => handle!.destroy());
    handle = null;
    expect(requests.filter(route => route === 'ops').length).toBe(opsSoFar);
  });
});

/** A one-paragraph doc whose text holds one reference chip to `ref`. */
function docWithReference(id: string, body: string, ref?: SpectreRef) {
  const text: Array<Record<string, unknown>> = [{ insert: body }];
  if (ref) text.push({ insert: ' ' }, { insert: ref.label ?? ref.path, attributes: { reference: ref } });
  return {
    schemaVersion: 1,
    id,
    title: id,
    root: 'root',
    blocks: {
      root: { id: 'root', type: 'paragraph', props: {}, children: ['p1'] },
      p1: { id: 'p1', type: 'paragraph', props: {}, text, children: [] },
    },
  };
}

describe('mountDraftEditor side peek', () => {
  const target: SpectreRef = { kind: 'doc', path: 'guides/target', label: 'Target' };
  const peekPanel = () => container.querySelector('aside[aria-label="Doc preview"]');
  const isOpen = () => peekPanel()?.hasAttribute('data-doc-peek-panel') ?? false;
  const chip = async () => {
    let found: Element | null = null;
    await waitFor(() => {
      found = container.querySelector('[data-doc-reference][data-ref-kind="doc"]');
      expect(found).toBeTruthy();
    });
    return found! as HTMLElement;
  };

  beforeEach(() => {
    bundles = {
      proof: docWithReference('proof', 'Main doc', target),
      'guides/target': docWithReference('target', 'Hello from the target'),
    };
  });

  it('without peek, mounts no panel and a plain click only sends the reference event', async () => {
    await mount();
    expect(peekPanel()).toBeNull();
    expect(container.firstElementChild?.classList.contains('docs-markdown')).toBe(true);
    const intents: string[] = [];
    const record = (event: Event) => intents.push((event as CustomEvent<{ intent: string }>).detail.intent);
    document.addEventListener('spectre:doc-reference-navigate', record);
    try {
      fireEvent.click(await chip());
    } finally {
      document.removeEventListener('spectre:doc-reference-navigate', record);
    }
    expect(intents).toEqual(['peek']);
    expect(container.textContent).not.toContain('Hello from the target');
  });

  it('with peek, a plain click opens the linked doc beside the editor', async () => {
    const onNavigate = mock((_ref: SpectreRef) => {});
    const onPeekOpenChange = mock((_open: boolean) => {});
    await mount({ peek: true, onNavigate, onPeekOpenChange });
    expect(isOpen()).toBe(false);

    await act(async () => { fireEvent.click(await chip()); });
    await waitFor(() => expect(peekPanel()?.textContent).toContain('Hello from the target'));
    expect(isOpen()).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onPeekOpenChange).toHaveBeenLastCalledWith(true);
    // The editor column is still there beside the panel.
    expect(container.querySelector('.docs-markdown .ProseMirror')).toBeTruthy();
  });

  it('with peek, Cmd-click calls onNavigate and leaves the panel closed', async () => {
    const onNavigate = mock((_ref: SpectreRef) => {});
    await mount({ peek: true, onNavigate });

    await act(async () => { fireEvent.click(await chip(), { metaKey: true }); });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0]?.[0]).toMatchObject({ kind: 'doc', path: 'guides/target' });
    expect(isOpen()).toBe(false);
  });

  it('Open in full calls onNavigate with the peeked ref and closes the panel', async () => {
    const onNavigate = mock((_ref: SpectreRef) => {});
    await mount({ peek: true, onNavigate });
    await act(async () => { fireEvent.click(await chip()); });
    await waitFor(() => expect(isOpen()).toBe(true));

    await act(async () => { fireEvent.click(container.querySelector('[aria-label="Open in full"]')!); });
    expect(onNavigate.mock.calls[0]?.[0]).toMatchObject({ path: 'guides/target' });
    expect(isOpen()).toBe(false);
  });

  it('loadPeek replaces the bundle route, and a null load navigates instead of showing not found', async () => {
    const onNavigate = mock((_ref: SpectreRef) => {});
    const loadPeek = mock(async (_ref: SpectreRef) => null);
    await mount({ peek: true, onNavigate, loadPeek });
    const bundleReads = requests.filter(route => route === 'bundle').length;

    await act(async () => { fireEvent.click(await chip()); });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(loadPeek.mock.calls[0]?.[0]).toMatchObject({ path: 'guides/target' });
    expect(requests.filter(route => route === 'bundle').length).toBe(bundleReads);
    expect(isOpen()).toBe(false);
    expect(container.textContent).not.toContain('Doc not found');
  });

  it('with peekContainer, the panel opens in the host element and the editor keeps its column', async () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    try {
      await mount({ peek: true, peekContainer: slot, onNavigate: () => {} });
      expect(peekPanel()).toBeNull();
      expect(container.firstElementChild?.classList.contains('docs-markdown')).toBe(true);

      await act(async () => { fireEvent.click(await chip()); });
      const slotPanel = () => slot.querySelector('aside[aria-label="Doc preview"]');
      await waitFor(() => expect(slotPanel()?.textContent).toContain('Hello from the target'));
      expect(slotPanel()?.closest('.docs-draft-editor')).toBeTruthy();
      expect(container.textContent).not.toContain('Hello from the target');
      // A page column: no header bar, a pinned row for Close and Open in full, then the title in the scroll.
      expect(slotPanel()?.querySelector('header')).toBeNull();
      const controls = slotPanel()?.querySelector('[data-doc-peek-controls]');
      expect(controls?.querySelector('[aria-label="Close preview"]')).toBeTruthy();
      expect(controls?.querySelector('[aria-label="Open in full"]')).toBeTruthy();
      const scroller = slotPanel()?.querySelector('.overflow-y-auto');
      expect(scroller?.contains(controls!)).toBe(false);
      expect(scroller?.querySelector('[data-doc-peek-title-row] h1.docs-page-title')?.textContent).toBe('target');

      await act(async () => { document.dispatchEvent(new CustomEvent(DOC_PEEK_CLOSE_EVENT)); });
      expect(slotPanel()?.hasAttribute('data-doc-peek-panel')).toBe(false);
      await act(() => handle!.destroy());
      handle = null;
      expect(slot.childElementCount).toBe(0);
    } finally {
      slot.remove();
    }
  });

  it('with hostOwnsEscape, Escape keeps the panel open and the close event closes it', async () => {
    await mount({ peek: true, hostOwnsEscape: true, onNavigate: () => {} });
    await act(async () => { fireEvent.click(await chip()); });
    await waitFor(() => expect(isOpen()).toBe(true));

    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(isOpen()).toBe(true);
    await act(async () => { document.dispatchEvent(new CustomEvent(DOC_PEEK_CLOSE_EVENT)); });
    expect(isOpen()).toBe(false);
  });
});
