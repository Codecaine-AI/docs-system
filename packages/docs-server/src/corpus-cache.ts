import { canonicalDocsRoot } from "./draft-locks";
import type { DocsTreeNode } from "./docs-tree";

/**
 * Process-wide docs-tree cache, keyed by canonical docs root. Stores are
 * created many times per root (MCP service, tools, workbench), so the cache
 * lives here and not on the store object.
 *
 * Caching is on only while at least one filesystem watcher is attached to the
 * root (`watchDocsRoot` attaches on start, detaches on close and on watcher
 * error). Without a watcher (CLI, export, most tests) every call walks.
 *
 * A cached tree is valid while:
 *  - a watcher is attached,
 *  - its generation matches the root's (every invalidation bumps it), and
 *  - it is younger than the max age (safety net for missed FS events).
 *
 * Invalidation: the watcher bumps synchronously on every raw event (before
 * its debounce), and every store write bumps at the start of its locked body.
 * Fills happen only on the store's `tree()` miss path, inside the corpus
 * lock, so a fill never overlaps a store write. A fill is discarded when the
 * generation moved during its walk (an external writer's event arrived).
 */

const DEFAULT_MAX_AGE_MS = 30_000;
/** Roots that keep a cached tree at once; eviction drops the value only. */
const MAX_CACHED_ROOTS = 8;

type Cached<T> = { gen: number; at: number; value: T };
type Entry = {
  attached: number;
  gen: number;
  lastUsed: number;
  /** Tree walks run through `storeTreeLocked` (test observability). */
  walks: number;
  tree?: Cached<DocsTreeNode[]>;
};

const entries = new Map<string, Entry>();

/** Test seams: clock and max age (env `CODECAINE_DOCS_TREE_CACHE_MS`, `0` disables). */
export const __corpusCacheTestHooks: { now: () => number; maxAgeMs?: number } = {
  now: () => Date.now(),
};

function maxAgeMs(): number {
  if (__corpusCacheTestHooks.maxAgeMs !== undefined) return __corpusCacheTestHooks.maxAgeMs;
  const raw = process.env.CODECAINE_DOCS_TREE_CACHE_MS;
  const parsed = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_AGE_MS;
}

const hitOk = (e: Entry): boolean =>
  !!e.tree &&
  e.attached > 0 &&
  e.tree.gen === e.gen &&
  __corpusCacheTestHooks.now() - e.tree.at < maxAgeMs();

function touch(e: Entry): Entry {
  e.lastUsed = __corpusCacheTestHooks.now();
  return e;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function evictBeyondCap(): void {
  const cached = [...entries.values()].filter((e) => e.tree);
  if (cached.length <= MAX_CACHED_ROOTS) return;
  cached.sort((a, b) => a.lastUsed - b.lastUsed);
  for (const e of cached.slice(0, cached.length - MAX_CACHED_ROOTS)) e.tree = undefined;
}

/**
 * Turns caching on for `root` until the returned detach runs. Detach is
 * idempotent, so `close()` after a watcher error cannot decrement twice.
 */
export function attachCorpusWatcher(root: string): () => void {
  const key = canonicalDocsRoot(root);
  let entry = entries.get(key);
  if (!entry) {
    entry = { attached: 0, gen: 0, lastUsed: __corpusCacheTestHooks.now(), walks: 0 };
    entries.set(key, entry);
  }
  entry.attached += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const e = entries.get(key);
    if (!e) return;
    e.attached -= 1;
    e.gen += 1;
    e.tree = undefined;
    if (e.attached <= 0) entries.delete(key);
  };
}

/**
 * Bumps the root's generation, dropping its cached tree. `relPath` is the
 * docs-root-relative path of a raw watcher event; paths under a dot segment
 * or `node_modules` are skipped (neither walker lists them). Temp-looking
 * names still bump: they may be directories, which the tree lists.
 */
export function invalidateDocsCorpus(root: string, relPath = ""): void {
  const rel = relPath.replaceAll("\\", "/");
  if (rel && /(^|\/)(\.|node_modules(\/|$))/.test(rel)) return;
  const e = entries.get(canonicalDocsRoot(root));
  if (!e) return;
  e.gen += 1;
  e.tree = undefined;
}

/** Lock-free cache read; `undefined` on a miss. */
export function peekDocsTree(root: string): DocsTreeNode[] | undefined {
  const e = entries.get(canonicalDocsRoot(root));
  if (!e || !hitOk(e)) return undefined;
  return touch(e).tree!.value;
}

/**
 * The only fill. Runs inside the corpus lock (from `store.tree()`), so it
 * never overlaps a store write. Not exported from the package.
 */
export async function storeTreeLocked(
  root: string,
  walk: () => Promise<DocsTreeNode[]>,
): Promise<DocsTreeNode[]> {
  const e = entries.get(canonicalDocsRoot(root));
  if (!e || e.attached === 0) return walk();
  if (hitOk(e)) return touch(e).tree!.value; // an earlier queued miss filled it
  const gen = e.gen;
  e.walks += 1;
  const value = deepFreeze(await walk());
  if (e.gen === gen && e.attached > 0 && maxAgeMs() > 0) {
    e.tree = { gen, at: __corpusCacheTestHooks.now(), value };
    touch(e);
    evictBeyondCap();
  }
  return value;
}

/** Test-only view of one root's cache entry. */
export function corpusCacheState(
  root: string,
): { attached: number; gen: number; walks: number; cached: boolean } | undefined {
  const e = entries.get(canonicalDocsRoot(root));
  return e && { attached: e.attached, gen: e.gen, walks: e.walks, cached: !!e.tree };
}
