import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { extractCanvasRefs, upsertForSource } from "@codecaine-ai/docs-index/backlinks";

import { getBacklinksDb } from "../backlinks-cache";
import { createDocBundle, replayTreeOpInverse } from "../changesets/tree-ops";
import { mergeDocsChangeSet } from "../changesets/move-blocks";
import { createContentHash } from "../content-hash";
import { getStoredPatch, recordCompoundPatch, recordSidecarPatch } from "../patch-ledger";
import { createDocsRoutes } from "../routes";
import { createDocsStore, type DocsStore } from "../store";

/**
 * Round 2 owner-boundary cases for the docs-root chokepoint
 * (@codecaine-ai/docs-index/safe-path):
 *
 * - B7-2-01: a move's stale inbound rewrite, and Canvas, Sequence, sidecar
 *   (write and unlink) and tree undo, reached through an assets-folder alias
 *   that leads into the frozen inputs, never touch the frozen bytes; the
 *   refused patch stays in the ledger; the same flows work without the alias.
 * - B7-2-02: a host serving KB/notes refuses an alias into the enclosing
 *   KB's excluded sibling, for uploads (missing and existing names), asset,
 *   Canvas and sidecar reads and writes; a real assets folder still works.
 * - B7-2-03: a docs page folder named `tasks` deletes, moves, renames and
 *   merges like any page; a genuine `tasks/<slug>.json` Task record refuses.
 */

const FROZEN = "sessions/s1/outputs/inputs/p1";
const POLICY = JSON.stringify({ name: "kb", docsRoot: ".", exclude: ["sessions/*/outputs/inputs/**"] });
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b60000000049454e44ae426082", "hex");

const DOC = (id: string) => `${JSON.stringify({
  schemaVersion: 1,
  id,
  title: id,
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
    p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: `Body of ${id}.` }], children: [] },
  },
}, null, 2)}\n`;

const CANVAS = (id: string, target: string) => ({
  schemaVersion: 1,
  id,
  mode: "diagram",
  title: id,
  objects: [{ id: "obj-1", type: "process", text: "Step", parentId: null, geometry: { x: 0, y: 0, width: 120, height: 64 } }],
  connections: [],
  links: [{ id: "l1", objectId: "obj-1", target: { kind: "doc", path: target }, status: "resolved" }],
});

const SEQUENCE = (id: string) => ({
  version: 1,
  id,
  title: id,
  participants: [
    { id: "a", name: "a", kind: "participant" },
    { id: "b", name: "b", kind: "participant" },
  ],
  items: [{ kind: "message", id: "m1", from: "a", to: "b", line: "sync", text: "hello" }],
  style: {},
});

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

let temp: string;
let kb: string;

async function write(rel: string, bytes: string | Buffer) {
  await mkdir(join(kb, rel, ".."), { recursive: true });
  await writeFile(join(kb, rel), bytes);
}

/** Every path below `dir` (folders end in "/") with the sha256 of each file. */
async function bytesBelow(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (rel: string) => {
    for (const entry of await readdir(join(kb, rel), { withFileTypes: true })) {
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else if (entry.isSymbolicLink()) out[path] = "link";
      else out[path] = createHash("sha256").update(await readFile(join(kb, path))).digest("hex");
    }
  };
  await walk(dir);
  return out;
}

const frozenBytes = () => bytesBelow("sessions");

/** Replaces notes/twin/assets with an alias to the frozen assets folder (the real folder is set aside). */
async function aliasTwinAssets() {
  await rename(join(kb, "notes/twin/assets"), join(kb, "notes/twin-assets-real"));
  await symlink(join(kb, FROZEN, "assets"), join(kb, "notes/twin/assets"), "dir");
}

async function restoreTwinAssets() {
  await unlink(join(kb, "notes/twin/assets"));
  await rename(join(kb, "notes/twin-assets-real"), join(kb, "notes/twin/assets"));
}

beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "docs-chokepoint-owners-")));
  kb = join(temp, "kb");
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe("B7-2-01: move rewrites never write a frozen file through an alias", () => {
  const STALE = "notes/twin/assets/canvases/c.canvas.json";
  const CONTROL = "notes/other/assets/canvases/d.canvas.json";

  async function seed(): Promise<DocsStore> {
    await write("codecaine.docs.json", POLICY);
    await write("notes/from/doc.json", DOC("from"));
    await write("notes/twin/doc.json", DOC("twin"));
    await write("notes/other/doc.json", DOC("other"));
    await write(CONTROL, json(CANVAS("control", "notes/from")));
    // The frozen Canvas links to the page that moves; notes/twin/assets is an alias to its folder.
    await write(`${FROZEN}/doc.json`, DOC("frozen"));
    await write(`${FROZEN}/assets/canvases/c.canvas.json`, json(CANVAS("frozen", "notes/from")));
    await symlink(join(kb, FROZEN, "assets"), join(kb, "notes/twin/assets"), "dir");
    const store = createDocsStore(kb);
    // Index rows: the control, and a stale row naming the frozen Canvas by its alias path.
    const db = await getBacklinksDb(kb);
    upsertForSource(db, CONTROL, extractCanvasRefs(CANVAS("control", "notes/from") as any));
    upsertForSource(db, STALE, extractCanvasRefs(CANVAS("frozen", "notes/from") as any));
    return store;
  }

  function expectRefusedStaleRewrite(result: { rewrittenSources: string[]; failures: Array<{ sourcePath: string; reason: string }> }) {
    expect(result.rewrittenSources).toContain(CONTROL);
    expect(result.rewrittenSources).not.toContain(STALE);
    const failure = result.failures.find((entry) => entry.sourcePath === STALE);
    expect(failure?.reason).toContain("excluded");
  }

  async function expectControlRewritten() {
    const control = JSON.parse(await readFile(join(kb, CONTROL), "utf8"));
    expect(control.links[0].target.path).toBe("notes/to");
  }

  test("store.moveDoc", async () => {
    const store = await seed();
    const before = await frozenBytes();
    const moved = await store.moveDoc("notes/from", "notes/to");
    if (!moved.ok) throw new Error(moved.detail);
    expectRefusedStaleRewrite(moved);
    await expectControlRewritten();
    expect(await frozenBytes()).toEqual(before);
  });

  test("HTTP POST /api/move", async () => {
    const store = await seed();
    const before = await frozenBytes();
    const response = await createDocsRoutes(store).handle(new Request("http://localhost/api/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromPath: "notes/from", toPath: "notes/to" }),
    }));
    expect(response.status).toBe(200);
    expectRefusedStaleRewrite((await response.json()) as any);
    await expectControlRewritten();
    expect(await frozenBytes()).toEqual(before);
  });

  test("change-set move-doc (tree-ops adapter)", async () => {
    const store = await seed();
    const before = await frozenBytes();
    const staged = await store.changesetStage({ summary: "move", entries: [], treeOps: [{ kind: "move-doc", from: "notes/from", to: "notes/to", position: 0 }] as any });
    if (!staged.ok) throw new Error(staged.detail);
    const accepted = await store.changesetAccept(staged.changeset.id);
    expect(accepted.ok).toBe(true);
    const treeResult = (accepted as any).results.find((entry: any) => entry.kind === "tree-op");
    expect(treeResult.failures.map((entry: any) => entry.sourcePath)).toContain(STALE);
    await expectControlRewritten();
    expect(await frozenBytes()).toEqual(before);
  });
});

