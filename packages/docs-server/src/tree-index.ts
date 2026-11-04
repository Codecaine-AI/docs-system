import { createHash } from "node:crypto";

import { docsRootExclude, docsRootPolicyScopes } from "@codecaine-ai/docs-index/paths";
import { canonicalPathKey, realDocsRootPath } from "@codecaine-ai/docs-index/safe-path";

import { subscribeToDocsChangeEvents } from "./docs-events";
import { walkDocsDir, type DocsTreeNode } from "./docs-tree";
import { treeEtag } from "./tree-etag";

/**
 * The in-memory docs tree index: one immutable snapshot per registered docs
 * root, so `store.tree()` answers without a walk inside the request.
 *
 * A host that owns a root's filesystem watcher registers the root with
 * `treeIndex.watch(root)`. Only a registered root is indexed; `tree()` on any
 * other root walks per call, as it always did. For a registered root the
 * first `tree()` awaits one shared build (single-flight), and every later
 * call returns the current snapshot at once.
 *
 * The index is dirty after any change event on the root's channel (the one
 * `createDocsStore` publishes on), after the effective exclude policy
 * changes (checked on every `tree()` call and on every event, so a
 * `setDocsRootExclude` with the same globs changes nothing), and after a
 * failed build. One builder runs at a time, after 200 ms without another
 * change; a change that lands during a build starts one more build when it
 * ends. A build walks the whole root and publishes a new snapshot by
 * reference swap, so a reader never sees a half-built tree. A failed build
 * keeps the last snapshot and retries after 1 s, doubling to 10 s.
 */

export type TreeSnapshot = Readonly<{
  /** The whole tree, deep-frozen. A rebuild publishes a new snapshot; this one never changes. */
  tree: DocsTreeNode[];
  /** sha256 hex of the serialized tree. `GET /api/tree` answers with the ETag `"<revision>"`. */
  revision: string;
  /** When the build finished (`Date.now()`). */
  builtAt: number;
}>;

export type TreeIndexOptions = {
  /** The walk a build runs (default `walkDocsDir`). Tests count it or make it fail. */
  walk?: (root: string) => Promise<DocsTreeNode[]>;
  /** The effective exclude-policy fingerprint (default `excludePolicyFingerprint`). */
  fingerprint?: (root: string) => string;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Quiet time after the last change before a rebuild starts. */
  quietMs?: number;
  /** The first retry delay after a failed build; it doubles up to `retryMaxMs`. */
  retryMinMs?: number;
  retryMaxMs?: number;
};

/** What the index knows about one registered root (for tests and diagnostics). */
export type TreeIndexState = Readonly<{
  dirty: boolean;
  building: boolean;
  builds: number;
  failures: number;
  snapshot: TreeSnapshot | undefined;
}>;

export interface TreeIndex {
  /** Registers `root` for indexing. Idempotent. The returned function removes the index. */
  watch(root: string): () => void;
  isWatched(root: string): boolean;
  /** The current tree: the snapshot of a registered root, else one walk. */
  tree(root: string): Promise<DocsTreeNode[]>;
  /** The current tree with its revision. An unregistered root gets a fresh walk and revision. */
  snapshot(root: string): Promise<TreeSnapshot>;
  state(root: string): TreeIndexState | undefined;
}

export const TREE_INDEX_QUIET_MS = 200;
export const TREE_INDEX_RETRY_MIN_MS = 1_000;
export const TREE_INDEX_RETRY_MAX_MS = 10_000;

/** The unquoted sha256 hex of the serialized tree: `treeEtag(tree)` is `"<revision>"`. */
export function treeRevision(tree: readonly DocsTreeNode[]): string {
  return treeEtag(tree).slice(1, -1);
}

/**
 * A stable hash of everything that decides which paths the root excludes:
 * the governing policy scopes (the root's own and every enclosing project's
 * codecaine.docs.json) and the registered globs, which replace the root's own
 * on-disk globs. Throws while the policy is unreadable, as the walk does.
 */
export function excludePolicyFingerprint(root: string): string {
  const scopes = docsRootPolicyScopes(root).map((scope) => ({ prefix: scope.prefix, exclude: [...scope.exclude] }));
  const explicit = [...docsRootExclude(root)];
  return createHash("sha256").update(JSON.stringify({ explicit, scopes })).digest("hex");
}

type Entry = {
  key: string;
  snapshot?: TreeSnapshot;
  /** The last fingerprint seen on a call, an event or a build start. */
  lastFingerprint?: string;
  dirty: boolean;
  closed: boolean;
  inflight?: Promise<TreeSnapshot>;
  quietTimer?: unknown;
  retryTimer?: unknown;
  retryMs: number;
  builds: number;
  failures: number;
  unsubscribe: () => void;
};

function deepFreeze(nodes: DocsTreeNode[]): DocsTreeNode[] {
  for (const node of nodes) {
    if (node.children) deepFreeze(node.children);
    Object.freeze(node);
  }
  return Object.freeze(nodes) as DocsTreeNode[];
}

const defaultSetTimer = (fn: () => void, ms: number): unknown => {
  const handle = setTimeout(fn, ms);
  (handle as { unref?: () => void }).unref?.();
  return handle;
};
const defaultClearTimer = (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>);

