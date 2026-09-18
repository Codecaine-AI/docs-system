import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/** Resolve symlink aliases so every host identifies the same corpus. */
export function canonicalDocsRoot(docsRoot: string): string {
  try { return realpathSync(docsRoot); } catch { return resolve(docsRoot); }
}

export type DraftLockKey = { kind: "doc" | "canvas" | "sequence"; path: string };

/**
 * Canonical draft-lock path derivation. Callers reach the lock store with
 * heterogeneous path shapes for the SAME underlying file:
 *
 *  - the UI's draft-lock routes send the docs/-prefixed `document_path`
 *    (e.g. `"docs/00-foundation/10-purpose"`) because that is what the doc
 *    routes return as `document_path`;
 *  - mutation-time guards (`applyDocOpsToBundle`, annotation writes,
 *    `canvas_apply_patch`, the canvas PUT/POST routes) key on the bare
 *    docs-root-relative path (bundle path or canvas sidecar rel path);
 *  - explicit `.../doc.json` or `*.doc.json` file paths also appear.
 *
 * This helper converges every accepted shape onto one canonical key:
 * strip a single leading `docs/` segment, strip a trailing `/doc.json`,
 * then normalize bundle-path style (mirrors index.ts's
 * `normalizeBundlePath`: drop a trailing `.json` extension and trailing
 * slashes, forward slashes only). It is applied inside `toLockKey`, so
 * EVERY store operation (acquire/heartbeat/release/checkForMutation)
 * converges no matter which shape the caller passed.
 */
export function canonicalDraftLockPath(path: string): string {
  let normalized = path.replaceAll("\\", "/");
  normalized = normalized.replace(/^docs\//i, "");
  const lower = normalized.toLowerCase();
  if (lower === "doc.json") return "";
  if (lower.endsWith("/doc.json")) {
    return normalized.slice(0, -"/doc.json".length);
  }
  if (lower.endsWith(".json")) {
    return normalized.slice(0, -".json".length);
  }
  return normalized.replace(/\/+$/, "");
}

export type DraftLockInfo = {
  sessionId: string;
  acquiredAt: string;
  expiresAt: string;
};

export type AcquireDraftLockResult =
  | { ok: true; lock: DraftLockInfo }
  | { ok: false; reason: "held-by-other"; heldBy: DraftLockInfo };

export class DraftLockStore {
  private readonly ttlMs: number;
  private readonly locks: Map<string, DraftLockInfo>;
  private readonly root: string;

  constructor(ttlMs = 180_000, locks = new Map<string, DraftLockInfo>(), root = "") {
    this.ttlMs = ttlMs;
    this.locks = locks;
    this.root = root;
  }

  /** Share leases within a corpus without colliding with another project. */
  forRoot(docsRoot: string): DraftLockStore {
    return new DraftLockStore(this.ttlMs, this.locks, canonicalDocsRoot(docsRoot));
  }

  /** Active editor leases must finish before the managed write authority is replaced. */
  activeCount(now = new Date()): number {
    let count = 0;
    for (const [key, lock] of this.locks) {
      if (this.isExpired(lock, now)) this.locks.delete(key);
      else if (JSON.parse(key)[0] === this.root) count++;
    }
    return count;
  }

  acquire(key: DraftLockKey, sessionId: string, now = new Date()): AcquireDraftLockResult {
    const lockKey = this.toLockKey(key);
    const existing = this.locks.get(lockKey);

    if (existing && this.isExpired(existing, now)) {
      this.locks.delete(lockKey);
    } else if (existing && existing.sessionId !== sessionId) {
      return { ok: false, reason: "held-by-other", heldBy: existing };
    }

    const lock = this.createLock(sessionId, now);
    this.locks.set(lockKey, lock);
    return { ok: true, lock };
  }

  heartbeat(key: DraftLockKey, sessionId: string, now = new Date()): AcquireDraftLockResult {
    // Heartbeat creates if absent: callers can use one "I'm still here" path
    // without first checking whether the lock was already acquired.
    return this.acquire(key, sessionId, now);
  }

  release(key: DraftLockKey, sessionId: string): void {
    const lockKey = this.toLockKey(key);
    const existing = this.locks.get(lockKey);

    if (existing?.sessionId === sessionId) {
      this.locks.delete(lockKey);
    }
  }

  checkForMutation(
    key: DraftLockKey,
    requestingSessionId?: string,
    // Optional now param added for deterministic testing, defaults to real time,
    // mirrors acquire/heartbeat.
    now = new Date(),
  ): { blocked: true; heldBy: DraftLockInfo } | { blocked: false } {
    const lockKey = this.toLockKey(key);
    const existing = this.locks.get(lockKey);

    if (!existing) {
      return { blocked: false };
    }

    if (this.isExpired(existing, now)) {
      this.locks.delete(lockKey);
      return { blocked: false };
    }

    if (requestingSessionId === existing.sessionId) {
      return { blocked: false };
    }

    return { blocked: true, heldBy: existing };
  }

  private createLock(sessionId: string, now: Date): DraftLockInfo {
    return {
      sessionId,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
    };
  }

  private isExpired(lock: DraftLockInfo, now: Date): boolean {
    return now.getTime() > new Date(lock.expiresAt).getTime();
  }

  private toLockKey(key: DraftLockKey): string {
    return JSON.stringify([this.root, key.kind, canonicalDraftLockPath(key.path)]);
  }
}

export const draftLockStore = new DraftLockStore();
