import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openBacklinksDb, rescanAll } from "@codecaine-ai/docs-index/backlinks";
import { getBacklinksDb } from "../backlinks-cache";
import { applyDocOpsToBundle } from "../doc-ops";
import { manageFiles, restoreManagedFiles, type ManageFilesInput } from "../manage-files";
import { referenceCache } from "../reference-cache";

/**
 * After each tree operation, restore and rollback, the backlinks rows of every source it touched equal a rescan of
 * that source, a removed source has no rows, and an untouched source keeps the rows it had, even stale ones: the
 * operation never rescans the whole root.
 */

let root: string;
let db: Database;

const page = (id: string, blocks: Record<string, Record<string, unknown>> = {}) => JSON.stringify({
  schemaVersion: 1, id, title: id, root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: Object.keys(blocks) },
    ...Object.fromEntries(Object.entries(blocks).map(([id, block]) => [id, { id, children: [], props: {}, ...block }])),
  },
});
const link = (path: string) => ({ type: "paragraph", text: [{ insert: path, attributes: { reference: { kind: "doc", path } } }] });
const canvas = (target: string) => JSON.stringify({ schemaVersion: 1, id: "c", mode: "diagram", objects: [], connections: [], annotations: [], links: [{ id: "l", objectId: "o", target: { kind: "doc", path: target } }] });
const write = async (path: string, body: string) => {
  await mkdir(join(root, dirname(path)), { recursive: true });
  await writeFile(join(root, path), body);
};
const sha = async (path: string) => createHash("sha256").update(await readFile(join(root, path))).digest("hex");

/** A source's rows without their timestamps, in a stable order. */
const rows = (database: Database, source: string) =>
  database.query(`SELECT source_block_id, target_kind, target_path, target_symbol, target_line, target_section
    FROM backlinks WHERE source_path = ? ORDER BY source_block_id, target_path`).all(source);
const UNTOUCHED = ["bystander/doc.json", "stale/doc.json"];
const SUBTREE = ["doc.json", "child/doc.json", "assets/canvases/c.canvas.json"];
const under = (folder: string) => SUBTREE.map((p) => `${folder}/${p}`);

/** Every touched source matches a fresh rescan, every removed one has no rows, and the untouched ones did not move. */
async function expectRows(touched: string[], removed: string[], untouchedBefore: unknown[][]) {
  const fresh = await openBacklinksDb(":memory:");
  await rescanAll(root, fresh);
  for (const source of touched) {
    expect(rows(fresh, source).length).toBeGreaterThan(0);
    expect({ source, rows: rows(db, source) }).toEqual({ source, rows: rows(fresh, source) });
  }
  for (const source of removed) expect({ source, rows: rows(db, source) }).toEqual({ source, rows: [] });
  expect(UNTOUCHED.map((source) => rows(db, source))).toEqual(untouchedBefore);
}
const untouchedRows = () => UNTOUCHED.map((source) => rows(db, source));

async function operate(input: Omit<ManageFilesInput, "expected_hash">) {
  const source = input.kind === "asset" ? input.path : `${input.path}/doc.json`;
  const args = { ...input, expected_hash: await sha(source) };
  const preview = await manageFiles(root, args);
  expect(preview.ok).toBe(true);
  return manageFiles(root, { ...args, preview: false, expected_tree_hash: preview.tree_hash });
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "manage-files-backlinks-")));
  await write("page/doc.json", page("page", { out: link("bystander") }));
  await write("page/child/doc.json", page("child", { up: link("page") }));
  await write("page/assets/canvases/c.canvas.json", canvas("page/child"));
  await write("other/doc.json", page("other", { to: link("page/child") }));
  await write("bystander/doc.json", page("bystander", { to: link("other") }));
  await write("stale/doc.json", page("stale", { to: link("other") }));
  await write("late/doc.json", page("late", { p: { type: "paragraph", text: [{ insert: "nothing yet" }] } }));
  db = await getBacklinksDb(root);
  await rescanAll(root, db);
  // Changed behind the index's back: only a whole-root rescan would update its rows.
  await write("stale/doc.json", page("stale", { to: link("bystander") }));
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

test("a move reindexes the moved sources at both paths and the rewritten referrer", async () => {
  const before = untouchedRows();
  expect(await operate({ kind: "page", path: "page", to: "moved" })).toMatchObject({ ok: true, applied: true });
  await expectRows([...under("moved"), "other/doc.json"], under("page"), before);
  expect(rows(db, "other/doc.json")).toEqual([expect.objectContaining({ target_path: "moved/child" })]);
});

test("a rename reindexes the renamed sources at both paths and the rewritten referrer", async () => {
  const before = untouchedRows();
  expect(await operate({ kind: "page", path: "page", to: "renamed" })).toMatchObject({ ok: true, applied: true });
  await expectRows([...under("renamed"), "other/doc.json"], under("page"), before);
});

test("a delete removes the rows of every deleted source", async () => {
  await write("other/doc.json", page("other"));
  const before = untouchedRows();
  expect(await operate({ kind: "page", path: "page", recursive: true })).toMatchObject({ ok: true, applied: true });
  await expectRows([], under("page"), before);
});

test("a title change reindexes the page", async () => {
  const before = untouchedRows();
  expect(await operate({ kind: "title", path: "page", title: "New title" })).toMatchObject({ ok: true, applied: true });
  await expectRows(["page/doc.json"], [], before);
});

test("restoring a move reindexes the sources back at their old paths and drops the moved ones", async () => {
  const moved = await operate({ kind: "page", path: "page", to: "moved" });
  const before = untouchedRows();
  const preview = await restoreManagedFiles(root, moved.tree_change_id);
  expect(await restoreManagedFiles(root, moved.tree_change_id, false, preview.tree_hash)).toMatchObject({ ok: true, restored: true });
  await expectRows([...under("page"), "other/doc.json"], under("moved"), before);
});

test("a rolled-back move reindexes the sources back at their old paths and drops the moved ones", async () => {
  const before = untouchedRows();
  // The F2 post-check refusal: "late" gains a link to the page after the scan inside the locks.
  const cache = referenceCache(root), real = cache.lookup;
  let calls = 0;
  const args = { kind: "page" as const, path: "page", to: "moved", expected_hash: await sha("page/doc.json") };
  const preview = await manageFiles(root, args);
  cache.lookup = async () => {
    const result = await real();
    if (++calls === 2) await applyDocOpsToBundle(root, "late", [{ type: "updateBlock", blockId: "p", text: [{ insert: "l", attributes: { reference: { kind: "doc", path: "page" } } }] }], undefined);
    return result;
  };
  let result;
  try { result = await manageFiles(root, { ...args, preview: false, expected_tree_hash: preview.tree_hash }); } finally { cache.lookup = real; }
  expect(result).toMatchObject({ ok: false, status: 409, rolled_back: true, changed_paths: ["late/doc.json"] });
  await expectRows([...under("page"), "other/doc.json"], under("moved"), before);
});