export function createTreeIndex(options: TreeIndexOptions = {}): TreeIndex {
  const walk = options.walk ?? ((root: string) => walkDocsDir(root));
  const fingerprint = options.fingerprint ?? excludePolicyFingerprint;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? defaultSetTimer;
  const clearTimer = options.clearTimer ?? defaultClearTimer;
  const quietMs = options.quietMs ?? TREE_INDEX_QUIET_MS;
  const retryMinMs = options.retryMinMs ?? TREE_INDEX_RETRY_MIN_MS;
  const retryMaxMs = options.retryMaxMs ?? TREE_INDEX_RETRY_MAX_MS;
  const entries = new Map<string, Entry>();

  const clearTimers = (entry: Entry): void => {
    if (entry.quietTimer !== undefined) clearTimer(entry.quietTimer);
    if (entry.retryTimer !== undefined) clearTimer(entry.retryTimer);
    entry.quietTimer = undefined;
    entry.retryTimer = undefined;
  };

  const startBuild = (entry: Entry): void => {
    if (entry.closed || entry.inflight) return;
    void build(entry).catch(() => undefined);
  };

  /** One build at a time. The build captures the fingerprint first, then walks, then publishes. */
  const build = (entry: Entry): Promise<TreeSnapshot> => {
    if (entry.inflight) return entry.inflight;
    clearTimers(entry);
    entry.dirty = false;
    const run = (async (): Promise<TreeSnapshot> => {
      const current = fingerprint(entry.key);
      entry.lastFingerprint = current;
      const tree = deepFreeze(await walk(entry.key));
      return Object.freeze({ tree, revision: treeRevision(tree), builtAt: now() });
    })();
    const settled = run.then(
      (snapshot) => {
        entry.inflight = undefined;
        if (entry.closed) return snapshot;
        entry.snapshot = snapshot;
        entry.builds += 1;
        entry.retryMs = retryMinMs;
        // A change that landed during the build: rebuild once, now.
        if (entry.dirty) startBuild(entry);
        return snapshot;
      },
      (error: unknown) => {
        entry.inflight = undefined;
        if (entry.closed) throw error;
        entry.failures += 1;
        entry.dirty = true;
        entry.retryTimer = setTimer(() => {
          entry.retryTimer = undefined;
          startBuild(entry);
        }, entry.retryMs);
        entry.retryMs = Math.min(entry.retryMs * 2, retryMaxMs);
        throw error;
      },
    );
    entry.inflight = settled;
    return settled;
  };

  /** Marks the snapshot stale and builds after `quietMs` without another change. */
  const markDirty = (entry: Entry): void => {
    if (entry.closed) return;
    entry.dirty = true;
    // A running build rebuilds when it ends; a pending retry yields to the sooner quiet timer.
    if (entry.inflight) return;
    if (entry.quietTimer !== undefined) clearTimer(entry.quietTimer);
    entry.quietTimer = setTimer(() => {
      entry.quietTimer = undefined;
      if (entry.dirty) startBuild(entry);
    }, quietMs);
  };

  /** Throws while the policy is unreadable. A changed fingerprint marks the index dirty. */
  const observeFingerprint = (entry: Entry): void => {
    const current = fingerprint(entry.key);
    if (entry.lastFingerprint !== undefined && current !== entry.lastFingerprint) markDirty(entry);
    entry.lastFingerprint = current;
  };

  const onChange = (entry: Entry): void => {
    if (entry.closed) return;
    try {
      entry.lastFingerprint = fingerprint(entry.key);
    } catch {
      // The build reads the policy again, fails, and retries.
    }
    markDirty(entry);
  };

  const snapshot = async (root: string): Promise<TreeSnapshot> => {
    const key = canonicalPathKey(root);
    const entry = entries.get(key);
    if (!entry) {
      const tree = await walk(key);
      return Object.freeze({ tree, revision: treeRevision(tree), builtAt: now() });
    }
    observeFingerprint(entry);
    if (entry.snapshot) return entry.snapshot;
    return build(entry);
  };

  return {
    watch(root) {
      const key = canonicalPathKey(root);
      let entry = entries.get(key);
      if (!entry) {
        const created: Entry = {
          key,
          dirty: false,
          closed: false,
          retryMs: retryMinMs,
          builds: 0,
          failures: 0,
          unsubscribe: () => undefined,
        };
        // The store publishes on its canonical root; so does the host's watcher through the store.
        created.unsubscribe = subscribeToDocsChangeEvents(realDocsRootPath(root), () => onChange(created));
        entries.set(key, created);
        entry = created;
      }
      const registered = entry;
      return () => {
        if (entries.get(key) !== registered) return;
        registered.closed = true;
        registered.unsubscribe();
        clearTimers(registered);
        entries.delete(key);
      };
    },
    isWatched: (root) => entries.has(canonicalPathKey(root)),
    tree: async (root) => (await snapshot(root)).tree,
    snapshot,
    state(root) {
      const entry = entries.get(canonicalPathKey(root));
      if (!entry) return undefined;
      return {
        dirty: entry.dirty,
        building: entry.inflight !== undefined,
        builds: entry.builds,
        failures: entry.failures,
        snapshot: entry.snapshot,
      };
    },
  };
}

/** The process-wide registry every `createDocsStore` reads through. */
export const treeIndex: TreeIndex = createTreeIndex();
