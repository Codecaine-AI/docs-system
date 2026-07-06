import { describe, expect, it } from "bun:test";
import sampleDoc from "@codecaine-ai/docs-model/fixtures/sample.doc.json";
import { validateDocDocument, type DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { applyOps } from "@codecaine-ai/docs-model/doc-ops";
import { docToPM, pmToDoc, diffToOps, type PMNode } from "../convert";

function loadFixture(): DocDocument {
  const result = validateDocDocument(sampleDoc);
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.document;
}

/** Deterministic id factory for tests — never collides within a single run. */
function makeIdFactory(prefix: string) {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

describe("convert: docToPM / pmToDoc round-trip", () => {
  it("round-trips the full 20-flavour fixture losslessly", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const back = pmToDoc(pm, doc, makeIdFactory("fresh"));

    // Same set of block ids, same tree shape, same content.
    expect(Object.keys(back.blocks).sort()).toEqual(Object.keys(doc.blocks).sort());
    for (const id of Object.keys(doc.blocks)) {
      expect(back.blocks[id]).toEqual(doc.blocks[id]);
    }
    expect(back.root).toBe(doc.root);
    expect(back.id).toBe(doc.id);
    expect(back.title).toBe(doc.title);
  });

  it("preserves every mark (bold/italic/strike/code/link) and the reference span exactly", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const back = pmToDoc(pm, doc, makeIdFactory("fresh"));
    expect(back.blocks["p-intro"].text).toEqual(doc.blocks["p-intro"].text);
  });

  it("preserves heading level, list-item nesting, and code language", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const back = pmToDoc(pm, doc, makeIdFactory("fresh"));
    expect(back.blocks.h1.props).toEqual({ level: 1 });
    expect(back.blocks["h2-structure"].props).toEqual({ level: 2 });
    expect(back.blocks["li-a"].children).toEqual(["li-a-1"]);
    expect(back.blocks["code-1"].props).toEqual({ language: "typescript" });
  });

  it("preserves atom flavour props verbatim (canvas/image/attachment/file-tree/agent-contract)", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const back = pmToDoc(pm, doc, makeIdFactory("fresh"));
    for (const id of ["canvas-1", "image-1", "attach-1", "tree-1", "contract-1"]) {
      expect(back.blocks[id]).toEqual(doc.blocks[id]);
    }
  });

  it("preserves every block id through the round trip (§8.3)", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const back = pmToDoc(pm, doc, makeIdFactory("fresh"));
    for (const id of Object.keys(doc.blocks)) {
      expect(back.blocks[id]?.id).toBe(id);
    }
  });

  it("mints a fresh id for a PM node with no blockId attr (freshly inserted block)", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const freshNode: PMNode = {
      type: "docParagraph",
      content: [{ type: "docBlockText", content: [{ type: "text", text: "Brand new" }] }],
    };
    (pm.content as PMNode[]).push(freshNode);
    const back = pmToDoc(pm, doc, makeIdFactory("fresh"));
    const newIds = Object.keys(back.blocks).filter((id) => !(id in doc.blocks));
    expect(newIds).toHaveLength(1);
    expect(back.blocks[newIds[0]].text).toEqual([{ insert: "Brand new" }]);
  });
});

