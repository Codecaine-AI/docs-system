import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBacklinksDb } from "./backlinks-cache";
import { withPathLock } from "./path-mutex";
import { createDocsStore } from "./store";

const sample = {
  schemaVersion: 1, id: "guide", title: "Guide", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["heading"] },
    heading: { id: "heading", type: "heading", props: { level: 1 }, text: [{ insert: "Guide" }], children: [] },
  },
};
const setLevel = (level: number) => [{ type: "updateBlock" as const, blockId: "heading", props: { level } }];

describe("store-operation lock", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "docs-store-lock-"));
    await mkdir(join(dir, "guide"), { recursive: true });
    await writeFile(join(dir, "guide", "doc.json"), JSON.stringify(sample));
    await getBacklinksDb(dir);
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  const storeLock = (root: string) => join(root, ".changesets", ".store-operation-lock");

  test("a bundle read answers while a 2 s tree walk holds the store lock", async () => {
    const store = createDocsStore(dir);
    // A tree walk that takes 2 s inside the store lock: the old wrap made every read wait for it.
    const slowTree = withPathLock(storeLock(store.docsRoot), async () => {
      const tree = await store.tree();
      await Bun.sleep(2000);
      return tree;
    });
    const started = performance.now();
    const bundle = await store.bundle("guide");
    const elapsed = performance.now() - started;
    expect("error" in bundle).toBe(false);
    expect(elapsed).toBeLessThan(30);
    expect((await slowTree).length).toBeGreaterThan(0);
  }, 5000);

  test("two mutations started together still serialize behind the store lock", async () => {
    const store = createDocsStore(dir);
    const first = store.applyDocOps("guide", setLevel(2));
    // Queued between the two mutations: it runs after the first finishes and before the second starts.
    const between = withPathLock(storeLock(store.docsRoot), async () =>
      JSON.parse(await readFile(join(dir, "guide", "doc.json"), "utf8")).blocks.heading.props.level);
    const second = store.applyDocOps("guide", setLevel(3));
    const [a, levelBetween, b] = await Promise.all([first, between, second]);
    expect(a.ok && b.ok).toBe(true);
    expect(levelBetween).toBe(2);
    expect(JSON.parse(await readFile(join(dir, "guide", "doc.json"), "utf8")).blocks.heading.props.level).toBe(3);
  }, 5000);
});
