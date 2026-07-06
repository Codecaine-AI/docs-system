import { describe, expect, test } from "bun:test";
import { canonicalDraftLockPath, DraftLockStore, type DraftLockKey } from "./draft-locks";

const ttlMs = 50;
const key: DraftLockKey = { kind: "doc", path: "a" };
const at = (ms: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ms));

describe("DraftLockStore", () => {
  test("acquire by session A succeeds, then session B fails with A heldBy info", () => {
    const store = new DraftLockStore(ttlMs);
    const acquired = store.acquire(key, "A", at(0));

    expect(acquired.ok).toBe(true);
    if (!acquired.ok) {
      throw new Error("expected acquire to succeed");
    }

    const blocked = store.acquire(key, "B", at(10));

    expect(blocked).toEqual({
      ok: false,
      reason: "held-by-other",
      heldBy: acquired.lock,
    });
  });

  test("idempotent re-acquire by same session succeeds and refreshes lock", () => {
    const store = new DraftLockStore(ttlMs);

    store.acquire(key, "A", at(0));
    const reacquired = store.acquire(key, "A", at(10));

    expect(reacquired.ok).toBe(true);
    if (!reacquired.ok) {
      throw new Error("expected re-acquire to succeed");
    }
    expect(reacquired.lock).toEqual({
      sessionId: "A",
      acquiredAt: at(10).toISOString(),
      expiresAt: at(60).toISOString(),
    });
  });

  test("heartbeat extends expiresAt", () => {
    const store = new DraftLockStore(ttlMs);
    const acquired = store.acquire(key, "A", at(0));

    expect(acquired.ok).toBe(true);
    if (!acquired.ok) {
      throw new Error("expected acquire to succeed");
    }

    const heartbeat = store.heartbeat(key, "A", at(30));

    expect(heartbeat.ok).toBe(true);
    if (!heartbeat.ok) {
      throw new Error("expected heartbeat to succeed");
    }
    expect(new Date(heartbeat.lock.expiresAt).getTime()).toBeGreaterThan(
      new Date(acquired.lock.expiresAt).getTime(),
    );
  });

  test("different session can acquire after ttl passes", () => {
    const store = new DraftLockStore(ttlMs);
    const acquired = store.acquire(key, "A", at(0));

    expect(acquired.ok).toBe(true);
    if (!acquired.ok) {
      throw new Error("expected acquire to succeed");
    }

    const takeover = store.acquire(key, "B", new Date(new Date(acquired.lock.expiresAt).getTime() + 1));

    expect(takeover.ok).toBe(true);
    if (!takeover.ok) {
      throw new Error("expected expired lock takeover to succeed");
    }
    expect(takeover.lock.sessionId).toBe("B");
  });

  test("release by holder clears lock", () => {
    const store = new DraftLockStore(ttlMs);

    store.acquire(key, "A", at(0));
    store.release(key, "A");
    const acquired = store.acquire(key, "B", at(10));

    expect(acquired.ok).toBe(true);
    if (!acquired.ok) {
      throw new Error("expected acquire after release to succeed");
    }
    expect(acquired.lock.sessionId).toBe("B");
  });

  test("release by non-holder is silent no-op", () => {
    const store = new DraftLockStore(ttlMs);
    const original = store.acquire(key, "A", at(0));

    expect(original.ok).toBe(true);
    if (!original.ok) {
      throw new Error("expected acquire to succeed");
    }

    store.release(key, "B");
    const blocked = store.acquire(key, "C", at(10));

    expect(blocked).toEqual({
      ok: false,
      reason: "held-by-other",
      heldBy: original.lock,
    });
  });

  test("checkForMutation handles foreign, own, absent, and expired locks", () => {
    const store = new DraftLockStore(ttlMs);

    expect(store.checkForMutation(key, "B", at(0))).toEqual({ blocked: false });

    const acquired = store.acquire(key, "A", at(0));
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) {
      throw new Error("expected acquire to succeed");
    }

    expect(store.checkForMutation(key, "B", at(10))).toEqual({
      blocked: true,
      heldBy: acquired.lock,
    });
    expect(store.checkForMutation(key, undefined, at(10))).toEqual({
      blocked: true,
      heldBy: acquired.lock,
    });
    expect(store.checkForMutation(key, "A", at(10))).toEqual({ blocked: false });
    expect(store.checkForMutation(key, "B", at(51))).toEqual({ blocked: false });

    const takeover = store.acquire(key, "B", at(52));
    expect(takeover.ok).toBe(true);
    if (!takeover.ok) {
      throw new Error("expected acquire after expired check to succeed");
    }
    expect(takeover.lock.sessionId).toBe("B");
  });

  test("independent keys never interact", () => {
    const store = new DraftLockStore(ttlMs);
    const docA = { kind: "doc" as const, path: "a" };
    const docB = { kind: "doc" as const, path: "b" };
    const canvasA = { kind: "canvas" as const, path: "a" };

    store.acquire(docA, "A", at(0));
    const docBAcquire = store.acquire(docB, "B", at(10));
    const canvasAAcquire = store.acquire(canvasA, "B", at(10));

    expect(docBAcquire.ok).toBe(true);
    expect(canvasAAcquire.ok).toBe(true);
  });
});

describe("canonicalDraftLockPath (lock-key unification)", () => {
  test("converges every accepted doc-path shape onto the bare bundle path", () => {
    expect(canonicalDraftLockPath("docs/00-foundation/10-purpose")).toBe("00-foundation/10-purpose");
    expect(canonicalDraftLockPath("00-foundation/10-purpose")).toBe("00-foundation/10-purpose");
    expect(canonicalDraftLockPath("docs/00-foundation/10-purpose/doc.json")).toBe("00-foundation/10-purpose");
    expect(canonicalDraftLockPath("00-foundation/10-purpose/doc.json")).toBe("00-foundation/10-purpose");
    expect(canonicalDraftLockPath("00-foundation/10-purpose/")).toBe("00-foundation/10-purpose");
  });

  test("converges canvas sidecar shapes (docs/-prefixed vs root-relative)", () => {
    expect(canonicalDraftLockPath("docs/guide/assets/canvases/arch.canvas.json")).toBe(
      canonicalDraftLockPath("guide/assets/canvases/arch.canvas.json"),
    );
  });

  test("strips only a single leading docs/ segment", () => {
    expect(canonicalDraftLockPath("docs/docs/foo")).toBe("docs/foo");
  });
});

describe("DraftLockStore key canonicalization (UI path shape vs mutation path shape)", () => {
  test("a lock acquired under the UI's docs/-prefixed path blocks a mutation keyed on the bare bundle path", () => {
    const store = new DraftLockStore(ttlMs);
    store.acquire({ kind: "doc", path: "docs/guide" }, "editor-1", at(0));

    const foreign = store.checkForMutation({ kind: "doc", path: "guide" }, "agent-2", at(10));
    expect(foreign.blocked).toBe(true);

    const own = store.checkForMutation({ kind: "doc", path: "guide" }, "editor-1", at(10));
    expect(own.blocked).toBe(false);
  });

  test("release under one shape frees the lock acquired under another", () => {
    const store = new DraftLockStore(ttlMs);
    store.acquire({ kind: "doc", path: "docs/guide/doc.json" }, "editor-1", at(0));
    store.release({ kind: "doc", path: "guide" }, "editor-1");

    const check = store.checkForMutation({ kind: "doc", path: "docs/guide" }, "someone-else", at(10));
    expect(check.blocked).toBe(false);
  });
});
