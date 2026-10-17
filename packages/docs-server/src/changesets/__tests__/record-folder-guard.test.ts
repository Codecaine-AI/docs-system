import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsRoutes } from "../../routes";
import { createDocsStore } from "../../store";
import { createDocBundle, replayTreeOpInverse } from "../tree-ops";

/**
 * B7-01: a knowledge-base folder may hold base-shapes record files (note.json
 * beside doc.json, a Place's entity.json, tasks/<slug>.json). Whole-folder
 * delete, move, rename and merge refuse before any change when the folder or
 * its subtree holds one; create undo refuses when anything the create did not
 * make is present; an allowed bundle deletion keeps durable recovery bytes.
 */

const NOTE_BYTES = '{\n  "id": "note-a",\n  "title": "A note"\n}\n';
const DOC = (id: string) => `${JSON.stringify({
  schemaVersion: 1,
  id,
  title: id,
  root: "root",
  blocks: { root: { id: "root", type: "paragraph", props: {}, children: [] } },
}, null, 2)}\n`;

let docsRoot: string;

beforeEach(async () => {
  docsRoot = await realpath(await mkdtemp(join(tmpdir(), "docs-record-guard-")));
});

afterEach(async () => {
  await rm(docsRoot, { recursive: true, force: true });
});

async function write(rel: string, bytes: string) {
  await mkdir(join(docsRoot, rel, ".."), { recursive: true });
  await writeFile(join(docsRoot, rel), bytes);
}

