import { randomUUID } from "node:crypto";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { DocsChangeEvent } from "./docs-events";

/**
 * Filesystem watcher for a docs root: turns on-disk edits made OUTSIDE the
 * API (hand edits, agents, CLI writes) into the same `DocsChangeEvent`s the
 * store publishes for API mutations, so open workbench tabs live-reload
 * external changes through the existing SSE stream.
 *
 * Loop/echo safety, in order of importance:
 *
 *  - Dot segments are ignored. `.index/` (the backlinks sqlite the server
 *    writes IN RESPONSE to doc saves) would otherwise feed the watcher's
 *    output back into its input.
 *  - Atomic-write temp names (`<file>.tmp-<uuid>`, see atomic-write.ts) are
 *    ignored so a store save doesn't double-fire (temp create + rename).
 *  - Events carry `actor: FS_WATCH_ACTOR` ("fs"), which can never equal a
 *    client's session id, so no client filters them as its own echo — and
 *    conversely no client mistakes a store echo for its own edit.
 *  - API mutations also touch disk, so the watcher re-fires ~immediately
 *    after every store-published event. That duplicate is deliberate and
 *    benign: clients react by re-FETCHING the bundle (a read), never by
 *    writing, so there is no feedback edge to loop through.
 */

/** Actor stamped on watcher-published events; never a client session id. */
export const FS_WATCH_ACTOR = "fs";

/** Matches atomic-write.ts temp names: `<name>.tmp-<uuid>`. */
const ATOMIC_TEMP_RE = /\.tmp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WatchDocsRootOptions {
  /** Trailing per-path debounce so editor saves / multi-file writes coalesce. */
  debounceMs?: number;
  /** Poll interval for the fallback scanner (only when fs.watch is unavailable). */
  pollIntervalMs?: number;
}

export interface DocsFsWatchHandle {
  close(): void;
  /** "fs-watch" (recursive fs.watch) or "poll" (mtime-scan fallback). */
  readonly mode: "fs-watch" | "poll";
}

const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_POLL_INTERVAL_MS = 1000;

/**
 * Maps a docs-root-relative changed path to the `DocsChangeEvent.path` it
 * should be reported as, or `null` when the change must be ignored.
 *
 *  - dotfile / dot-directory / node_modules segments -> null (`.index/`!)
 *  - atomic-write temp files -> null
 *  - `*.canvas.json` -> the canvas rel path itself (what canvas events use)
 *  - `doc.json` / `annotations.json` -> the containing bundle folder
 *  - anything else (assets, dir events) -> the nearest enclosing bundle
 *    folder (a dir with doc.json), falling back to the rel path as-is.
 *
 * Exported for direct unit testing of the filter/mapping rules.
 */
export function changeTargetForRelPath(docsRoot: string, relPath: string): string | null {
  const normalized = relPath.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return null;

  const segments = normalized.split("/");
  for (const segment of segments) {
    if (segment.startsWith(".") || segment === "node_modules") return null;
  }

  const base = segments[segments.length - 1] ?? "";
  if (ATOMIC_TEMP_RE.test(base)) return null;

  if (base.toLowerCase().endsWith(".canvas.json")) return normalized;

  const parent = segments.slice(0, -1).join("/");
  if (base === "doc.json" || base === "annotations.json") return parent;

  // A directory event on a bundle folder itself.
  if (existsSync(join(docsRoot, normalized, "doc.json"))) return normalized;

  // Other files (assets, loose markdown, …): attribute to the nearest
  // enclosing bundle so an open tab on that bundle refreshes.
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const ancestor = segments.slice(0, index).join("/");
    if (existsSync(join(docsRoot, ancestor, "doc.json"))) return ancestor;
  }
  return normalized;
}

/**
 * Watches `docsRoot` recursively and publishes bundle-level change events
 * for on-disk changes. Prefers `fs.watch(root, { recursive: true })` (FSEvents
 * on macOS — verified supported under Bun); when recursive watching is
 * unavailable it falls back to a light mtime-polling scan so behavior stays
 * correct, just slower.
 */
export function watchDocsRoot(
  docsRoot: string,
  publish: (event: DocsChangeEvent) => void,
  options: WatchDocsRootOptions = {},
): DocsFsWatchHandle {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let closed = false;

  // -- per-target trailing debounce ------------------------------------------
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const onFsChange = (relPath: string | null) => {
    if (closed || relPath == null) return;
    const target = changeTargetForRelPath(docsRoot, relPath);
    if (target === null) return;
    const existing = pending.get(target);
    if (existing) clearTimeout(existing);
    pending.set(
      target,
      setTimeout(() => {
        pending.delete(target);
        if (closed) return;
        publish({
          path: target,
          changedIds: [],
          patchId: `fs-${randomUUID()}`,
          actor: FS_WATCH_ACTOR,
        });
      }, debounceMs),
    );
  };

  let watcher: FSWatcher | null = null;
  let stopPolling: (() => void) | null = null;
  let mode: "fs-watch" | "poll";
  try {
    watcher = watch(docsRoot, { recursive: true }, (_eventType, filename) => {
      onFsChange(typeof filename === "string" ? filename : null);
    });
    // Late errors (e.g. the root disappearing) must not crash the host.
    watcher.on("error", () => {});
    mode = "fs-watch";
  } catch {
    stopPolling = startPollingScan(
      docsRoot,
      onFsChange,
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    );
    mode = "poll";
  }

  return {
    mode,
    close() {
      if (closed) return;
      closed = true;
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      watcher?.close();
      stopPolling?.();
    },
  };
}

// -- polling fallback ---------------------------------------------------------

type Snapshot = Map<string, string>;

/** Recursive mtime+size scan, skipping dot/node_modules dirs (same ignore set
 * as the mapping — the mapping still runs on every reported path). */
async function scanTree(docsRoot: string, relDir = "", into: Snapshot = new Map()): Promise<Snapshot> {
  let entries;
  try {
    entries = await readdir(join(docsRoot, relDir), { withFileTypes: true });
  } catch {
    return into;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await scanTree(docsRoot, rel, into);
    } else if (entry.isFile()) {
      try {
        const st = await stat(join(docsRoot, rel));
        into.set(rel, `${st.mtimeMs}:${st.size}`);
      } catch {
        // Raced with a delete; the next scan settles it.
      }
    }
  }
  return into;
}

function startPollingScan(
  docsRoot: string,
  onFsChange: (relPath: string) => void,
  intervalMs: number,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous: Snapshot | null = null;

  const tick = async () => {
    const current = await scanTree(docsRoot);
    if (stopped) return;
    if (previous) {
      for (const [rel, sig] of current) {
        if (previous.get(rel) !== sig) onFsChange(rel);
      }
      for (const rel of previous.keys()) {
        if (!current.has(rel)) onFsChange(rel);
      }
    }
    previous = current;
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };
  void tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
