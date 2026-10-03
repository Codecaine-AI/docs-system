import { expect, test } from "bun:test";
import { applyOps, type DocBlock, type DocDocument } from "@codecaine-ai/docs-model";
import { restoreSpans, rewriteToOps } from "./index";

function block(id: string, type: DocBlock["type"], text: string, children: string[] = []): DocBlock {
  return { id, type, props: {}, text: [{ insert: text }], children };
}

const page: DocDocument = {
  schemaVersion: 1,
  id: "page",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["intro", "item", "note", "after"] },
    intro: block("intro", "paragraph", "Old intro; one; two."),
    item: block("item", "list-item", "Old item; one; two.", ["child"]),
    child: block("child", "list-item", "Existing child."),
    note: block("note", "callout", "Old note; one."),
    after: block("after", "paragraph", "After."),
  },
};

const listAnswer = restoreSpans("Lead.\n- One.\n  - One detail.\n- Two.", []).blocks;
const newId = (n: number) => `ste-${n}`;

/** The page as indented "id (type): text" lines, so a test reads the tree it built. */
function outline(doc: DocDocument, id = doc.root, depth = 0): string[] {
  const node = doc.blocks[id]!;
  const own = id === doc.root ? [] : [`${"  ".repeat(depth)}${id} (${node.type}): ${(node.text ?? []).map((s) => s.insert).join("")}`];
  return [...own, ...node.children.flatMap((child) => outline(doc, child, id === doc.root ? 0 : depth + 1))];
}

function apply(ops: ReturnType<typeof rewriteToOps>): DocDocument {
  const result = applyOps(page, ops);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.doc;
}

test("a paragraph with bullets keeps the lead and gains list items right after it", () => {
  expect(outline(apply(rewriteToOps(page, "intro", listAnswer, newId)))).toEqual([
    "intro (paragraph): Lead.",
    "ste-0 (list-item): One.",
    "  ste-1 (list-item): One detail.",
    "ste-2 (list-item): Two.",
    "item (list-item): Old item; one; two.",
    "  child (list-item): Existing child.",
    "note (callout): Old note; one.",
    "after (paragraph): After.",
  ]);
});

test("a list item with bullets gains child items before its existing children", () => {
  expect(outline(apply(rewriteToOps(page, "item", listAnswer, newId)))).toEqual([
    "intro (paragraph): Old intro; one; two.",
    "item (list-item): Lead.",
    "  ste-0 (list-item): One.",
    "    ste-1 (list-item): One detail.",
    "  ste-2 (list-item): Two.",
    "  child (list-item): Existing child.",
    "note (callout): Old note; one.",
    "after (paragraph): After.",
  ]);
});

test("a single block is one in-place update, and a callout refuses bullets", () => {
  const single = restoreSpans("New note. One.", []).blocks;
  const ops = rewriteToOps(page, "note", single, newId);

  expect(ops).toEqual([{ type: "updateBlock", blockId: "note", text: [{ insert: "New note. One." }] }]);
  expect(outline(apply(ops))).toContain("note (callout): New note. One.");
  expect(rewriteToOps(page, "note", listAnswer, newId)).toEqual([]);
});