/** Every path in the corpus (dot folders included; folders end in "/") with the sha256 of each file. */
async function corpusBytes(dir = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (rel: string) => {
    for (const entry of await readdir(join(docsRoot, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else out[path] = createHash("sha256").update(await readFile(join(docsRoot, path))).digest("hex");
    }
  };
  await walk(dir);
  return out;
}

/** The record-bearing corpus every test starts from. */
async function seedRecords() {
  await write("notes/note-a/note.json", NOTE_BYTES);
  await write("notes/note-a/doc.json", DOC("note-a"));
  await write("places/area-a/entity.json", '{"id":"area-a"}\n');
  await write("places/area-a/doc.json", DOC("area-a"));
  // Records deeper in an allowed-looking bundle's subtree.
  await write("projects/alpha/doc.json", DOC("alpha"));
  await write("projects/alpha/tasks/plot-swatch-sheet.json", '{"id":"task-1"}\n');
  await write("library/topic/doc.json", DOC("topic"));
  await write("library/topic/sources/s1/source.json", '{"id":"src-1"}\n');
  // Positive control: a bundle without records.
  await write("notes/plain/doc.json", DOC("plain"));
}

const RECORD_BUNDLES = ["notes/note-a", "places/area-a", "projects/alpha", "library/topic"];

async function stageAndAccept(treeOps: unknown[]) {
  const store = createDocsStore(docsRoot);
  const staged = await store.changesetStage({ summary: "tree op", entries: [], treeOps: treeOps as any });
  if (!staged.ok) throw new Error(staged.detail);
  return { store, id: staged.changeset.id, accepted: await store.changesetAccept(staged.changeset.id) };
}

describe("whole-folder operations refuse a record-bearing bundle or subtree before any change", () => {
  test("change-set delete-doc (and so a merge, which deletes its emptied source)", async () => {
    await seedRecords();
    for (const docPath of RECORD_BUNDLES) {
      const before = await corpusBytes("notes");
      const placesBefore = await corpusBytes();
      const { accepted } = await stageAndAccept([{ kind: "delete-doc", docPath, position: 0 }]);
      expect(accepted).toMatchObject({ ok: false, status: 409 });
      expect((accepted as { detail: string }).detail).toContain("record files");
      expect(await corpusBytes("notes")).toEqual(before);
      // Nothing outside .changesets changed (the staged change-set record is the only addition).
      const after = await corpusBytes();
      for (const [path, hash] of Object.entries(placesBefore)) expect(after[path]).toBe(hash);
      expect(Object.keys(after).filter((path) => !(path in placesBefore) && !path.startsWith(".changesets/")))
        .toEqual([]);
    }
  });

  test("change-set move-doc and the HTTP move route", async () => {
    await seedRecords();
    const before = await corpusBytes();
    const app = createDocsRoutes(createDocsStore(docsRoot));
    for (const docPath of RECORD_BUNDLES) {
      const { accepted } = await stageAndAccept([{ kind: "move-doc", from: docPath, to: `moved/${docPath}`, position: 0 }]);
      expect(accepted).toMatchObject({ ok: false, status: 409 });
      const response = await app.handle(new Request("http://localhost/api/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromPath: docPath, toPath: `moved/${docPath}` }),
      }));
      expect(response.status).toBe(409);
    }
    const after = await corpusBytes();
    for (const [path, hash] of Object.entries(before)) expect(after[path]).toBe(hash);
    expect(Object.keys(after).some((path) => path.startsWith("moved"))).toBe(false);
  });

  test("corpus management move, rename and delete refuse at preview and write no journal", async () => {
    await seedRecords();
    const store = createDocsStore(docsRoot);
    const before = await corpusBytes();
    for (const path of RECORD_BUNDLES) {
      const hash = createHash("sha256").update(await readFile(join(docsRoot, path, "doc.json"))).digest("hex");
      for (const input of [
        { kind: "page" as const, path, to: `moved/${path}`, expected_hash: hash },
        { kind: "page" as const, path, to: `${path}-renamed`, expected_hash: hash },
        { kind: "page" as const, path, expected_hash: hash, recursive: true },
      ]) {
        for (const preview of [true, false]) {
          const result = await store.manageFiles({ ...input, preview, expected_tree_hash: "any" });
          expect(result).toMatchObject({ ok: false, status: 409 });
          expect((result as { records: string[] }).records.length).toBeGreaterThan(0);
        }
      }
    }
    expect(await corpusBytes()).toEqual(before);
  });

  test("positive control: a bundle without records still deletes and moves", async () => {
    await seedRecords();
    const moved = await stageAndAccept([{ kind: "move-doc", from: "notes/plain", to: "notes/plain-moved", position: 0 }]);
    expect(moved.accepted.ok).toBe(true);
    const deleted = await stageAndAccept([{ kind: "delete-doc", docPath: "notes/plain-moved", position: 0 }]);
    expect(deleted.accepted.ok).toBe(true);
    expect((await readdir(join(docsRoot, "notes"))).sort()).toEqual(["note-a"]);
    expect(await readFile(join(docsRoot, "notes/note-a/note.json"), "utf8")).toBe(NOTE_BYTES);
  });
});

describe("create undo refuses anything the create did not make", () => {
  test("a nested record added below a created bundle", async () => {
    const created = await createDocBundle(docsRoot, "library/new-topic", "New topic");
    if (!created.ok) throw new Error(created.detail);
    await write("library/new-topic/sources/s2/source.json", '{"id":"src-2"}\n');
    const before = await corpusBytes();
    const replayed = await replayTreeOpInverse(docsRoot, created.inverse);
    expect(replayed).toMatchObject({ ok: false, status: 409 });
    expect((replayed as { detail: string }).detail).toContain("library/new-topic/sources/");
    expect(await corpusBytes()).toEqual(before);
  });

  test("a doc.json edited since the create", async () => {
    await write("notes/note-b/note.json", NOTE_BYTES);
    const created = await createDocBundle(docsRoot, "notes/note-b", "Note B");
    if (!created.ok) throw new Error(created.detail);
    await write("notes/note-b/doc.json", DOC("edited"));
    const before = await corpusBytes();
    const replayed = await replayTreeOpInverse(docsRoot, created.inverse);
    expect(replayed).toMatchObject({ ok: false, status: 409 });
    expect((replayed as { detail: string }).detail).toContain("edited since the create");
    expect(await corpusBytes()).toEqual(before);
  });

  test("a sibling added inside a parent folder the create made", async () => {
    const created = await createDocBundle(docsRoot, "fresh/parent/page", "Fresh");
    if (!created.ok) throw new Error(created.detail);
    await write("fresh/parent/other/note.json", NOTE_BYTES);
    const before = await corpusBytes();
    const replayed = await replayTreeOpInverse(docsRoot, created.inverse);
    expect(replayed).toMatchObject({ ok: false, status: 409 });
    expect(await corpusBytes()).toEqual(before);
  });
});

describe("an allowed bundle deletion keeps durable recovery bytes", () => {
  test("the deleted folder lands in .changesets/tree-journal with a hash manifest; undo restores it and spends the journal", async () => {
    await seedRecords();
    const docBytes = await readFile(join(docsRoot, "notes/plain/doc.json"));
    const { store, id, accepted } = await stageAndAccept([{ kind: "delete-doc", docPath: "notes/plain", position: 0 }]);
    expect(accepted.ok).toBe(true);
    const journals = await readdir(join(docsRoot, ".changesets/tree-journal"));
    expect(journals).toHaveLength(1);
    const journal = join(docsRoot, ".changesets/tree-journal", journals[0]!);
    const manifest = JSON.parse(await readFile(join(journal, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ kind: "delete-doc", docPath: "notes/plain", status: "deleted" });
    expect(manifest.files).toEqual([{ path: "doc.json", sha256: createHash("sha256").update(docBytes).digest("hex") }]);
    expect(Buffer.compare(await readFile(join(journal, "deleted/doc.json")), docBytes)).toBe(0);

    const undone = await store.changesetUndo(id);
    expect(undone.ok).toBe(true);
    expect(Buffer.compare(await readFile(join(docsRoot, "notes/plain/doc.json")), docBytes)).toBe(0);
    expect(await readdir(join(docsRoot, ".changesets/tree-journal"))).toEqual([]);
  });

  test("the recovery bytes survive a process restart; the in-memory undo does not", async () => {
    await seedRecords();
    const docBytes = await readFile(join(docsRoot, "notes/plain/doc.json"));
    const storeModule = resolve(import.meta.dir, "../../store.ts");
    const script = join(docsRoot, "..", `record-guard-${Date.now()}.ts`);
    await writeFile(script, `
      import { createDocsStore } from ${JSON.stringify(storeModule)};
      const [root, mode, id] = process.argv.slice(2);
      const store = createDocsStore(root);
      if (mode === "delete") {
        const staged = await store.changesetStage({ summary: "delete", entries: [], treeOps: [{ kind: "delete-doc", docPath: "notes/plain", position: 0 }] });
        if (!staged.ok) throw new Error(staged.detail);
        const accepted = await store.changesetAccept(staged.changeset.id);
        console.log(JSON.stringify({ ok: accepted.ok, id: staged.changeset.id }));
      } else {
        const undone = await store.changesetUndo(id);
        console.log(JSON.stringify({ ok: undone.ok, status: undone.ok ? 200 : undone.status }));
      }
    `);
    try {
      const run = async (...args: string[]) => {
        const child = Bun.spawn([process.execPath, script, docsRoot, ...args], { stdout: "pipe", stderr: "pipe" });
        const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        if (code !== 0) throw new Error(stderr);
        return JSON.parse(stdout.trim().split("\n").at(-1)!);
      };
      const deleted = await run("delete");
      expect(deleted.ok).toBe(true);
      // A fresh process has no undo ledger: change-set undo reports 404 and changes nothing.
      const undone = await run("undo", deleted.id);
      expect(undone).toEqual({ ok: false, status: 404 });
      const [journal] = await readdir(join(docsRoot, ".changesets/tree-journal"));
      expect(Buffer.compare(await readFile(join(docsRoot, ".changesets/tree-journal", journal!, "deleted/doc.json")), docBytes)).toBe(0);
    } finally {
      await rm(script, { force: true });
    }
  });
});
