import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setDocsRootExclude } from "@codecaine-ai/docs-index/paths";
import { realDocsRootPath } from "@codecaine-ai/docs-index/safe-path";

import { publishDocsChangeEvent, type DocsChangeEvent } from "./docs-events";
import { walkDocsDir, type DocsTreeNode } from "./docs-tree";
import { createDocsStore } from "./store";
import { treeEtag } from "./tree-etag";
import { createTreeIndex, treeIndex, treeRevision, type TreeIndex } from "./tree-index";

const doc = (id: string) =>
  JSON.stringify({
    schemaVersion: 1, id, title: id, root: "root",
    blocks: { root: { id: "root", type: "paragraph", props: {}, children: [] } },
  });

async function addBundle(dir: string, name: string): Promise<void> {
  await mkdir(join(dir, name), { recursive: true });
  await writeFile(join(dir, name, "doc.json"), doc(name));
}

const change = (path: string): DocsChangeEvent => ({ path, changedIds: [], patchId: `p-${path}`, actor: "test" });
const names = (tree: readonly DocsTreeNode[]) => tree.map((node) => node.name);

/** Timers the tests move by hand. `advance` fires each due timer in order and lets its build settle. */
function fakeClock() {
  let time = 1_000;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock = {
    afterFire: async (): Promise<void> => undefined,
    now: () => time,
    setTimer: (fn: () => void, ms: number): unknown => {
      const id = ++seq;
      timers.set(id, { at: time + ms, fn });
      return id;
    },
    clearTimer: (id: unknown): void => { timers.delete(id as number); },
    /** Delays of the pending timers, from now. */
    pending: () => [...timers.values()].map((timer) => timer.at - time).sort((a, b) => a - b),
    async advance(ms: number): Promise<void> {
      const target = time + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        time = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
        await clock.afterFire();
      }
      time = target;
    },
  };
  return clock;
}

/** Waits until no build of `root` is running (a follow-up build counts). */
async function settled(index: TreeIndex, root: string): Promise<void> {
  await Bun.sleep(0);
  for (let i = 0; i < 500 && index.state(root)?.building; i++) await Bun.sleep(1);
  await Bun.sleep(0);
}

/** The real walk, counted, with a one-shot gate and scripted failures. */
function countingWalk() {
  const state = { walks: 0, failNext: 0, gate: undefined as Promise<void> | undefined };
  const walk = async (root: string): Promise<DocsTreeNode[]> => {
    state.walks += 1;
    if (state.gate) await state.gate;
    if (state.failNext > 0) {
      state.failNext -= 1;
      throw new Error("walk failed");
    }
    return walkDocsDir(root);
  };
  return { walk, state };
}

