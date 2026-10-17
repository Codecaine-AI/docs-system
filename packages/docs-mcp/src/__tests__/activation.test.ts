import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createActivator, type ActivationGuards } from '../background/activation';

type Rt = { name: string };
type Health = { tasks: number; drafts: number };

/** A supervisor stand-in: mutable state read through getters, a scripted /health sequence, and a rediscovery hook. */
function harness(options: { health: Health[]; workspaces?: string[]; onDiscover?: (workspace: string) => void | Promise<void>; exists?: (path: string) => boolean }) {
  const state = { active: { name: 'active' } as Rt | undefined, candidate: { name: 'candidate' } as Rt | undefined, activeRequests: 0, requestRevision: 0, registryRevision: 0, closing: false };
  const calls: string[] = [];
  const logs: string[] = [];
  const swaps: Rt[] = [];
  const health = [...options.health];
  const activator = createActivator<Rt>({
    fetchRuntime: async (runtime, path, body: any) => {
      if (path === '/health') { calls.push(`health:${runtime.name}`); return health.shift() ?? { tasks: 0, drafts: 0 }; }
      calls.push(`discover:${runtime.name}:${body.workspace}`);
      await options.onDiscover?.(body.workspace);
      return { structuredContent: { ok: true } };
    },
    workspaces: () => options.workspaces ?? ['/ws/a'],
    swap: async next => { swaps.push(next); state.active = next; state.candidate = undefined; },
    log: message => logs.push(message),
    exists: options.exists ?? (() => true),
  });
  const guards: ActivationGuards<Rt> = {
    candidate: () => state.candidate,
    active: () => state.active,
    activeRequests: () => state.activeRequests,
    requestRevision: () => state.requestRevision,
    registryRevision: () => state.registryRevision,
    closing: () => state.closing,
  };
  return { state, calls, logs, swaps, activate: () => activator.activate(guards), activator };
}

test('a closed gate costs one /health fetch and never rediscovers', async () => {
  const h = harness({ health: [{ tasks: 2, drafts: 0 }] });
  expect(await h.activate()).toEqual({ status: 'waiting', tasks: 2, drafts: 0 });
  expect(h.calls).toEqual(['health:active']);
  expect(h.swaps).toEqual([]);
});

test('an open gate rediscovers on the candidate, re-checks /health, then swaps', async () => {
  const h = harness({ health: [{ tasks: 0, drafts: 0 }, { tasks: 0, drafts: 0 }], workspaces: ['/ws/a', '/ws/b'] });
  expect(await h.activate()).toEqual({ status: 'activated' });
  expect(h.calls).toEqual(['health:active', 'discover:candidate:/ws/a', 'discover:candidate:/ws/b', 'health:active']);
  expect(h.swaps.map(r => r.name)).toEqual(['candidate']);
});

test('a draft that appears during rediscovery refuses the swap and leaves the candidate waiting', async () => {
  const h = harness({ health: [{ tasks: 0, drafts: 0 }, { tasks: 0, drafts: 1 }] });
  expect(await h.activate()).toEqual({ status: 'waiting', tasks: 0, drafts: 1 });
  expect(h.swaps).toEqual([]);
  expect(h.state.candidate?.name).toBe('candidate');
  expect(h.state.active?.name).toBe('active');
});

test('a request revision change during rediscovery aborts the swap', async () => {
  const h = harness({ health: [], onDiscover: () => { h.state.requestRevision++; } });
  expect(await h.activate()).toEqual({ status: 'aborted' });
  expect(h.swaps).toEqual([]);
});

test('a registry revision change during rediscovery aborts the swap', async () => {
  const h = harness({ health: [], onDiscover: () => { h.state.registryRevision++; } });
  expect(await h.activate()).toEqual({ status: 'aborted' });
  expect(h.swaps).toEqual([]);
});

test('a new candidate during rediscovery aborts the swap', async () => {
  const h = harness({ health: [], onDiscover: () => { h.state.candidate = { name: 'newer' }; } });
  expect(await h.activate()).toEqual({ status: 'aborted' });
  expect(h.swaps).toEqual([]);
  expect(h.state.candidate?.name).toBe('newer');
});

test('entry guards skip without any fetch', async () => {
  const h = harness({ health: [] });
  h.state.activeRequests = 1;
  expect(await h.activate()).toEqual({ status: 'skipped' });
  h.state.activeRequests = 0; h.state.closing = true;
  expect(await h.activate()).toEqual({ status: 'skipped' });
  h.state.closing = false; h.state.candidate = undefined;
  expect(await h.activate()).toEqual({ status: 'skipped' });
  expect(h.calls).toEqual([]);
});

test('a second activation while one runs is skipped', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ health: [], onDiscover: () => gate });
  const first = h.activate();
  await Bun.sleep(0);
  expect(h.activator.activating).toBe(true);
  expect(await h.activate()).toEqual({ status: 'skipped' });
  release();
  expect(await first).toEqual({ status: 'activated' });
  expect(h.activator.activating).toBe(false);
});

test('a failed rediscovery throws and does not swap', async () => {
  const swaps: Rt[] = [];
  const activator = createActivator<Rt>({
    fetchRuntime: async (_runtime, path) => path === '/health' ? { tasks: 0, drafts: 0 } : { isError: true },
    workspaces: () => ['/ws/a'],
    swap: async next => { swaps.push(next); },
    exists: () => true,
    log: () => {},
  });
  const guards: ActivationGuards<Rt> = { candidate: () => ({ name: 'c' }), active: () => ({ name: 'a' }), activeRequests: () => 0, requestRevision: () => 0, registryRevision: () => 0, closing: () => false };
  await expect(activator.activate(guards)).rejects.toThrow('could not rediscover');
  expect(swaps).toEqual([]);
  expect(activator.activating).toBe(false);
});

test('an unavailable workspace is logged once across attempts, and once when it returns', async () => {
  let present = false;
  const open = { tasks: 0, drafts: 0 };
  const closed = { tasks: 1, drafts: 0 };
  const h = harness({ health: [open, closed, open, closed, open, open], workspaces: ['/ws/gone'], exists: () => present });
  await h.activate(); // gate open → miss logged, second gate closed
  await h.activate(); // gate open → miss not logged again
  present = true;
  await h.activate(); // gate open → recovery logged
  expect(h.logs).toEqual(['[docs] Registered workspace unavailable: /ws/gone', '[docs] Registered workspace available again: /ws/gone']);
});

test('a manifest change made while the candidate waits is in the candidate discovery at activation', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'docs-activation-'));
  try {
    const manifest = join(workspace, 'codecaine.docs.json');
    await writeFile(manifest, JSON.stringify({ exclude: [] }));
    const seen: unknown[] = [];
    const h = harness({ health: [{ tasks: 1, drafts: 0 }, { tasks: 0, drafts: 0 }, { tasks: 0, drafts: 0 }], workspaces: [workspace], onDiscover: async ws => { seen.push(JSON.parse(await readFile(join(ws, 'codecaine.docs.json'), 'utf8'))); } });
    expect((await h.activate()).status).toBe('waiting');
    expect(seen).toEqual([]);
    await writeFile(manifest, JSON.stringify({ exclude: ['drafts/**'] }));
    expect((await h.activate()).status).toBe('activated');
    expect(seen).toEqual([{ exclude: ['drafts/**'] }]);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