describe("diffToOps", () => {
  it("editing one paragraph's text produces exactly one updateBlock for that block", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const h1 = (pm.content as PMNode[]).find((n) => n.attrs?.blockId === "h1")!;
    h1.content = [
      { type: "docBlockText", content: [{ type: "text", text: "Docs Model Sample (edited)" }] },
    ];
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));

    const ops = diffToOps(doc, edited);
    expect(ops).toEqual([
      { type: "updateBlock", blockId: "h1", text: [{ insert: "Docs Model Sample (edited)" }] },
    ]);
  });

  it("no-op edit (round trip with no changes) produces zero ops", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));
    expect(diffToOps(doc, edited)).toEqual([]);
  });

  it("adding a new block produces exactly one insertBlock with the right parent/index", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const rootContent = pm.content as PMNode[];
    const insertAt = rootContent.findIndex((n) => n.attrs?.blockId === "divider-1");
    const freshNode: PMNode = {
      type: "docParagraph",
      content: [{ type: "docBlockText", content: [{ type: "text", text: "Inserted paragraph" }] }],
    };
    rootContent.splice(insertAt, 0, freshNode);
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));

    const ops = diffToOps(doc, edited);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("insertBlock");
    if (ops[0].type === "insertBlock") {
      expect(ops[0].parentId).toBe(doc.root);
      expect(ops[0].index).toBe(insertAt);
      expect(ops[0].flavour).toBe("paragraph");
      expect(ops[0].text).toEqual([{ insert: "Inserted paragraph" }]);
    }
  });

  it("deleting a block produces exactly one deleteBlock", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const rootContent = pm.content as PMNode[];
    const idx = rootContent.findIndex((n) => n.attrs?.blockId === "quote-1");
    rootContent.splice(idx, 1);
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));

    const ops = diffToOps(doc, edited);
    expect(ops).toEqual([{ type: "deleteBlock", blockId: "quote-1", mode: "subtree" }]);
  });

  it("reordering siblings produces moveBlock ops for the displaced blocks", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const rootContent = pm.content as PMNode[];
    const liAIdx = rootContent.findIndex((n) => n.attrs?.blockId === "li-a");
    const [liA] = rootContent.splice(liAIdx, 1);
    const liBIdx = rootContent.findIndex((n) => n.attrs?.blockId === "li-b");
    rootContent.splice(liBIdx + 1, 0, liA);
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));

    const ops = diffToOps(doc, edited);
    const moveOps = ops.filter((op) => op.type === "moveBlock");
    expect(moveOps.length).toBeGreaterThan(0);
    expect(moveOps.some((op) => op.type === "moveBlock" && op.blockId === "li-a")).toBe(true);
  });

  it("mixed batch: one edit, one insert, one delete in a single diff", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const rootContent = pm.content as PMNode[];

    // Edit h1's text.
    const h1 = rootContent.find((n) => n.attrs?.blockId === "h1")!;
    h1.content = [{ type: "docBlockText", content: [{ type: "text", text: "Edited heading" }] }];

    // Delete quote-1.
    const quoteIdx = rootContent.findIndex((n) => n.attrs?.blockId === "quote-1");
    rootContent.splice(quoteIdx, 1);

    // Insert a new paragraph at the end.
    rootContent.push({
      type: "docParagraph",
      content: [{ type: "docBlockText", content: [{ type: "text", text: "New tail" }] }],
    });

    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));
    const ops = diffToOps(doc, edited);

    expect(ops.some((op) => op.type === "deleteBlock" && op.blockId === "quote-1")).toBe(true);
    expect(
      ops.some(
        (op) =>
          op.type === "updateBlock" &&
          op.blockId === "h1" &&
          JSON.stringify(op.text) === JSON.stringify([{ insert: "Edited heading" }]),
      ),
    ).toBe(true);
    expect(
      ops.some(
        (op) => op.type === "insertBlock" && op.flavour === "paragraph" && op.blockId.startsWith("fresh-"),
      ),
    ).toBe(true);
  });

  it("changing a prop (e.g. callout tone) produces exactly one updateBlock with a minimal patch", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const rootContent = pm.content as PMNode[];
    const callout = rootContent.find((n) => n.attrs?.blockId === "callout-1")!;
    (callout.attrs!.blockProps as Record<string, unknown>).tone = "warning";
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));

    const ops = diffToOps(doc, edited);
    expect(ops).toEqual([
      { type: "updateBlock", blockId: "callout-1", props: { tone: "warning" } },
    ]);
  });

  it("Enter-split duplicating a blockId attr: head keeps the id, tail mints fresh, exactly one insertBlock", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const rootContent = pm.content as PMNode[];
    const idx = rootContent.findIndex((n) => n.attrs?.blockId === "quote-1");
    const original = rootContent[idx];
    // PM's Enter-split copies the node's attrs onto the new node, so BOTH
    // halves briefly carry the same blockId attr — pmToDoc must keep the id
    // on the FIRST (head) occurrence and mint fresh for the tail.
    const head: PMNode = {
      type: "docQuote",
      attrs: { ...original.attrs },
      content: [{ type: "docBlockText", content: [{ type: "text", text: "Stable ids are" }] }],
    };
    const tail: PMNode = {
      type: "docQuote",
      attrs: { ...original.attrs },
      content: [
        { type: "docBlockText", content: [{ type: "text", text: " a system invariant." }] },
      ],
    };
    rootContent.splice(idx, 1, head, tail);
    const edited = pmToDoc(pm, doc, makeIdFactory("split"));

    expect(edited.blocks["quote-1"].text).toEqual([{ insert: "Stable ids are" }]);
    const freshIds = Object.keys(edited.blocks).filter((id) => !(id in doc.blocks));
    expect(freshIds).toEqual(["split-1"]);
    expect(edited.blocks["split-1"].text).toEqual([{ insert: " a system invariant." }]);

    const ops = diffToOps(doc, edited);
    const inserts = ops.filter((op) => op.type === "insertBlock");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].type === "insertBlock" && inserts[0].blockId).toBe("split-1");
    expect(ops.filter((op) => op.type === "deleteBlock")).toHaveLength(0);

    const applied = applyOps(doc, ops);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.doc.blocks).toEqual(edited.blocks);
  });

  it("paste-duplicating an existing block: original keeps its id, the copy mints fresh", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const rootContent = pm.content as PMNode[];
    const original = rootContent.find((n) => n.attrs?.blockId === "quote-1")!;
    // Paste inserts an exact structural copy INCLUDING the blockId attr.
    rootContent.push(JSON.parse(JSON.stringify(original)) as PMNode);
    const edited = pmToDoc(pm, doc, makeIdFactory("paste"));

    // The original (first in document order) is untouched; the copy is fresh.
    expect(edited.blocks["quote-1"]).toEqual(doc.blocks["quote-1"]);
    const ops = diffToOps(doc, edited);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("insertBlock");
    if (ops[0].type === "insertBlock") {
      expect(ops[0].blockId).toBe("paste-1");
      expect(ops[0].parentId).toBe(doc.root);
      expect(ops[0].text).toEqual(doc.blocks["quote-1"].text);
    }

    const applied = applyOps(doc, ops);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.doc.blocks).toEqual(edited.blocks);
  });

  it("flavour change on a surviving id emits deleteBlock + fresh-id insertBlock, never a silent props-only update (§8.3)", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));
    // Simulate a (hypothetical) flavour-preserving "turn into": same id,
    // different flavour. updateBlock has no flavour field, so a props-only
    // update would silently drop this.
    edited.blocks["quote-1"] = { ...edited.blocks["quote-1"], flavour: "callout" };

    const quoteIndex = doc.blocks[doc.root].children.indexOf("quote-1");
    const ops = diffToOps(doc, edited, makeIdFactory("fl"));
    expect(ops).toEqual([
      { type: "deleteBlock", blockId: "quote-1", mode: "subtree" },
      {
        type: "insertBlock",
        blockId: "fl-1",
        parentId: doc.root,
        index: quoteIndex,
        flavour: "callout",
        props: {},
        text: [{ insert: "Stable ids are a system invariant." }],
      },
    ]);

    const applied = applyOps(doc, ops);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.doc.blocks["quote-1"]).toBeUndefined();
      expect(applied.doc.blocks["fl-1"].flavour).toBe("callout");
      expect(applied.doc.blocks[applied.doc.root].children[quoteIndex]).toBe("fl-1");
    }
  });

  it("flavour change on a block WITH children re-inserts the whole surviving subtree fresh", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));
    edited.blocks["li-a"] = { ...edited.blocks["li-a"], flavour: "paragraph" };

    const liAIndex = doc.blocks[doc.root].children.indexOf("li-a");
    const ops = diffToOps(doc, edited, makeIdFactory("fl"));
    // One subtree delete covers li-a-1 too; both replacement blocks are
    // inserted fresh, parent before child.
    expect(ops).toEqual([
      { type: "deleteBlock", blockId: "li-a", mode: "subtree" },
      {
        type: "insertBlock",
        blockId: "fl-1",
        parentId: doc.root,
        index: liAIndex,
        flavour: "paragraph",
        props: {},
        text: [{ insert: "First item" }],
      },
      {
        type: "insertBlock",
        blockId: "fl-2",
        parentId: "fl-1",
        index: 0,
        flavour: "list-item",
        props: {},
        text: [{ insert: "Nested item under the first" }],
      },
    ]);

    const applied = applyOps(doc, ops);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.doc.blocks["li-a"]).toBeUndefined();
      expect(applied.doc.blocks["li-a-1"]).toBeUndefined();
      expect(applied.doc.blocks["fl-1"].children).toEqual(["fl-2"]);
    }
  });

  it("deleting a parent with a nested child emits ONE deleteBlock and reconciles via applyOps", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const rootContent = pm.content as PMNode[];
    const idx = rootContent.findIndex((n) => n.attrs?.blockId === "li-a");
    rootContent.splice(idx, 1); // removes li-a AND its nested li-a-1
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));

    const ops = diffToOps(doc, edited);
    // li-a-1 must NOT get its own deleteBlock — it would run after li-a's
    // subtree delete already removed it and fail the whole batch.
    expect(ops).toEqual([{ type: "deleteBlock", blockId: "li-a", mode: "subtree" }]);

    const applied = applyOps(doc, ops);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.doc.blocks).toEqual(edited.blocks);
  });

  it("a block that escaped a deleted subtree is re-inserted fresh, and the batch applies cleanly", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const rootContent = pm.content as PMNode[];
    // Cut li-a-1 out of li-a, paste it at top level (blockId attr rides
    // along), then delete li-a — li-a-1's backend copy dies with li-a's
    // subtree delete, so a moveBlock for it would fail mid-batch.
    const liA = rootContent.find((n) => n.attrs?.blockId === "li-a")!;
    const escaped = (liA.content as PMNode[]).splice(1, 1)[0];
    const idx = rootContent.findIndex((n) => n.attrs?.blockId === "li-a");
    rootContent.splice(idx, 1, escaped);
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));
    expect(edited.blocks["li-a-1"]).toBeDefined(); // id survived the PM edit

    const ops = diffToOps(doc, edited, makeIdFactory("esc"));
    expect(ops).toEqual([
      { type: "deleteBlock", blockId: "li-a", mode: "subtree" },
      {
        type: "insertBlock",
        blockId: "esc-1",
        parentId: doc.root,
        index: doc.blocks[doc.root].children.indexOf("li-a"),
        flavour: "list-item",
        props: {},
        text: [{ insert: "Nested item under the first" }],
      },
    ]);
    expect(ops.filter((op) => op.type === "moveBlock")).toHaveLength(0);

    const applied = applyOps(doc, ops);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.doc.blocks["li-a"]).toBeUndefined();
      expect(applied.doc.blocks["esc-1"].text).toEqual([{ insert: "Nested item under the first" }]);
    }
  });

  it("reorder reconciliation: applying diffToOps output via applyOps reproduces the edited doc exactly", () => {
    const doc = loadFixture();
    const pm = docToPM(doc);
    const rootContent = pm.content as PMNode[];
    const liAIdx = rootContent.findIndex((n) => n.attrs?.blockId === "li-a");
    const [liA] = rootContent.splice(liAIdx, 1);
    const liBIdx = rootContent.findIndex((n) => n.attrs?.blockId === "li-b");
    rootContent.splice(liBIdx + 1, 0, liA);
    const edited = pmToDoc(pm, doc, makeIdFactory("fresh"));

    const ops = diffToOps(doc, edited);
    const applied = applyOps(doc, ops);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.doc.blocks[applied.doc.root].children).toEqual(
        edited.blocks[edited.root].children,
      );
      expect(applied.doc.blocks).toEqual(edited.blocks);
    }
  });
});