describe("tree index", () => {
  let dir: string;
  let channel: string;
  let clock: ReturnType<typeof fakeClock>;
  let walk: ReturnType<typeof countingWalk>;
  let index: TreeIndex;
  let unwatch: () => void = () => undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "docs-tree-index-"));
    channel = realDocsRootPath(dir);
    await addBundle(dir, "alpha");
    await addBundle(dir, "beta");
    clock = fakeClock();
    walk = countingWalk();
    index = createTreeIndex({ walk: walk.walk, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    clock.afterFire = () => settled(index, dir);
  });
  afterEach(async () => {
    unwatch();
    setDocsRootExclude(dir, undefined);
    await rm(dir, { recursive: true, force: true });
  });

  test("the first tree() builds once for two concurrent callers", async () => {
    unwatch = index.watch(dir);
    const [a, b] = await Promise.all([index.tree(dir), index.tree(dir)]);
    expect(walk.state.walks).toBe(1);
    expect(a).toBe(b);
    expect(names(a)).toEqual(["alpha", "beta"]);
    expect(await index.tree(dir)).toBe(a);
    expect(walk.state.walks).toBe(1);
  });

  test("a change event publishes a new snapshot after 200 ms of quiet and leaves the old one unchanged", async () => {
    unwatch = index.watch(dir);
    const first = await index.snapshot(dir);
    const firstSerialized = JSON.stringify(first);
    expect(treeEtag(first.tree)).toBe(`"${first.revision}"`);
    expect(first.revision).toBe(treeRevision(first.tree));

    await addBundle(dir, "gamma");
    publishDocsChangeEvent(channel, change("gamma"));
    expect(index.state(dir)?.dirty).toBe(true);
    // Until the quiet window ends, readers get the current snapshot at once.
    expect(await index.snapshot(dir)).toBe(first);
    expect(walk.state.walks).toBe(1);
    expect(clock.pending()).toEqual([200]);

    publishDocsChangeEvent(channel, change("gamma"));
    await clock.advance(199);
    expect(walk.state.walks).toBe(1);
    await clock.advance(1);
    expect(walk.state.walks).toBe(2);

    const second = await index.snapshot(dir);
    expect(second).not.toBe(first);
    expect(second.revision).not.toBe(first.revision);
    expect(names(second.tree)).toEqual(["alpha", "beta", "gamma"]);
    expect(index.state(dir)).toMatchObject({ dirty: false, building: false, builds: 2 });
    expect(JSON.stringify(first)).toBe(firstSerialized);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.tree)).toBe(true);
    expect(Object.isFrozen(first.tree[0])).toBe(true);
  });

  test("changes that land during a build start exactly one more build", async () => {
    unwatch = index.watch(dir);
    let release: () => void = () => undefined;
    walk.state.gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = index.tree(dir);
    await Bun.sleep(0);
    expect(walk.state.walks).toBe(1);
    expect(index.state(dir)?.building).toBe(true);

    await addBundle(dir, "gamma");
    publishDocsChangeEvent(channel, change("gamma"));
    publishDocsChangeEvent(channel, change("gamma"));
    expect(clock.pending()).toEqual([]);

    walk.state.gate = undefined;
    release();
    const first = await pending;
    expect(names(first)).toEqual(["alpha", "beta", "gamma"]);
    await settled(index, dir);
    expect(walk.state.walks).toBe(2);
    expect(index.state(dir)).toMatchObject({ dirty: false, building: false, builds: 2 });
    await clock.advance(60_000);
    expect(walk.state.walks).toBe(2);
  });

  test("a failed build keeps the last snapshot and retries after 1 s, doubling to 10 s", async () => {
    unwatch = index.watch(dir);
    const first = await index.snapshot(dir);
    walk.state.failNext = 6;
    publishDocsChangeEvent(channel, change("alpha"));
    await clock.advance(200);
    expect(index.state(dir)).toMatchObject({ dirty: true, building: false, failures: 1 });
    expect(await index.snapshot(dir)).toBe(first);

    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      const [delay] = clock.pending();
      delays.push(delay!);
      await clock.advance(delay!);
    }
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 10_000]);
    expect(index.state(dir)).toMatchObject({ dirty: true, failures: 6, snapshot: first });

    await addBundle(dir, "gamma");
    expect(clock.pending()).toEqual([10_000]);
    await clock.advance(10_000);
    const second = index.state(dir)?.snapshot;
    expect(second).not.toBe(first);
    expect(names(second!.tree)).toEqual(["alpha", "beta", "gamma"]);
    expect(index.state(dir)).toMatchObject({ dirty: false, failures: 6, builds: 2 });
    expect(walk.state.walks).toBe(8);
    expect(clock.pending()).toEqual([]);
  });

  test("a failed first build rejects the caller and the next call builds again", async () => {
    unwatch = index.watch(dir);
    walk.state.failNext = 1;
    await expect(index.tree(dir)).rejects.toThrow("walk failed");
    expect(index.state(dir)).toMatchObject({ dirty: true, snapshot: undefined });
    expect(clock.pending()).toEqual([1_000]);
    expect(names(await index.tree(dir))).toEqual(["alpha", "beta"]);
    expect(walk.state.walks).toBe(2);
    // The call-driven build replaced the pending retry.
    expect(clock.pending()).toEqual([]);
  });

  test("while the policy is unreadable tree() throws the policy error and keeps retrying", async () => {
    unwatch = index.watch(dir);
    const first = await index.snapshot(dir);
    await writeFile(join(dir, "codecaine.docs.json"), "{ not json");
    setDocsRootExclude(dir, undefined); // drops the policy cache, as discover() does on every tool call
    await expect(index.tree(dir)).rejects.toThrow();
    publishDocsChangeEvent(channel, change("codecaine.docs.json"));
    await clock.advance(200);
    expect(index.state(dir)).toMatchObject({ dirty: true, failures: 1, snapshot: first });
    expect(clock.pending()).toEqual([1_000]);

    await writeFile(join(dir, "codecaine.docs.json"), JSON.stringify({ name: "t", docsRoot: ".", products: ["docs"] }));
    setDocsRootExclude(dir, undefined);
    await clock.advance(1_000);
    expect(index.state(dir)).toMatchObject({ dirty: false, failures: 1, builds: 2 });
    expect(names(await index.tree(dir))).toEqual(["alpha", "beta"]);
  });

  test("setDocsRootExclude with the same globs leaves the index clean; different globs rebuild", async () => {
    setDocsRootExclude(dir, ["drafts/**"]);
    unwatch = index.watch(dir);
    const first = await index.snapshot(dir);
    expect(names(first.tree)).toEqual(["alpha", "beta"]);

    setDocsRootExclude(dir, ["drafts/**"]);
    expect(await index.snapshot(dir)).toBe(first);
    expect(index.state(dir)?.dirty).toBe(false);
    expect(clock.pending()).toEqual([]);
    await clock.advance(60_000);
    expect(walk.state.walks).toBe(1);

    setDocsRootExclude(dir, ["drafts/**", "beta/**"]);
    expect(await index.snapshot(dir)).toBe(first);
    expect(index.state(dir)?.dirty).toBe(true);
    expect(clock.pending()).toEqual([200]);
    // Calls in the quiet window see the same fingerprint again and do not re-mark.
    await index.snapshot(dir);
    expect(clock.pending()).toEqual([200]);
    await clock.advance(200);
    const second = await index.snapshot(dir);
    expect(second).not.toBe(first);
    expect(names(second.tree)).toEqual(["alpha"]);
    expect(walk.state.walks).toBe(2);
  });

  test("an unregistered root walks per call", async () => {
    const a = await index.snapshot(dir);
    const b = await index.tree(dir);
    expect(walk.state.walks).toBe(2);
    expect(a.tree).not.toBe(b);
    expect(index.isWatched(dir)).toBe(false);
    expect(index.state(dir)).toBeUndefined();
    expect(treeEtag(a.tree)).toBe(`"${a.revision}"`);
  });

  test("unwatch stops rebuilds and returns the root to per-call walks", async () => {
    unwatch = index.watch(dir);
    await index.tree(dir);
    unwatch();
    publishDocsChangeEvent(channel, change("alpha"));
    expect(clock.pending()).toEqual([]);
    await index.tree(dir);
    await index.tree(dir);
    expect(walk.state.walks).toBe(3);
  });

  test("store.tree() reads the process registry: per-call walks until the root is watched, then a snapshot that follows change events", async () => {
    const store = createDocsStore(dir);
    const a = await store.tree();
    const b = await store.tree();
    expect(a).not.toBe(b);
    expect(names(a)).toEqual(["alpha", "beta"]);

    unwatch = treeIndex.watch(dir);
    const first = await store.treeSnapshot();
    expect(await store.tree()).toBe(first.tree);
    expect(treeEtag(first.tree)).toBe(`"${first.revision}"`);

    await addBundle(dir, "gamma");
    store.publishChange(change("gamma"));
    const started = performance.now();
    let current = first;
    while (current.revision === first.revision && performance.now() - started < 2_000) {
      await Bun.sleep(20);
      current = await store.treeSnapshot();
    }
    expect(current.revision).not.toBe(first.revision);
    expect(names(current.tree)).toEqual(["alpha", "beta", "gamma"]);
    expect(performance.now() - started).toBeLessThan(1_000);
  }, 5_000);
});