describe("B7-2-01: undo never writes or unlinks a frozen file through an alias", () => {
  const CANVAS_SRC = "notes/twin/assets/canvases/c.canvas.json";
  const SEQUENCE_SRC = "notes/twin/assets/sequences/q.sequence.json";

  async function seed(): Promise<DocsStore> {
    await write("codecaine.docs.json", POLICY);
    await write("notes/twin/doc.json", DOC("twin"));
    await write(CANVAS_SRC, json(CANVAS("twin-canvas", "notes/twin")));
    await write(SEQUENCE_SRC, json(SEQUENCE("twin-sequence")));
    await write(`${FROZEN}/doc.json`, DOC("frozen"));
    return createDocsStore(kb);
  }

  test("Canvas and Sequence undo with a matching recorded hash are refused; the patches stay; without the alias they undo", async () => {
    const store = await seed();
    const canvasPatch = await store.applyCanvasPatch(CANVAS_SRC, [{ type: "updateObject", objectId: "obj-1", patch: { text: "Changed" } } as any]);
    if (!canvasPatch.ok) throw new Error(canvasPatch.detail);
    const sequencePatch = await store.applySequencePatch(SEQUENCE_SRC, [{ type: "setTitle", title: "Renamed" }]);
    if (!sequencePatch.ok) throw new Error(sequencePatch.detail);
    // The frozen folder holds files with exactly the post-patch bytes, so the hash checks would pass.
    await write(`${FROZEN}/assets/canvases/c.canvas.json`, await readFile(join(kb, CANVAS_SRC)));
    await write(`${FROZEN}/assets/sequences/q.sequence.json`, await readFile(join(kb, SEQUENCE_SRC)));
    await aliasTwinAssets();
    const before = await frozenBytes();

    for (const patchId of [canvasPatch.patchId, sequencePatch.patchId]) {
      const undone = await store.undoPatch(patchId);
      expect(undone).toMatchObject({ ok: false, status: 403 });
      expect(getStoredPatch(patchId, kb)).toBeDefined();
    }
    expect(await frozenBytes()).toEqual(before);

    // Positive control: the real folder back, the same patches undo.
    await restoreTwinAssets();
    expect((await store.undoPatch(canvasPatch.patchId)).ok).toBe(true);
    expect((await store.undoPatch(sequencePatch.patchId)).ok).toBe(true);
    expect(JSON.parse(await readFile(join(kb, SEQUENCE_SRC), "utf8")).title).toBe("twin-sequence");
    expect(await frozenBytes()).toEqual(before);
  });

  test("sidecar undo: a write inverse and an unlink inverse are refused before any change; compound undo too", async () => {
    const store = await seed();
    const frozenNew = json(CANVAS("frozen-new", "notes/twin"));
    await write(`${FROZEN}/assets/canvases/new.canvas.json`, frozenNew);
    await write(`${FROZEN}/assets/canvases/c.canvas.json`, await readFile(join(kb, CANVAS_SRC)));
    // An allowed sidecar patch the compound also holds: it must stay untouched.
    await write("notes/plain/doc.json", DOC("plain"));
    await write("notes/plain/annotations.json", json({ schemaVersion: 1, annotations: [] }));
    const plainBytes = await readFile(join(kb, "notes/plain/annotations.json"), "utf8");
    recordSidecarPatch("allowed-member", [{ path: "notes/plain/annotations.json", beforeContent: "{}\n", hashAfterApply: createContentHash(plainBytes) }], kb);
    // Unlink inverse (the patch created the file) and write inverse, both through the alias.
    recordSidecarPatch("unlink-inverse", [{ path: "notes/twin/assets/canvases/new.canvas.json", beforeContent: null, hashAfterApply: createContentHash(frozenNew) }], kb);
    recordSidecarPatch("write-inverse", [{ path: CANVAS_SRC, beforeContent: "{}\n", hashAfterApply: createContentHash(await readFile(join(kb, CANVAS_SRC), "utf8")) }], kb);
    recordCompoundPatch("compound", ["allowed-member", "unlink-inverse"], kb);
    await aliasTwinAssets();
    const before = await frozenBytes();

    for (const patchId of ["unlink-inverse", "write-inverse", "compound"]) {
      const undone = await store.undoPatch(patchId);
      expect(undone).toMatchObject({ ok: false, status: 403 });
      expect(getStoredPatch(patchId, kb)).toBeDefined();
    }
    expect(await frozenBytes()).toEqual(before);
    // The compound's allowed member was not undone first.
    expect(await readFile(join(kb, "notes/plain/annotations.json"), "utf8")).toBe(plainBytes);
    expect(getStoredPatch("allowed-member", kb)).toBeDefined();
    // Positive control: the allowed member undoes on its own.
    expect((await store.undoPatch("allowed-member")).ok).toBe(true);
    expect(await readFile(join(kb, "notes/plain/annotations.json"), "utf8")).toBe("{}\n");
  });

  test("tree undo (create inverse) through an alias parent is refused before any change", async () => {
    await seed();
    await mkdir(join(kb, "notes/real-parent"), { recursive: true });
    const created = await createDocBundle(kb, "notes/real-parent/page", "Page");
    if (!created.ok) throw new Error(created.detail);
    // The parent becomes an alias into the frozen folder, which holds identical bytes.
    await write(`${FROZEN}/page/doc.json`, await readFile(join(kb, "notes/real-parent/page/doc.json")));
    await rename(join(kb, "notes/real-parent"), join(kb, "notes/real-parent-aside"));
    await symlink(join(kb, FROZEN), join(kb, "notes/real-parent"), "dir");
    const before = await frozenBytes();
    const replayed = await replayTreeOpInverse(kb, created.inverse);
    expect(replayed).toMatchObject({ ok: false, status: 403 });
    expect(await frozenBytes()).toEqual(before);
  });
});

