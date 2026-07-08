import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DocsChangeEvent } from "../docs-events";
import { FS_WATCH_ACTOR, changeTargetForRelPath, watchDocsRoot } from "../fs-watch";

/**
 * Watcher unit tests: the pure filter/mapping rules (`changeTargetForRelPath`)
 * are tested exhaustively (they are what prevents the `.index/` feedback loop
 * and atomic-temp double-fires), plus best-effort integration through a real
 * recursive `fs.watch` with generous timeouts.
 */

let docsRoot: string;

const DOC_JSON = JSON.stringify({
  schemaVersion: 1,
  id: "doc-1",
  root: "root-1",
  blocks: { "root-1": { id: "root-1", type: "paragraph", props: {}, children: [] } },
});

beforeAll(async () => {
  docsRoot = await mkdtemp(join(tmpdir(), "docs-fs-watch-test-"));
  await mkdir(join(docsRoot, "10-guide", "assets", "canvases"), { recursive: true });
  await mkdir(join(docsRoot, "20-section", "30-topic"), { recursive: true });
  await mkdir(join(docsRoot, ".index"), { recursive: true });
  await writeFile(join(docsRoot, "10-guide", "doc.json"), DOC_JSON);
  await writeFile(join(docsRoot, "20-section", "30-topic", "doc.json"), DOC_JSON);
});

afterAll(async () => {
  await rm(docsRoot, { recursive: true, force: true });
});

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("fs-watch: changeTargetForRelPath filter/mapping", () => {
  test("doc.json and comments.json map to their bundle folder", () => {
    expect(changeTargetForRelPath(docsRoot, "10-guide/doc.json")).toBe("10-guide");
    expect(changeTargetForRelPath(docsRoot, "10-guide/comments.json")).toBe("10-guide");
    expect(changeTargetForRelPath(docsRoot, "20-section/30-topic/doc.json")).toBe(
      "20-section/30-topic",
    );
    // A doc.json at the docs root maps to the root bundle path "".
    expect(changeTargetForRelPath(docsRoot, "doc.json")).toBe("");
  });

  test("canvas sidecars map to the canvas rel path itself", () => {
    expect(changeTargetForRelPath(docsRoot, "10-guide/assets/canvases/flow.canvas.json")).toBe(
      "10-guide/assets/canvases/flow.canvas.json",
    );
  });

  test("assets map to the nearest enclosing bundle", () => {
    expect(changeTargetForRelPath(docsRoot, "10-guide/assets/images/pic.png")).toBe("10-guide");
  });

  test("a directory event on a bundle folder maps to that bundle", () => {
    expect(changeTargetForRelPath(docsRoot, "10-guide")).toBe("10-guide");
  });

  test("dot segments are ignored — especially .index (backlinks sqlite)", () => {
    expect(changeTargetForRelPath(docsRoot, ".index")).toBeNull();
    expect(changeTargetForRelPath(docsRoot, ".index/backlinks.db")).toBeNull();
    expect(changeTargetForRelPath(docsRoot, ".index/backlinks.db-journal")).toBeNull();
    expect(changeTargetForRelPath(docsRoot, "10-guide/.DS_Store")).toBeNull();
    expect(changeTargetForRelPath(docsRoot, ".drafts/wip/doc.json")).toBeNull();
    expect(changeTargetForRelPath(docsRoot, "node_modules/pkg/doc.json")).toBeNull();
  });

  test("atomic-write temp files are ignored (no double-fire on temp+rename)", () => {
    expect(
      changeTargetForRelPath(
        docsRoot,
        "10-guide/doc.json.tmp-01234567-89ab-cdef-0123-456789abcdef",
      ),
    ).toBeNull();
  });

  test("files outside any bundle fall back to their own rel path", () => {
    expect(changeTargetForRelPath(docsRoot, "20-section/40-loose.md")).toBe(
      "20-section/40-loose.md",
    );
  });
});

describe("fs-watch: watchDocsRoot integration (recursive fs.watch)", () => {
  test("an external doc.json edit publishes one debounced bundle event; .index and temp writes publish none", async () => {
    const events: DocsChangeEvent[] = [];
    // Debounce wider than FSEvents' batch-delivery spacing so the temp-file
    // dir event and the two doc.json writes all coalesce into one window.
    const watcher = watchDocsRoot(docsRoot, (event) => events.push(event), {
      debounceMs: 300,
    });
    try {
      // fs.watch registration is asynchronous under FSEvents; give it a beat.
      await sleep(200);

      // These must be invisible to the watcher: the backlinks index the
      // server itself writes (feedback loop!) and an atomic-write temp file.
      await writeFile(join(docsRoot, ".index", "backlinks.db"), "sqlite-bytes");
      await writeFile(
        join(docsRoot, "10-guide", "doc.json.tmp-01234567-89ab-cdef-0123-456789abcdef"),
        DOC_JSON,
      );

      // Two rapid writes to the same bundle coalesce into one event.
      await writeFile(join(docsRoot, "10-guide", "doc.json"), DOC_JSON);
      await writeFile(join(docsRoot, "10-guide", "doc.json"), `${DOC_JSON}\n`);

      await waitFor(() => events.some((event) => event.path === "10-guide"));
      // Let the debounce window (and any straggler fs events) fully settle.
      await sleep(800);

      const guideEvents = events.filter((event) => event.path === "10-guide");
      expect(guideEvents.length).toBe(1);
      expect(guideEvents[0]).toMatchObject({
        path: "10-guide",
        changedIds: [],
        actor: FS_WATCH_ACTOR,
      });
      expect(guideEvents[0]?.patchId.startsWith("fs-")).toBe(true);

      // Nothing from .index/ or the temp file (any dot/temp-derived event
      // would have surfaced under a different path).
      expect(
        events.filter(
          (event) => event.path.includes(".index") || event.path.includes(".tmp-"),
        ),
      ).toEqual([]);
    } finally {
      watcher.close();
      await rm(
        join(docsRoot, "10-guide", "doc.json.tmp-01234567-89ab-cdef-0123-456789abcdef"),
        { force: true },
      );
    }
  }, 15000);

  test("close() stops event delivery", async () => {
    const events: DocsChangeEvent[] = [];
    const watcher = watchDocsRoot(docsRoot, (event) => events.push(event), {
      debounceMs: 50,
    });
    await sleep(200);
    watcher.close();
    await writeFile(join(docsRoot, "20-section", "30-topic", "doc.json"), `${DOC_JSON}\n`);
    await sleep(400);
    expect(events).toEqual([]);
  }, 15000);
});
