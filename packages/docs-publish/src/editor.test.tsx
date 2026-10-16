import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import sampleDoc from '../../docs-model/src/__fixtures__/sample.doc.json';
import { mountDraftEditor, type DraftEditorHandle } from './editor';

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
let opsResponse: () => Promise<Response>;
const realFetch = globalThis.fetch;
const realWarn = console.warn;
let warnings: string[] = [];
let container: HTMLElement;
let handle: DraftEditorHandle | null = null;

beforeEach(() => {
  requests = [];
  warnings = [];
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
  opsResponse = async () => json({ doc: sampleDoc, hash: 'h2', patch_id: 'p1' });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const route = String(input).replace(/^\/api\//, '').split('?')[0]!;
    requests.push(route);
    if (route === 'bundle') return json({ doc: sampleDoc, doc_hash: 'h1' });
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

async function mount() {
  handle = await act(() => mountDraftEditor(container, { api: '/api', path: 'proof' }));
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