describe("B7-2-02: a host serving KB/notes refuses an alias into the enclosing project's excluded sibling", () => {
  async function seed(): Promise<DocsStore> {
    await write("codecaine.docs.json", POLICY);
    await write("notes/twin/doc.json", DOC("twin"));
    await write("notes/real/doc.json", DOC("real"));
    await write(`${FROZEN}/doc.json`, DOC("frozen"));
    await write(`${FROZEN}/assets/images/existing.png`, PNG);
    await write(`${FROZEN}/assets/canvases/c.canvas.json`, json(CANVAS("frozen", "twin")));
    // notes/twin/assets leads into sessions/s1/outputs/inputs/p1/assets, a sibling of the served folder.
    await symlink(join(kb, FROZEN, "assets"), join(kb, "notes/twin/assets"), "dir");
    // A fresh store over the subfolder: no registration, only the KB's codecaine.docs.json on disk.
    return createDocsStore(join(kb, "notes"));
  }

  const file = (name: string, type: string) => ({
    name,
    type,
    size: PNG.length,
    arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) as ArrayBuffer,
  });

  test("uploads (missing and existing names), asset/Canvas reads and Canvas writes are refused; frozen bytes and entries unchanged", async () => {
    const store = await seed();
    const before = await frozenBytes();
    for (const name of ["added.png", "existing.png"]) {
      const uploaded = await store.uploadAsset({ bundlePath: "twin", file: file(name, "image/png") });
      expect(uploaded).toMatchObject({ ok: false, status: 403 });
    }
    expect(await store.uploadVideoAsset({ bundlePath: "twin", file: file("clip.mp4", "video/mp4") })).toMatchObject({ ok: false });
    expect((await store.readAsset("twin/assets/images/existing.png")).ok).toBe(false);
    expect((await store.canvasGet("twin/assets/canvases/c.canvas.json")).ok).toBe(false);
    expect((await store.saveCanvasSidecarBySrc({ src: "twin/assets/canvases/c.canvas.json", canvas: CANVAS("x", "twin") })).ok).toBe(false);
    expect((await store.createCanvasSidecar({ docPath: "twin/doc.json", src: "./assets/canvases/new.canvas.json", canvas: CANVAS("y", "twin") })).ok).toBe(false);
    expect((await store.applyCanvasPatch("twin/assets/canvases/c.canvas.json", [{ type: "updateObject", objectId: "obj-1", patch: { text: "Changed" } } as any])).ok).toBe(false);
    // Corpus management refuses a corpus with symbolic links outright; it never lists through one.
    const listed = (await store.assets()) as { ok: boolean; detail?: string; assets?: Array<{ path: string }> };
    if (listed.ok) expect(listed.assets!.map((asset) => asset.path).some((path) => path.startsWith("twin/"))).toBe(false);
    else expect(listed.detail).toContain("Symbolic link");
    expect(await frozenBytes()).toEqual(before);

    // Positive control: a real assets folder in the same host.
    const control = await store.uploadAsset({ bundlePath: "real", file: file("ok.png", "image/png") });
    expect(control.ok).toBe(true);
    expect(await readFile(join(kb, "notes/real/assets/images/ok.png"))).toEqual(PNG);
    expect(await frozenBytes()).toEqual(before);
  });
});

