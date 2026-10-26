import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { EventEmitter } from "node:events";
import * as nodeFs from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  __corpusCacheTestHooks,
  attachCorpusWatcher,
  corpusCacheState,
  invalidateDocsCorpus,
  peekDocsTree,
  storeTreeLocked,
} from "../corpus-cache";
import { walkDocsDir, type DocsTreeNode } from "../docs-tree";
import { watchDocsRoot, type DocsFsWatchHandle } from "../fs-watch";
import { __manageFilesTestHooks } from "../manage-files";
import { withPathLock } from "../path-mutex";
import { createDocsStore } from "../store";

/**
 * Docs-tree cache: on only while a watcher is attached, filled only inside
 * the corpus lock, invalidated by watcher events and by every store write.
 * Most tests attach with `attachCorpusWatcher` (no fs.watch) so the only
 * invalidations are the ones the test causes.
 */

const DOC = (id: string) =>
  JSON.stringify({
    schemaVersion: 1,
    id,
    title: id,
    root: "root",
    blocks: { root: { id: "root", type: "paragraph", props: {}, children: [] } },
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const lockPath = (root: string) => join(root, ".changesets", ".store-operation-lock");

/** Resolves to "pending" when `promise` has not settled within `ms`. */
async function settledWithin<T>(promise: Promise<T>, ms: number): Promise<T | "pending"> {
  return Promise.race([promise, sleep(ms).then(() => "pending" as const)]);
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

const names = (nodes: DocsTreeNode[]) => nodes.map((node) => `${node.name}:${node.kind}`);

let docsRoot: string;
const detachers: Array<() => void> = [];
const watchers: DocsFsWatchHandle[] = [];

function attach(root = docsRoot): () => void {
  const detach = attachCorpusWatcher(root);
  detachers.push(detach);
  return detach;
}

beforeEach(async () => {
  docsRoot = await mkdtemp(join(tmpdir(), "docs-corpus-cache-"));
  for (const page of ["alpha", "beta"]) {
    await mkdir(join(docsRoot, page), { recursive: true });
    await writeFile(join(docsRoot, page, "doc.json"), DOC(page));
  }
});

afterEach(async () => {
  for (const watcher of watchers.splice(0)) watcher.close();
  for (const detach of detachers.splice(0)) detach();
  __corpusCacheTestHooks.now = () => Date.now();
  __corpusCacheTestHooks.maxAgeMs = undefined;
  __manageFilesTestHooks.afterRelocate = undefined;
  await rm(docsRoot, { recursive: true, force: true });
});

describe("corpus cache: when it is on", () => {
  test("no watcher attached: every tree() walks and nothing is cached", async () => {
    const store = createDocsStore(docsRoot);
    expect(names(await store.tree())).toEqual(["alpha:bundle", "beta:bundle"]);
    expect(corpusCacheState(docsRoot)).toBeUndefined();
    expect(peekDocsTree(docsRoot)).toBeUndefined();
  });

  test("attached: a second tree() is a hit; detach turns caching off", async () => {
    const detach = attach();
    const store = createDocsStore(docsRoot);
    const first = await store.tree();
    const second = await store.tree();
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(corpusCacheState(docsRoot)).toMatchObject({ walks: 1, cached: true });
    detach();
    expect(corpusCacheState(docsRoot)).toBeUndefined();
    expect(peekDocsTree(docsRoot)).toBeUndefined();
  });

  test("detach twice leaves the refcount at 0, a second watcher keeps caching on", async () => {
    const a = attach();
    const b = attach();
    a();
    a();
    expect(corpusCacheState(docsRoot)?.attached).toBe(1);
    b();
    expect(corpusCacheState(docsRoot)).toBeUndefined();
  });

  test("two stores on one root share one cache; two roots stay independent", async () => {
    const otherRoot = await mkdtemp(join(tmpdir(), "docs-corpus-cache-other-"));
    try {
      await mkdir(join(otherRoot, "gamma"), { recursive: true });
      await writeFile(join(otherRoot, "gamma", "doc.json"), DOC("gamma"));
      attach();
      attach(otherRoot);
      const first = await createDocsStore(docsRoot).tree();
      expect(await createDocsStore(docsRoot).tree()).toBe(first);
      expect(names(await createDocsStore(otherRoot).tree())).toEqual(["gamma:bundle"]);
      invalidateDocsCorpus(otherRoot);
      expect(peekDocsTree(docsRoot)).toBe(first);
      expect(peekDocsTree(otherRoot)).toBeUndefined();
      expect(corpusCacheState(docsRoot)?.walks).toBe(1);
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });
});

describe("corpus cache: fills and invalidation", () => {
  test("10 concurrent tree() calls run one walk", async () => {
    attach();
    const store = createDocsStore(docsRoot);
    const results = await Promise.all(Array.from({ length: 10 }, () => store.tree()));
    expect(new Set(results).size).toBe(1);
    expect(corpusCacheState(docsRoot)?.walks).toBe(1);
  });

  test("an invalidation during the walk returns the result but does not cache it", async () => {
    attach();
    const value = await storeTreeLocked(docsRoot, async () => {
      const tree = await walkDocsDir(docsRoot);
      invalidateDocsCorpus(docsRoot, "alpha/doc.json");
      return tree;
    });
    expect(names(value)).toEqual(["alpha:bundle", "beta:bundle"]);
    expect(peekDocsTree(docsRoot)).toBeUndefined();
  });

  test("a failed walk rejects its caller; the next queued caller retries and fills", async () => {
    attach();
    let calls = 0;
    const walk = async () => {
      calls += 1;
      if (calls === 1) throw new Error("walk failed");
      return walkDocsDir(docsRoot);
    };
    const lock = lockPath(docsRoot);
    const first = withPathLock(lock, () => storeTreeLocked(docsRoot, walk));
    const second = withPathLock(lock, () => storeTreeLocked(docsRoot, walk));
    await expect(first).rejects.toThrow("walk failed");
    expect(names(await second)).toEqual(["alpha:bundle", "beta:bundle"]);
    expect(calls).toBe(2);
    expect(peekDocsTree(docsRoot)).toBe(await second);
  });

  test("dot and node_modules paths do not invalidate; temp names and empty paths do", async () => {
    attach();
    await createDocsStore(docsRoot).tree();
    const gen = corpusCacheState(docsRoot)!.gen;
    invalidateDocsCorpus(docsRoot, ".index/backlinks.sqlite");
    invalidateDocsCorpus(docsRoot, "alpha/.drafts/x.json");
    invalidateDocsCorpus(docsRoot, "node_modules/pkg/index.js");
    expect(corpusCacheState(docsRoot)).toMatchObject({ gen, cached: true });
    invalidateDocsCorpus(docsRoot, "alpha/doc.json.tmp-12345678-1234-1234-1234-123456789abc");
    expect(corpusCacheState(docsRoot)).toMatchObject({ gen: gen + 1, cached: false });
    await createDocsStore(docsRoot).tree();
    invalidateDocsCorpus(docsRoot, "");
    expect(corpusCacheState(docsRoot)).toMatchObject({ gen: gen + 2, cached: false });
  });

  test("max age expiry rewalks; max age 0 disables caching", async () => {
    let now = 1_000_000;
    __corpusCacheTestHooks.now = () => now;
    __corpusCacheTestHooks.maxAgeMs = 30_000;
    attach();
    const store = createDocsStore(docsRoot);
    const first = await store.tree();
    now += 29_999;
    expect(await store.tree()).toBe(first);
    now += 2;
    expect(await store.tree()).not.toBe(first);
    expect(corpusCacheState(docsRoot)?.walks).toBe(2);

    __corpusCacheTestHooks.maxAgeMs = 0;
    invalidateDocsCorpus(docsRoot);
    await store.tree();
    await store.tree();
    expect(corpusCacheState(docsRoot)).toMatchObject({ walks: 4, cached: false });
  });

  test("dot-path gap: a move into a dot folder stays stale until max age", async () => {
    let now = 1_000_000;
    __corpusCacheTestHooks.now = () => now;
    __corpusCacheTestHooks.maxAgeMs = 30_000;
    attach();
    const store = createDocsStore(docsRoot);
    await store.tree();
    // The only event an external move reports may be the dot-folder path.
    await mkdir(join(docsRoot, ".hidden"), { recursive: true });
    await rename(join(docsRoot, "alpha", "doc.json"), join(docsRoot, ".hidden", "marker.json"));
    invalidateDocsCorpus(docsRoot, ".hidden/marker.json");
    expect(names(await store.tree())).toEqual(["alpha:bundle", "beta:bundle"]);
    now += 30_001;
    expect(names(await store.tree())).toEqual(["alpha:dir", "beta:bundle"]);
  });

  test("LRU eviction of a 9th root keeps the evicted root's refcount and generation", async () => {
    const extra: string[] = [];
    try {
      let now = 1_000_000;
      __corpusCacheTestHooks.now = () => now;
      attach();
      await createDocsStore(docsRoot).tree();
      const gen = corpusCacheState(docsRoot)!.gen;
      for (let i = 0; i < 8; i += 1) {
        now += 1;
        const root = await mkdtemp(join(tmpdir(), `docs-corpus-cache-lru-${i}-`));
        extra.push(root);
        attach(root);
        await createDocsStore(root).tree();
      }
      expect(corpusCacheState(docsRoot)).toEqual({ attached: 1, gen, walks: 1, cached: false });
      invalidateDocsCorpus(docsRoot, "alpha/doc.json");
      expect(corpusCacheState(docsRoot)?.gen).toBe(gen + 1);
      await createDocsStore(docsRoot).tree();
      expect(corpusCacheState(docsRoot)).toMatchObject({ walks: 2, cached: true });
    } finally {
      for (const root of extra) await rm(root, { recursive: true, force: true });
    }
  });
});

describe("corpus cache: the corpus lock", () => {
  test("a hit bypasses the lock; a read and a cold tree() wait behind it", async () => {
    attach();
    const store = createDocsStore(docsRoot);
    const warm = await store.tree();
    const held = gate();
    const holder = withPathLock(lockPath(docsRoot), () => held.opened);
    try {
      expect(await settledWithin(store.tree(), 50)).toBe(warm);
      const bundle = store.bundle("alpha");
      expect(await settledWithin(bundle, 50)).toBe("pending");
      invalidateDocsCorpus(docsRoot);
      const cold = store.tree();
      expect(await settledWithin(cold, 50)).toBe("pending");
      held.open();
      await holder;
      expect(names(await cold)).toEqual(["alpha:bundle", "beta:bundle"]);
      expect(await bundle).toMatchObject({ bundlePath: "alpha" });
    } finally {
      held.open();
    }
  });

  test("a write drops the cached tree at its start; tree() queues behind it", async () => {
    attach();
    const store = createDocsStore(docsRoot);
    await store.tree();
    const source = await readFile(join(docsRoot, "beta", "doc.json"));
    const expected_hash = createHash("sha256").update(source).digest("hex");
    const preview = await store.manageFiles({ kind: "page", path: "beta", to: "gamma", expected_hash });
    expect(preview.ok).toBe(true);
    // The preview is itself a store write and invalidated; rewarm so the
    // check below proves the applying write's own start invalidation.
    const rewarmed = await store.tree();
    expect(peekDocsTree(docsRoot)).toBe(rewarmed);

    const paused = gate();
    const reached = gate();
    __manageFilesTestHooks.afterRelocate = async () => {
      reached.open();
      await paused.opened;
    };
    const write = store.manageFiles({
      kind: "page",
      path: "beta",
      to: "gamma",
      expected_hash,
      preview: false,
      expected_tree_hash: preview.tree_hash,
    });
    try {
      await reached.opened;
      expect(peekDocsTree(docsRoot)).toBeUndefined();
      const queued = store.tree();
      expect(await settledWithin(queued, 50)).toBe("pending");
      // The kernel's unlocked walk sees the relocation but never fills the cache.
      expect(names(await walkDocsDir(docsRoot))).toEqual(["alpha:bundle", "gamma:bundle"]);
      expect(peekDocsTree(docsRoot)).toBeUndefined();
      paused.open();
      expect((await write).applied).toBe(true);
      const final = await queued;
      expect(names(final)).toEqual(["alpha:bundle", "gamma:bundle"]);
      expect(await store.tree()).toBe(final);
    } finally {
      paused.open();
    }
  });

  test("own writes are visible to the next tree() with no watcher event", async () => {
    attach();
    const store = createDocsStore(docsRoot);
    await store.tree();
    const staged = await store.changesetStage({
      summary: "create",
      entries: [],
      treeOps: [{ kind: "create-doc", docPath: "delta", title: "Delta", position: 0 }],
    } as any);
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    expect((await store.changesetAccept(staged.changeset.id)).ok).toBe(true);
    expect(names(await store.tree())).toEqual(["alpha:bundle", "beta:bundle", "delta:bundle"]);
  });
});

describe("corpus cache: real watcher", () => {
  async function eventually(check: () => Promise<boolean>, timeoutMs = 1000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return true;
      await sleep(25);
    }
    return check();
  }

  test("external create, delete and rename show up in tree() within 1 s; close() turns caching off", async () => {
    const watcher = watchDocsRoot(docsRoot, () => {});
    watchers.push(watcher);
    const store = createDocsStore(docsRoot);
    await sleep(100);
    await store.tree();
    expect(corpusCacheState(docsRoot)?.cached).toBe(true);

    await mkdir(join(docsRoot, "gamma"), { recursive: true });
    await writeFile(join(docsRoot, "gamma", "doc.json"), DOC("gamma"));
    expect(await eventually(async () => names(await store.tree()).includes("gamma:bundle"))).toBe(true);

    await rm(join(docsRoot, "beta"), { recursive: true, force: true });
    expect(await eventually(async () => !names(await store.tree()).includes("beta:bundle"))).toBe(true);

    await rename(join(docsRoot, "gamma"), join(docsRoot, "omega"));
    expect(await eventually(async () => names(await store.tree()).includes("omega:bundle"))).toBe(true);

    watcher.close();
    expect(corpusCacheState(docsRoot)).toBeUndefined();
  });
});

describe("corpus cache: watcher boundary", () => {
  /** Replaces fs.watch with a fake whose raw callback and emitter the test drives. */
  function fakeWatch() {
    const emitter = Object.assign(new EventEmitter(), { close: () => {} });
    let raw!: (eventType: string, filename: string | null) => void;
    const spy = spyOn(nodeFs, "watch").mockImplementation(((_root: string, _opts: unknown, cb: any) => {
      raw = cb;
      return emitter;
    }) as any);
    return { emitter, raw: (filename: string | null) => raw("rename", filename), restore: () => spy.mockRestore() };
  }

  test("a filename-less raw event invalidates the root", async () => {
    const fake = fakeWatch();
    try {
      const watcher = watchDocsRoot(docsRoot, () => {});
      watchers.push(watcher);
      expect(watcher.mode).toBe("fs-watch");
      await createDocsStore(docsRoot).tree();
      const gen = corpusCacheState(docsRoot)!.gen;
      fake.raw(null);
      expect(corpusCacheState(docsRoot)).toMatchObject({ gen: gen + 1, cached: false });
    } finally {
      fake.restore();
    }
  });

  test("a watcher error turns caching off; close() after it does not throw or double-detach", async () => {
    const fake = fakeWatch();
    const other = attach(); // a second attachment shows the error detached exactly once
    try {
      const watcher = watchDocsRoot(docsRoot, () => {});
      expect(corpusCacheState(docsRoot)?.attached).toBe(2);
      await createDocsStore(docsRoot).tree();
      fake.emitter.emit("error", new Error("root gone"));
      expect(corpusCacheState(docsRoot)).toMatchObject({ attached: 1, cached: false });
      expect(() => watcher.close()).not.toThrow();
      expect(() => watcher.close()).not.toThrow();
      expect(corpusCacheState(docsRoot)?.attached).toBe(1);
      other();
      expect(corpusCacheState(docsRoot)).toBeUndefined();
      await createDocsStore(docsRoot).tree();
      expect(peekDocsTree(docsRoot)).toBeUndefined();
    } finally {
      fake.restore();
    }
  });
});
