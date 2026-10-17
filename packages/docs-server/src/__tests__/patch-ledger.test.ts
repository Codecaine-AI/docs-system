import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { canvas_apply_patch, doc_update_blocks, undo_patch } from "../agent-tools";
import { deleteStoredPatch, ledgerStats, recordCompoundPatch, type LedgerStats } from "../patch-ledger";
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