describe("B7-2-03: a docs page named tasks is a page; a Task record is a record", () => {
  async function seedTasksPage(withRecord = false) {
    await write("tasks/doc.json", DOC("tasks"));
    await write("tasks/annotations.json", json({ schemaVersion: 1, annotations: [] }));
    await write("tasks/proposals.json", json({ schemaVersion: 1, proposals: [] }));
    await write("tasks/assets/canvases/c.canvas.json", json(CANVAS("tasks-canvas", "tasks")));
    await write("tasks/assets/images/x.png", PNG);
    await write("notes/dest/doc.json", DOC("dest"));
    if (withRecord) await write("tasks/rotate-keys.json", '{"id":"task_1","kind":"human"}\n');
  }
  const docHash = async (path: string) => createHash("sha256").update(await readFile(join(kb, path, "doc.json"))).digest("hex");
  async function accept(store: DocsStore, treeOps: unknown[]) {
    const staged = await store.changesetStage({ summary: "tree", entries: [], treeOps: treeOps as any });
    if (!staged.ok) throw new Error(staged.detail);
    return store.changesetAccept(staged.changeset.id);
  }
  async function manage(store: DocsStore, input: Record<string, unknown>) {
    const preview = await store.manageFiles({ ...(input as any), expected_hash: await docHash("tasks"), preview: true });
    if (!preview.ok) return preview;
    return store.manageFiles({ ...(input as any), expected_hash: await docHash("tasks"), preview: false, expected_tree_hash: preview.tree_hash });
  }

  test("change-set delete-doc of the tasks page", async () => {
    await seedTasksPage();
    const accepted = await accept(createDocsStore(kb), [{ kind: "delete-doc", docPath: "tasks", position: 0 }]);
    expect(accepted.ok).toBe(true);
    expect(await readdir(kb)).not.toContain("tasks");
  });

  test("HTTP move of the tasks page", async () => {
    await seedTasksPage();
    const response = await createDocsRoutes(createDocsStore(kb)).handle(new Request("http://localhost/api/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromPath: "tasks", toPath: "archive/tasks" }),
    }));
    expect(response.status).toBe(200);
    expect(await readFile(join(kb, "archive/tasks/doc.json"), "utf8")).toBe(DOC("tasks"));
  });

  test("corpus management rename, move and delete of the tasks page", async () => {
    await seedTasksPage();
    const store = createDocsStore(kb);
    expect(await manage(store, { kind: "page", path: "tasks", to: "tasks-renamed" })).toMatchObject({ ok: true, applied: true });
    await rename(join(kb, "tasks-renamed"), join(kb, "tasks"));
    expect(await manage(store, { kind: "page", path: "tasks", to: "archive/tasks" })).toMatchObject({ ok: true, applied: true });
    await rename(join(kb, "archive/tasks"), join(kb, "tasks"));
    expect(await manage(store, { kind: "page", path: "tasks", recursive: true })).toMatchObject({ ok: true, applied: true });
    expect(await readdir(kb)).not.toContain("tasks");
  });

  test("merge of the tasks page deletes its emptied source", async () => {
    await seedTasksPage();
    const store = createDocsStore(kb);
    const staged = await mergeDocsChangeSet(kb, { sourceDocPath: "tasks", destDocPath: "notes/dest" });
    if (!staged.ok) throw new Error(staged.detail);
    expect((await store.changesetAccept(staged.changeset.id)).ok).toBe(true);
    expect(await readdir(kb)).not.toContain("tasks");
  });

  test("a genuine tasks/<slug>.json Task record refuses delete, move, rename and merge; nothing changes", async () => {
    await seedTasksPage(true);
    // A Task store below a Place page refuses too.
    await write("places/area/doc.json", DOC("area"));
    await write("places/area/tasks/plot-swatch.json", '{"id":"task_2"}\n');
    const store = createDocsStore(kb);
    const before = await bytesBelow("tasks");
    const placeBefore = await bytesBelow("places");
    for (const treeOps of [
      [{ kind: "delete-doc", docPath: "tasks", position: 0 }],
      [{ kind: "move-doc", from: "tasks", to: "archive/tasks", position: 0 }],
      [{ kind: "delete-doc", docPath: "places/area", position: 0 }],
    ]) {
      const accepted = await accept(store, treeOps);
      expect(accepted).toMatchObject({ ok: false, status: 409 });
    }
    for (const input of [
      { kind: "page", path: "tasks", to: "tasks-renamed" },
      { kind: "page", path: "tasks", to: "archive/tasks" },
      { kind: "page", path: "tasks", recursive: true },
    ]) {
      const result = await manage(store, input);
      expect(result).toMatchObject({ ok: false, status: 409 });
      expect((result as { records: string[] }).records).toEqual(["tasks/rotate-keys.json"]);
    }
    expect(await bytesBelow("tasks")).toEqual(before);
    expect(await bytesBelow("places")).toEqual(placeBefore);
    // Merge: staging records its proposals; the accept then refuses at the source's delete and rolls back.
    const merged = await mergeDocsChangeSet(kb, { sourceDocPath: "tasks", destDocPath: "notes/dest" });
    if (!merged.ok) throw new Error(merged.detail);
    const staged = await bytesBelow("tasks");
    expect(await store.changesetAccept(merged.changeset.id)).toMatchObject({ ok: false, status: 409 });
    const after = await bytesBelow("tasks");
    for (const path of Object.keys(staged).filter((path) => !path.endsWith("/proposals.json"))) expect(after[path]).toBe(staged[path]);
    expect(Object.keys(after).sort()).toEqual(Object.keys(staged).sort());
    expect(await readFile(join(kb, "tasks/rotate-keys.json"), "utf8")).toBe('{"id":"task_1","kind":"human"}\n');
  });
});
