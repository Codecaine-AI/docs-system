import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsStore } from "../../store";
import { createDocBundle, replayTreeOpInverse } from "../tree-ops";

/**
 * create-doc beside a base-shapes record file (note.json, entity.json, ...):
 * the create succeeds, and neither the create nor its undo rewrites or
 * removes the record file.
 */

const NOTE_BYTES = '{\n  "id": "note-a",\n  "title": "A note"\n}\n';

let docsRoot: string;

beforeEach(async () => {
  docsRoot = await realpath(await mkdtemp(join(tmpdir(), "docs-beside-record-")));
});

afterEach(async () => {
  await rm(docsRoot, { recursive: true, force: true });
});

async function writeRecord(folder: string, name = "note.json", bytes = NOTE_BYTES) {
  await mkdir(join(docsRoot, folder), { recursive: true });
  await writeFile(join(docsRoot, folder, name), bytes);
}

/** Every path below `rel` (folders end in "/") with the sha256 of each file's bytes. */
async function treeBytes(rel: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    let entries;
    try { entries = await readdir(join(docsRoot, dir), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else out[path] = createHash("sha256").update(await readFile(join(docsRoot, path))).digest("hex");
    }
  };
  await walk(rel);
  return out;
}

/** docs_create's route: stage a create-doc change-set and accept it. */
async function createThroughChangeSet(docPath: string) {
  const store = createDocsStore(docsRoot);
  const staged = await store.changesetStage({
    summary: `Create ${docPath}`,
    entries: [],
    treeOps: [{ kind: "create-doc", docPath, title: "Created", position: 0 }],
  });
  if (!staged.ok) throw new Error(staged.detail);
  const accepted = await store.changesetAccept(staged.changeset.id);
  return { store, id: staged.changeset.id, accepted };
}

