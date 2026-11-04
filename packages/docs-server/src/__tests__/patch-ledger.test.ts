import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { canvas_apply_patch, doc_update_blocks, undo_patch } from "../agent-tools";
import { deleteStoredPatch, getStoredPatch, ledgerStats, MAX_PATCHES_PER_ROOT, recordCompoundPatch, recordDocPatch, type LedgerStats } from "../patch-ledger";
import { ledgerStats as exportedLedgerStats } from "../index";

// The ledger is process-wide, so other tests' entries are present: assert before/after deltas only.
const SAMPLE_DOC = {
  schemaVersion: 1,
  id: "sample",
  title: "Sample",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["h1"] },
    h1: { id: "h1", type: "heading", props: { level: 1 }, text: [{ insert: "Title" }], children: [] },
  },
};
const SAMPLE_CANVAS = {
  schemaVersion: 1,
  id: "canvas-1",
  mode: "diagram",
  objects: [{ id: "obj-1", type: "process", text: "Step one", geometry: { x: 0, y: 0, width: 100, height: 60 } }],
  connections: [],
};
const canvasPath = "guide/assets/canvases/flow.canvas.json";

function delta(before: LedgerStats, after: LedgerStats) {
  return {
    entries: after.entries - before.entries,
    ...Object.fromEntries(Object.keys(before.byKind).map((kind) => [kind, after.byKind[kind as keyof LedgerStats["byKind"]] - before.byKind[kind as keyof LedgerStats["byKind"]]])),
  };
}

let docsRoot: string;
beforeEach(async () => {
  docsRoot = await mkdtemp(join(tmpdir(), "docs-patch-ledger-"));
  await mkdir(join(docsRoot, "guide", "assets", "canvases"), { recursive: true });
  await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(SAMPLE_DOC), "utf8");
  await writeFile(join(docsRoot, canvasPath), JSON.stringify(SAMPLE_CANVAS), "utf8");
});
afterEach(async () => {
  await rm(docsRoot, { recursive: true, force: true });
});

const insertParagraph = (blockId: string) =>
  doc_update_blocks(
    docsRoot,
    "guide",
    [{ type: "insertBlock", blockId, parentId: "root", index: 0, blockType: "paragraph", props: {}, text: [{ insert: "New" }] }],
    undefined,
    "ledger-test",
  );
const addObject = (id: string) =>
  canvas_apply_patch(
    docsRoot,
    canvasPath,
    [{ type: "addObject", object: { id, type: "process", text: id, geometry: { x: 200, y: 0, width: 100, height: 60 } } }],
    undefined,
    "ledger-test",
  );

test("ledgerStats is exported from the package entry", () => {
  expect(exportedLedgerStats).toBe(ledgerStats);
});

test("ledgerStats counts doc, canvas and compound records per kind", async () => {
  const before = ledgerStats();
  const doc = await insertParagraph("p1");
  const canvas = await addObject("obj-2");
  expect(doc.ok && canvas.ok).toBe(true);
  if (!doc.ok || !canvas.ok) return;
  recordCompoundPatch("ledger-test-compound", [doc.patchId, canvas.patchId], docsRoot);
  const after = ledgerStats();
  expect(delta(before, after)).toEqual({ entries: 3, doc: 1, canvas: 1, sequence: 0, tree: 0, sidecars: 0, compound: 1 });
  expect(after.oldestAt).not.toBeNull();
  expect(after.oldestAt! <= new Date().toISOString()).toBe(true);
  deleteStoredPatch("ledger-test-compound", docsRoot);
  expect(delta(before, ledgerStats())).toEqual({ entries: 2, doc: 1, canvas: 1, sequence: 0, tree: 0, sidecars: 0, compound: 0 });
});

test("doc undo leaves the doc count unchanged; canvas undo removes one canvas entry", async () => {
  const doc = await insertParagraph("p2");
  const canvas = await addObject("obj-3");
  expect(doc.ok && canvas.ok).toBe(true);
  if (!doc.ok || !canvas.ok) return;

  const beforeDocUndo = ledgerStats();
  expect((await undo_patch(docsRoot, doc.patchId)).ok).toBe(true);
  // Doc undo replays the inverse through applyDocOpsToBundle, which records a new inverse before the old one is deleted.
  expect(delta(beforeDocUndo, ledgerStats())).toEqual({ entries: 0, doc: 0, canvas: 0, sequence: 0, tree: 0, sidecars: 0, compound: 0 });

  const beforeCanvasUndo = ledgerStats();
  expect((await undo_patch(docsRoot, canvas.patchId)).ok).toBe(true);
  expect(delta(beforeCanvasUndo, ledgerStats())).toEqual({ entries: -1, doc: 0, canvas: -1, sequence: 0, tree: 0, sidecars: 0, compound: 0 });
});

