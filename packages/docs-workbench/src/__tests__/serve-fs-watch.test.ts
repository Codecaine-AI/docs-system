import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDocsStore, type DocsChangeEvent } from "@codecaine-ai/docs-server";

import { createDocsServeApp } from "../server";

/**
 * Live-reload integration: the serve app with `watchFs: true` publishes
 * change events for docs edited directly on disk (outside the API). Events
 * are observed on the store's change bus — the exact source `GET
 * /api/events` streams from (routes.ts subscribes per SSE connection).
 * Reading the SSE stream over real HTTP is NOT viable in the repo-wide test
 * run: the happy-dom global registrator (bunfig preload for the web tests)
 * replaces global fetch/Response, which corrupts in-process event-stream
 * framing — the same reason live-smoke.test.tsx spawns its server as a
 * subprocess.
 *
 * Also asserts the loop-safety properties in situ: `.index/` writes (the
 * backlinks sqlite the server itself maintains at boot and on saves) never
 * surface as events, and `app.stop()` closes the watcher so tests/hosts
 * don't leak it.
 */

let docsRoot: string;
let app: ReturnType<typeof createDocsServeApp>;
let appStopped = false;

async function stopApp(): Promise<void> {
  if (appStopped) return;
  appStopped = true;
  await app.stop();
}

const DOC_JSON = (title: string) =>
  JSON.stringify({
    schemaVersion: 1,
    id: "doc-guide",
    root: "root-1",
    blocks: {
      "root-1": { id: "root-1", flavour: "paragraph", props: { title }, children: [] },
    },
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await sleep(25);
  }
}

beforeAll(async () => {
  docsRoot = await mkdtemp(join(tmpdir(), "docs-serve-fs-watch-test-"));
  await mkdir(join(docsRoot, "10-guide"), { recursive: true });
  await writeFile(join(docsRoot, "10-guide", "doc.json"), DOC_JSON("Guide"));

  app = createDocsServeApp({ docsRoot, watchFs: true });
  app.listen({ hostname: "127.0.0.1", port: 0 });
  if (!app.server) throw new Error("serve app failed to listen");
});

afterAll(async () => {
  await stopApp();
  await rm(docsRoot, { recursive: true, force: true });
});

describe("serve app: fs watcher live-reload (watchFs)", () => {
  test("an on-disk doc.json edit publishes an fs-actor change event; .index writes publish none", async () => {
    const received: DocsChangeEvent[] = [];
    // Same per-docs-root channel the SSE route subscribes to.
    const store = createDocsStore(docsRoot);
    const unsubscribe = store.subscribeChanges((event) => received.push(event));
    try {
      // Give fs.watch registration a beat, and let the boot-time backlinks
      // rescan finish its .index writes.
      await sleep(400);
      const receivedAtBaseline = received.length;

      // The server's own backlinks-index writes must never round-trip into
      // change events (that would be a feedback loop: event -> index write
      // -> event ...).
      await mkdir(join(docsRoot, ".index"), { recursive: true });
      await writeFile(join(docsRoot, ".index", "backlinks.db"), "sqlite-bytes");

      // An external (non-API) doc edit: written straight to disk.
      await writeFile(join(docsRoot, "10-guide", "doc.json"), DOC_JSON("Guide v2"));

      await waitFor(() =>
        received.some((event) => event.path === "10-guide" && event.actor === "fs"),
      );
      // Let any straggler events land before asserting the negatives.
      await sleep(500);

      const guideEvents = received.filter((event) => event.path === "10-guide");
      expect(guideEvents.length).toBeGreaterThanOrEqual(1);
      expect(guideEvents[0]).toMatchObject({ path: "10-guide", changedIds: [], actor: "fs" });
      expect(guideEvents[0]?.patchId.startsWith("fs-")).toBe(true);

      expect(received.filter((event) => event.path.includes(".index"))).toEqual([]);
      // Only the doc edit produced events after baseline.
      expect(
        received.slice(receivedAtBaseline).every((event) => event.path === "10-guide"),
      ).toBe(true);
    } finally {
      unsubscribe();
    }
  }, 20000);

  test("app.stop() closes the watcher — later disk edits publish nothing", async () => {
    await stopApp();

    const received: DocsChangeEvent[] = [];
    const store = createDocsStore(docsRoot);
    const unsubscribe = store.subscribeChanges((event) => received.push(event));
    try {
      await writeFile(join(docsRoot, "10-guide", "doc.json"), DOC_JSON("Guide v3"));
      await sleep(700);
      expect(received).toEqual([]);
    } finally {
      unsubscribe();
    }
  }, 20000);
});
