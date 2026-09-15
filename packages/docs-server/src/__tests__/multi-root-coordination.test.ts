import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withPathLock } from "../path-mutex";
import { createDocsStore } from "../store";
import { createDocsRoutes } from "../routes";
import { draftLockStore } from "../draft-locks";
import { undo_patch } from "../agent-tools";
import { getBacklinksDb } from "../backlinks-cache";

const sample = {
  schemaVersion: 1, id: "guide", title: "Guide", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["heading"] },
    heading: { id: "heading", type: "heading", props: { level: 1 }, text: [{ insert: "Guide" }], children: [] },
  },
};
const ops = [{ type: "updateBlock" as const, blockId: "heading", props: { level: 2 } }];

describe("multi-project coordination", () => {
  let dir: string;
  let rootA: string;
  let rootB: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "docs-multi-root-"));
    rootA = join(dir, "a"); rootB = join(dir, "b");
    for (const root of [rootA, rootB]) {
      await mkdir(join(root, "guide"), { recursive: true });
      await writeFile(join(root, "guide", "doc.json"), JSON.stringify(sample));
      await getBacklinksDb(root);
    }
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  test("all draft kinds isolate projects, share aliases, heartbeat and release within their corpus", async () => {
    const alias = join(dir, "alias");
    await symlink(rootA, alias);
    for (const kind of ["doc", "canvas", "sequence"] as const) {
      const a = createDocsStore(rootA).locks;
      const b = createDocsStore(rootB).locks;
      const sameA = createDocsStore(alias).locks;
      const key = { kind, path: "guide" };
      expect(a.acquire({ kind, path: "docs/guide/doc.json" }, "editor-a").ok).toBe(true);
      expect(b.acquire(key, "editor-b").ok).toBe(true);
      expect(sameA.checkForMutation(key, "other").blocked).toBe(true);
      expect(sameA.heartbeat(key, "other").ok).toBe(false);
      expect(sameA.heartbeat(key, "editor-a").ok).toBe(true);
      b.release(key, "editor-a");
      expect(a.checkForMutation(key, "other").blocked).toBe(true);
      sameA.release(key, "editor-a");
      expect(a.checkForMutation(key, "other").blocked).toBe(false);
      expect(b.checkForMutation(key, "other").blocked).toBe(true);
    }
  });

  test("path mutex serializes real and symlink paths before a target file exists", async () => {
    const alias = join(dir, "alias");
    await symlink(rootA, alias);
    let release!: () => void;
    let entered!: () => void;
    const holding = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const first = withPathLock(join(rootA, "new/page/doc.json"), async () => { entered(); await holding; });
    await started;
    let secondEntered = false;
    const second = withPathLock(join(alias, "new/page/doc.json"), async () => { secondEntered = true; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(secondEntered).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(secondEntered).toBe(true);
  });

  test("UI lock blocks internal/direct edits to its project, but permits an identically named doc in another", async () => {
    const app = createDocsRoutes(createDocsStore(rootA));
    const lock = await app.handle(new Request("http://localhost/api/draft-lock/acquire", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "doc", path: "docs/guide", sessionId: "ui-session" }),
    }));
    expect(lock.status).toBe(200);
    const blocked = await createDocsStore(rootA).applyDocOps("guide", ops, undefined, "agent-session");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.status).toBe(423);
    const other = await createDocsStore(rootB).applyDocOps("guide", ops, undefined, "agent-session");
    expect(other.ok).toBe(true);
    draftLockStore.forRoot(rootA).release({ kind: "doc", path: "guide" }, "ui-session");
    expect((await createDocsStore(rootA).applyDocOps("guide", ops, undefined, "agent-session")).ok).toBe(true);
  });

  test("a foreign-root undo cannot modify matching content or consume the owning project's patch", async () => {
    const a = await createDocsStore(rootA).applyDocOps("guide", ops, undefined);
    const b = await createDocsStore(rootB).applyDocOps("guide", ops, undefined);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("fixture edit failed");
    expect(a.hash).toBe(b.hash);
    const before = await readFile(join(rootB, "guide/doc.json"), "utf8");
    const wrongRoot = await undo_patch(rootB, a.patchId);
    expect(wrongRoot.ok).toBe(false);
    if (!wrongRoot.ok) expect(wrongRoot.status).toBe(404);
    expect(await readFile(join(rootB, "guide/doc.json"), "utf8")).toBe(before);
    expect((await undo_patch(rootA, a.patchId)).ok).toBe(true);
    expect((await undo_patch(rootB, b.patchId)).ok).toBe(true);
  });
});