test("a root keeps its newest MAX_PATCHES_PER_ROOT patches, drops the oldest first, and undo of a dropped patch says so", async () => {
  const otherRoot = await mkdtemp(join(tmpdir(), "docs-patch-ledger-other-"));
  try {
    const before = ledgerStats();
    for (let i = 0; i <= MAX_PATCHES_PER_ROOT; i++) recordDocPatch(`cap-${i}`, "guide", [], "hash", docsRoot);
    // The other root counts on its own: its one patch stays while this root is full.
    recordDocPatch("other-0", "guide", [], "hash", otherRoot);
    recordDocPatch(`cap-${MAX_PATCHES_PER_ROOT + 1}`, "guide", [], "hash", docsRoot);

    expect(getStoredPatch("cap-0", docsRoot)).toBeUndefined();
    expect(getStoredPatch("cap-1", docsRoot)).toBeUndefined();
    expect(getStoredPatch("cap-2", docsRoot)).toBeDefined();
    expect(getStoredPatch(`cap-${MAX_PATCHES_PER_ROOT + 1}`, docsRoot)).toBeDefined();
    expect(getStoredPatch("other-0", otherRoot)).toBeDefined();
    const after = ledgerStats();
    expect(after.entries - before.entries).toBe(MAX_PATCHES_PER_ROOT + 1);
    expect(after.dropped - before.dropped).toBe(2);
    expect(after.maxPerRoot).toBe(MAX_PATCHES_PER_ROOT);

    expect(await undo_patch(docsRoot, "cap-0")).toEqual({ ok: false, status: 404, detail: `Patch cap-0 is no longer in the ledger: it keeps the newest ${MAX_PATCHES_PER_ROOT} patches per docs root.` });
    expect(await undo_patch(docsRoot, "never-recorded")).toEqual({ ok: false, status: 404, detail: "No undoable patch found for id: never-recorded" });

    // A consumed undo frees a slot: the next record drops nothing.
    deleteStoredPatch("cap-2", docsRoot);
    recordDocPatch("cap-after-undo", "guide", [], "hash", docsRoot);
    expect(ledgerStats().dropped - before.dropped).toBe(2);
    expect(getStoredPatch("cap-3", docsRoot)).toBeDefined();
  } finally {
    await rm(otherRoot, { recursive: true, force: true });
  }
});

test("undo of a compound whose members fill the root restores every member and consumes the compound", async () => {
  const memberIds: string[] = [];
  for (let i = 0; i < MAX_PATCHES_PER_ROOT - 1; i++) {
    const applied = await insertParagraph(`fill-${i}`);
    if (!applied.ok) throw new Error(applied.detail);
    memberIds.push(applied.patchId);
  }
  recordCompoundPatch("full-root-compound", memberIds, docsRoot);

  // Each member undo records its own inverse: the full root must not drop a member still to undo.
  const undone = await undo_patch(docsRoot, "full-root-compound");
  expect(undone).toEqual({ ok: true, kind: "compound", undonePatchIds: [...memberIds].reverse() });
  expect(JSON.parse(await readFile(join(docsRoot, "guide", "doc.json"), "utf8")).blocks.root.children).toEqual(["h1"]);
  expect(getStoredPatch("full-root-compound", docsRoot)).toBeUndefined();
  expect(memberIds.some((id) => getStoredPatch(id, docsRoot))).toBe(false);
});

test("the ledger drops a compound with its members as one unit, and undo of it says so before touching any file", async () => {
  const member = await insertParagraph("unit-member");
  if (!member.ok) throw new Error(member.detail);
  recordCompoundPatch("unit-compound", [member.patchId], docsRoot);
  const docBefore = await readFile(join(docsRoot, "guide", "doc.json"), "utf8");
  const before = ledgerStats();
  for (let i = 0; i < MAX_PATCHES_PER_ROOT - 2; i++) recordDocPatch(`unit-fill-${i}`, "guide", [], "hash", docsRoot);
  // One more drops the oldest unit: the member and its compound together, never the member alone.
  expect(getStoredPatch(member.patchId, docsRoot)).toBeDefined();
  recordDocPatch("unit-overflow", "guide", [], "hash", docsRoot);
  expect(getStoredPatch(member.patchId, docsRoot)).toBeUndefined();
  expect(getStoredPatch("unit-compound", docsRoot)).toBeUndefined();
  expect(getStoredPatch("unit-fill-0", docsRoot)).toBeDefined();
  expect(ledgerStats().dropped - before.dropped).toBe(2);

  expect(await undo_patch(docsRoot, "unit-compound")).toMatchObject({ ok: false, status: 404, detail: expect.stringContaining("is no longer in the ledger") });
  expect(await readFile(join(docsRoot, "guide", "doc.json"), "utf8")).toBe(docBefore);
});

test("a compound undo that fails part way keeps the compound and the members not undone", async () => {
  await mkdir(join(docsRoot, "other"), { recursive: true });
  await writeFile(join(docsRoot, "other", "doc.json"), JSON.stringify({ ...SAMPLE_DOC, id: "other" }), "utf8");
  const older = await insertParagraph("part-older");
  const newer = await doc_update_blocks(docsRoot, "other", [{ type: "insertBlock", blockId: "part-newer", parentId: "root", index: 0, blockType: "paragraph", props: {}, text: [{ insert: "New" }] }], undefined, "ledger-test");
  if (!older.ok || !newer.ok) throw new Error("apply failed");
  recordCompoundPatch("part-compound", [older.patchId, newer.patchId], docsRoot);
  // The older member's document changes outside the ledger, so its undo is refused.
  await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(SAMPLE_DOC), "utf8");

  const undone = await undo_patch(docsRoot, "part-compound");
  expect(undone).toMatchObject({ ok: false, status: 409, failedPatchId: older.patchId, undonePatchIds: [newer.patchId] });
  expect(getStoredPatch("part-compound", docsRoot)).toBeDefined();
  expect(getStoredPatch(older.patchId, docsRoot)).toBeDefined();
  expect(getStoredPatch(newer.patchId, docsRoot)).toBeUndefined();
});
