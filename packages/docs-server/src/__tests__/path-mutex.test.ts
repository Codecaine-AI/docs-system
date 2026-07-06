import { describe, expect, test } from "bun:test";
import { withPathLock } from "../path-mutex";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withPathLock", () => {
  test("serializes concurrent calls on the same path without interleaving", async () => {
    const path = "/tmp/path-mutex-test/same-path-a";
    const events: string[] = [];

    const call = (label: string) =>
      withPathLock(path, async () => {
        events.push(`${label}:start`);
        await delay(20);
        events.push(`${label}:end`);
      });

    await Promise.all([call("call1"), call("call2")]);

    expect(events).toHaveLength(4);
    // Whichever call went first, it must fully complete (start+end) before
    // the other call's start appears — no interleaving.
    const firstLabel = events[0]!.split(":")[0];
    const secondLabel = firstLabel === "call1" ? "call2" : "call1";
    expect(events).toEqual([
      `${firstLabel}:start`,
      `${firstLabel}:end`,
      `${secondLabel}:start`,
      `${secondLabel}:end`,
    ]);
  });

  test("does not serialize calls on different paths", async () => {
    const pathA = "/tmp/path-mutex-test/different-path-a";
    const pathB = "/tmp/path-mutex-test/different-path-b";

    const start = performance.now();
    await Promise.all([
      withPathLock(pathA, async () => {
        await delay(50);
      }),
      withPathLock(pathB, async () => {
        await delay(50);
      }),
    ]);
    const elapsed = performance.now() - start;

    // If these were serialized we'd see ~100ms; concurrent execution should
    // be close to the ~50ms of the slower call. Generous tolerance to avoid
    // flakiness on a loaded CI machine.
    expect(elapsed).toBeLessThan(90);
  });

  test("releases the lock and runs the next queued call even if fn throws", async () => {
    const path = "/tmp/path-mutex-test/throwing-path";
    let secondFnRan = false;

    const failing = withPathLock(path, async () => {
      throw new Error("boom");
    });

    const succeeding = withPathLock(path, async () => {
      secondFnRan = true;
      return "ok";
    });

    await expect(failing).rejects.toThrow("boom");
    await expect(succeeding).resolves.toBe("ok");
    expect(secondFnRan).toBe(true);
  });

  test("does not leak a stale queue entry after work drains", async () => {
    const path = "/tmp/path-mutex-test/drain-path";

    await withPathLock(path, async () => {
      await delay(20);
    });

    // With the queue cleaned up, a fresh call should start immediately
    // (no residual queueing delay from a stale map entry).
    const start = performance.now();
    await withPathLock(path, async () => {
      await delay(5);
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(40);
  });
});