describe("create-doc beside a record file", () => {
  test("creates the doc and leaves note.json byte-identical", async () => {
    await writeRecord("notes/note-a");
    const { accepted } = await createThroughChangeSet("notes/note-a");
    expect(accepted.ok).toBe(true);
    expect(JSON.parse(await readFile(join(docsRoot, "notes/note-a/doc.json"), "utf8")))
      .toMatchObject({ title: "Created", root: "root" });
    expect(await readFile(join(docsRoot, "notes/note-a/note.json"), "utf8")).toBe(NOTE_BYTES);
  });

  test("accepts every base-shapes record file name", async () => {
    for (const name of ["entity.json", "session.json", "project.json", "source.json", "reference.json", "note.json", "task.json"]) {
      const folder = `records/${name.replace(".json", "")}`;
      await writeRecord(folder, name);
      const created = await createDocBundle(docsRoot, folder, "Created");
      expect(created.ok).toBe(true);
      expect(await readFile(join(docsRoot, folder, name), "utf8")).toBe(NOTE_BYTES);
    }
  });

  test("change-set undo removes the doc and leaves note.json byte-identical", async () => {
    await writeRecord("notes/note-a");
    const { store, id, accepted } = await createThroughChangeSet("notes/note-a");
    expect(accepted.ok).toBe(true);

    const undone = await store.changesetUndo(id);
    expect(undone.ok).toBe(true);
    expect((await readdir(join(docsRoot, "notes/note-a"))).sort()).toEqual(["note.json"]);
    expect(await readFile(join(docsRoot, "notes/note-a/note.json"), "utf8")).toBe(NOTE_BYTES);
  });

  test("change-set undo refuses before any change once the folder gained an annotation", async () => {
    await writeRecord("notes/note-a");
    const { store, id, accepted } = await createThroughChangeSet("notes/note-a");
    expect(accepted.ok).toBe(true);
    const annotations = '{"annotations":[]}\n';
    await writeFile(join(docsRoot, "notes/note-a/annotations.json"), annotations);
    const before = await treeBytes("notes/note-a");

    const undone = await store.changesetUndo(id);
    expect(undone).toMatchObject({ ok: false, status: 409 });
    expect((undone as { detail: string }).detail).toContain("notes/note-a/annotations.json");
    expect(await treeBytes("notes/note-a")).toEqual(before);
  });

  test("undo never rewrites a record file edited after the create", async () => {
    await writeRecord("places/area-a", "entity.json");
    const created = await createDocBundle(docsRoot, "places/area-a", "Area A");
    if (!created.ok) throw new Error(created.detail);
    const edited = '{"id":"area-a","title":"Edited after create"}\n';
    await writeFile(join(docsRoot, "places/area-a/entity.json"), edited);

    const replayed = await replayTreeOpInverse(docsRoot, created.inverse);
    expect(replayed.ok).toBe(true);
    expect((await readdir(join(docsRoot, "places/area-a"))).sort()).toEqual(["entity.json"]);
    expect(await readFile(join(docsRoot, "places/area-a/entity.json"), "utf8")).toBe(edited);
  });

  test("undo of a create in a new folder refuses once a record file was written there", async () => {
    const created = await createDocBundle(docsRoot, "notes/fresh/note-b", "Fresh");
    if (!created.ok) throw new Error(created.detail);
    expect(created.inverse.directoryExisted).toBe(false);
    await writeFile(join(docsRoot, "notes/fresh/note-b/note.json"), NOTE_BYTES);
    const before = await treeBytes("notes");

    const replayed = await replayTreeOpInverse(docsRoot, created.inverse);
    expect(replayed).toMatchObject({ ok: false, status: 409 });
    expect(await treeBytes("notes")).toEqual(before);
    expect(await readFile(join(docsRoot, "notes/fresh/note-b/note.json"), "utf8")).toBe(NOTE_BYTES);
  });

  test("undo of a create in a new folder still removes the folder and its new parents", async () => {
    const created = await createDocBundle(docsRoot, "fresh/parent/page", "Fresh");
    if (!created.ok) throw new Error(created.detail);
    const replayed = await replayTreeOpInverse(docsRoot, created.inverse);
    expect(replayed.ok).toBe(true);
    expect(await readdir(docsRoot)).toEqual([]);
  });

  test("pending proposals beside the record file are restored by undo", async () => {
    await writeRecord("notes/note-a");
    const proposals = '{"proposals":[]}\n';
    await writeFile(join(docsRoot, "notes/note-a/proposals.json"), proposals);
    const created = await createDocBundle(docsRoot, "notes/note-a", "Created");
    if (!created.ok) throw new Error(created.detail);
    expect(created.inverse.files.map((file) => file.relativePath)).toEqual(["proposals.json"]);
    await writeFile(join(docsRoot, "notes/note-a/proposals.json"), '{"proposals":["changed"]}\n');

    const replayed = await replayTreeOpInverse(docsRoot, created.inverse);
    expect(replayed.ok).toBe(true);
    expect((await readdir(join(docsRoot, "notes/note-a"))).sort()).toEqual(["note.json", "proposals.json"]);
    expect(await readFile(join(docsRoot, "notes/note-a/proposals.json"), "utf8")).toBe(proposals);
    expect(await readFile(join(docsRoot, "notes/note-a/note.json"), "utf8")).toBe(NOTE_BYTES);
  });

  test("any other file in the folder still returns 409", async () => {
    await writeRecord("notes/note-a");
    await writeFile(join(docsRoot, "notes/note-a/foo.txt"), "other\n");
    const created = await createDocBundle(docsRoot, "notes/note-a", "Created");
    expect(created).toMatchObject({ ok: false, status: 409 });
    expect((await readdir(join(docsRoot, "notes/note-a"))).sort()).toEqual(["foo.txt", "note.json"]);
  });

  test("a folder with only foo.txt returns 409", async () => {
    await mkdir(join(docsRoot, "plain"), { recursive: true });
    await writeFile(join(docsRoot, "plain/foo.txt"), "other\n");
    expect(await createDocBundle(docsRoot, "plain", "Created")).toMatchObject({ ok: false, status: 409 });
  });

  test("a directory named like a record file returns 409", async () => {
    await mkdir(join(docsRoot, "notes/note-c/note.json"), { recursive: true });
    expect(await createDocBundle(docsRoot, "notes/note-c", "Created")).toMatchObject({ ok: false, status: 409 });
  });

  test("an existing doc.json beside a record file still returns 409", async () => {
    await writeRecord("notes/note-a");
    const first = await createDocBundle(docsRoot, "notes/note-a", "Created");
    expect(first.ok).toBe(true);
    expect(await createDocBundle(docsRoot, "notes/note-a", "Again")).toMatchObject({ ok: false, status: 409 });
  });
});
