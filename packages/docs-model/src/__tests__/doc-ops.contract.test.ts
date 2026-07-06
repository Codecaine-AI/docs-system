/**
 * §8.3 id-stability contract tests — SYSTEM GUARDRAIL.
 *
 * Comments, agent patches, container views, and cross-doc links all anchor to
 * stable block ids. These tests lock the op vocabulary's invariants:
 *   1. updateBlock preserves the id (comment targets stay valid),
 *   2. split/merge mint fresh non-colliding ids and never reuse any existing
 *      or previously-seen id,
 *   3. deleteBlock leaves comment targets resolvable as "removed" via
 *      detectDanglingTargets (not a crash, not re-anchoring),
 *   4. applyOp then inverse == exact original doc for EVERY op type.
 *
 * Do not weaken these assertions; downstream milestones (M3 undo units,
 * Plannotator comments, backlinks) depend on them.
 */
import { describe, expect, it } from "bun:test";
import type { CommentsDocument } from "../comments-schema";
import { detectDanglingTargets } from "../comments-schema";
import type { DocOp } from "../doc-ops";
import { applyOp, applyOps } from "../doc-ops";
import type { DocBlock, DocDocument } from "../doc-schema";
import { serializeDocDocument, validateDocDocument } from "../doc-schema";

function block(id: string, overrides: Partial<DocBlock> = {}): DocBlock {
  return {
    id,
    flavour: "paragraph",
    props: {},
    children: [],
    ...overrides,
  };
}

/**
 * root
 * ├─ h1        (heading, level 1)
 * ├─ p1        (paragraph, mixed marks)
 * ├─ p2        (paragraph)
 * ├─ list      (list-item)
 * │   ├─ li1   (list-item)
 * │   └─ li2   (list-item)
 * └─ quote     (quote)
 */
function baseDoc(): DocDocument {
  return {
    schemaVersion: 1,
    id: "doc-contract",
    root: "root",
    blocks: {
      root: block("root", { children: ["h1", "p1", "p2", "list", "quote"] }),
      h1: block("h1", { flavour: "heading", props: { level: 1 }, text: [{ insert: "Title" }] }),
      p1: block("p1", {
        props: { note: "keep" },
        text: [
          { insert: "Hello " },
          { insert: "bold", attributes: { bold: true } },
          { insert: " world" },
        ],
      }),
      p2: block("p2", { text: [{ insert: "Second paragraph" }] }),
      list: block("list", { flavour: "list-item", text: [{ insert: "List head" }], children: ["li1", "li2"] }),
      li1: block("li1", { flavour: "list-item", text: [{ insert: "One" }] }),
      li2: block("li2", { flavour: "list-item", text: [{ insert: "Two" }] }),
      quote: block("quote", { flavour: "quote", text: [{ insert: "A quote" }] }),
    },
  };
}

function makeIdFactory(prefix = "fresh"): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

function mustApply(doc: DocDocument, op: DocOp, idFactory?: () => string) {
  const result = applyOp(doc, op, idFactory);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

/** Structural equality via the deterministic serializer — byte-for-byte. */
function expectSameDoc(actual: DocDocument, expected: DocDocument) {
  expect(serializeDocDocument(actual)).toBe(serializeDocDocument(expected));
  expect(actual).toEqual(expected);
}

describe("contract 1 — updateBlock preserves the block id", () => {
  it("keeps the id across props and text updates so comment targets stay valid", () => {
    const doc = baseDoc();
    const { doc: updated } = mustApply(doc, {
      type: "updateBlock",
      blockId: "p1",
      props: { note: "changed", extra: 1 },
      text: [{ insert: "Rewritten" }],
    });

    expect(updated.blocks.p1).toBeDefined();
    expect(updated.blocks.p1.id).toBe("p1");
    expect(updated.blocks.p1.props).toEqual({ note: "changed", extra: 1 });
    expect(updated.blocks.p1.text).toEqual([{ insert: "Rewritten" }]);
    // Same set of ids before and after — update never mints or drops ids.
    expect(Object.keys(updated.blocks).sort()).toEqual(Object.keys(doc.blocks).sort());

    // A block-target comment on p1 still resolves (not dangling).
    const comments: CommentsDocument = {
      schemaVersion: 1,
      comments: [
        {
          id: "cm_p1",
          target: { kind: "block", blockId: "p1" },
          body: "anchor me",
          intent: "note",
          author: "user",
          status: "open",
          createdAt: "2026-07-03T00:00:00Z",
        },
      ],
    };
    expect(detectDanglingTargets(comments, updated, {})).toEqual([]);
  });
});

describe("contract 2 — split/merge mint fresh, never-reused ids", () => {
  it("splitBlock keeps the original id and mints a fresh id for the tail", () => {
    const doc = baseDoc();
    const { doc: split } = mustApply(
      doc,
      { type: "splitBlock", blockId: "p1", offset: 6 },
      makeIdFactory(),
    );

    expect(split.blocks.p1).toBeDefined();
    expect(split.blocks.p1.id).toBe("p1");
    const newIds = Object.keys(split.blocks).filter((id) => !(id in doc.blocks));
    expect(newIds).toHaveLength(1);
    const [newId] = newIds;
    expect(newId).not.toBe("p1");
    expect(split.blocks[newId].text).toEqual([
      { insert: "bold", attributes: { bold: true } },
      { insert: " world" },
    ]);
    expect(split.blocks.p1.text).toEqual([{ insert: "Hello " }]);
    // Tail is inserted directly after the original.
    expect(split.blocks.root.children).toEqual(["h1", "p1", newId, "p2", "list", "quote"]);
    // The split document is still schema-valid.
    expect(validateDocDocument(split).ok).toBe(true);
  });

  it("splitBlock refuses to use a colliding id from a careless factory", () => {
    const doc = baseDoc();
    // Factory first offers every existing id, then a fresh one.
    const existing = [...Object.keys(doc.blocks)];
    let calls = 0;
    const collidingFactory = () => {
      const value = calls < existing.length ? existing[calls] : "actually-fresh";
      calls += 1;
      return value;
    };
    const { doc: split } = mustApply(
      doc,
      { type: "splitBlock", blockId: "p2", offset: 6 },
      collidingFactory,
    );
    const newIds = Object.keys(split.blocks).filter((id) => !(id in doc.blocks));
    expect(newIds).toEqual(["actually-fresh"]);
  });

  it("mergeBlocks mints a fresh id and never reuses the merged ids", () => {
    const doc = baseDoc();
    const { doc: merged } = mustApply(
      doc,
      { type: "mergeBlocks", blockIds: ["p1", "p2"] },
      makeIdFactory("merged"),
    );

    expect(merged.blocks.p1).toBeUndefined();
    expect(merged.blocks.p2).toBeUndefined();
    const newIds = Object.keys(merged.blocks).filter((id) => !(id in doc.blocks));
    expect(newIds).toHaveLength(1);
    const [mergedId] = newIds;
    expect(["p1", "p2"]).not.toContain(mergedId);
    expect(merged.blocks[mergedId].text).toEqual([
      { insert: "Hello " },
      { insert: "bold", attributes: { bold: true } },
      { insert: " world" },
      { insert: "Second paragraph" },
    ]);
    expect(merged.blocks.root.children).toEqual(["h1", mergedId, "list", "quote"]);
    expect(validateDocDocument(merged).ok).toBe(true);
  });

  it("split then merge across a history never resurrects a previously-seen id", () => {
    const seen = new Set<string>(Object.keys(baseDoc().blocks));
    let doc = baseDoc();
    const idFactory = makeIdFactory("gen");

    // Split p1, merge the halves, split again, merge again — every minted id
    // must be new against EVERYTHING ever seen, including deleted ids.
    for (let round = 0; round < 3; round += 1) {
      const splitResult = mustApply(doc, { type: "splitBlock", blockId: "p1", offset: 3 }, idFactory);
      const tailId = Object.keys(splitResult.doc.blocks).find((id) => !(id in doc.blocks)) as string;
      expect(seen.has(tailId)).toBe(false);
      seen.add(tailId);
      doc = splitResult.doc;

      const mergeResult = mustApply(doc, { type: "mergeBlocks", blockIds: ["p1", tailId] }, idFactory);
      const mergedId = Object.keys(mergeResult.doc.blocks).find((id) => !(id in doc.blocks)) as string;
      expect(seen.has(mergedId)).toBe(false);
      seen.add(mergedId);
      doc = mergeResult.doc;

      // Restore the p1 id for the next round via the inverse (undo), which is
      // the ONLY legitimate way an old id comes back.
      const undo = applyOps(doc, mergeResult.inverse, idFactory);
      expect(undo.ok).toBe(true);
      if (!undo.ok) throw new Error("undo failed");
      doc = undo.doc;
    }
  });
});

describe("contract 3 — deleteBlock leaves comment targets detectable as removed", () => {
  const commentsOn = (blockId: string): CommentsDocument => ({
    schemaVersion: 1,
    comments: [
      {
        id: `cm_${blockId}`,
        target: { kind: "block", blockId },
        body: "anchored",
        intent: "note",
        author: "user",
        status: "open",
        createdAt: "2026-07-03T00:00:00Z",
      },
    ],
  });

  it("subtree delete: targets on the block AND its descendants become dangling, not crashes", () => {
    const doc = baseDoc();
    const { doc: deleted } = mustApply(doc, { type: "deleteBlock", blockId: "list", mode: "subtree" });

    for (const targetId of ["list", "li1", "li2"]) {
      const dangling = detectDanglingTargets(commentsOn(targetId), deleted, {});
      expect(dangling).toHaveLength(1);
      expect(dangling[0].commentId).toBe(`cm_${targetId}`);
      expect(dangling[0].reason).toContain(targetId);
    }
    // Untouched targets do NOT get re-anchored or flagged.
    expect(detectDanglingTargets(commentsOn("p1"), deleted, {})).toEqual([]);
    expect(validateDocDocument(deleted).ok).toBe(true);
  });

  it("reparent delete: the deleted block dangles, its surviving children do not", () => {
    const doc = baseDoc();
    const { doc: deleted } = mustApply(doc, { type: "deleteBlock", blockId: "list", mode: "reparent" });

    expect(detectDanglingTargets(commentsOn("list"), deleted, {})).toHaveLength(1);
    expect(detectDanglingTargets(commentsOn("li1"), deleted, {})).toEqual([]);
    expect(detectDanglingTargets(commentsOn("li2"), deleted, {})).toEqual([]);
    // Children were spliced into the grandparent at the deleted slot.
    expect(deleted.blocks.root.children).toEqual(["h1", "p1", "p2", "li1", "li2", "quote"]);
    expect(validateDocDocument(deleted).ok).toBe(true);
  });
});

describe("contract 4 — applyOp then inverse restores the exact original doc", () => {
  function roundTrip(op: DocOp, doc: DocDocument = baseDoc(), idFactory = makeIdFactory()) {
    const applied = mustApply(doc, op, idFactory);
    // The forward result must itself be schema-valid.
    expect(validateDocDocument(applied.doc).ok).toBe(true);
    const undone = applyOps(applied.doc, applied.inverse, idFactory);
    expect(undone.ok).toBe(true);
    if (!undone.ok) throw new Error(JSON.stringify(undone.issues));
    expectSameDoc(undone.doc, doc);
    return applied;
  }

  it("insertBlock", () => {
    roundTrip({
      type: "insertBlock",
      blockId: "p-new",
      parentId: "root",
      index: 2,
      flavour: "paragraph",
      props: { tone: "aside" },
      text: [{ insert: "Inserted" }],
    });
  });

  it("updateBlock (props merge, prop removal, and text replacement)", () => {
    roundTrip({
      type: "updateBlock",
      blockId: "p1",
      props: { note: undefined, added: true },
      text: [{ insert: "different" }],
    });
    roundTrip({ type: "updateBlock", blockId: "p1", text: null });
    roundTrip({ type: "updateBlock", blockId: "h1", props: { level: 2 } });
  });

  it("deleteBlock subtree (multi-level subtree fully restored, ids intact)", () => {
    const applied = roundTrip({ type: "deleteBlock", blockId: "list", mode: "subtree" });
    // Inverse must restore the ORIGINAL ids, not minted ones.
    const inverseIds = applied.inverse
      .filter((op): op is Extract<DocOp, { type: "insertBlock" }> => op.type === "insertBlock")
      .map((op) => op.blockId);
    expect(inverseIds.sort()).toEqual(["li1", "li2", "list"]);
  });

  it("deleteBlock reparent", () => {
    roundTrip({ type: "deleteBlock", blockId: "list", mode: "reparent" });
  });

  it("moveBlock (across parents and within a parent)", () => {
    roundTrip({ type: "moveBlock", blockId: "li1", toParentId: "root", toIndex: 0 });
    roundTrip({ type: "moveBlock", blockId: "p1", toParentId: "root", toIndex: 3 });
    roundTrip({ type: "moveBlock", blockId: "p2", toParentId: "list", toIndex: 1 });
  });

  it("splitBlock (mid-span, span boundary, and edge offsets)", () => {
    roundTrip({ type: "splitBlock", blockId: "p1", offset: 8 });
    roundTrip({ type: "splitBlock", blockId: "p1", offset: 6 });
    roundTrip({ type: "splitBlock", blockId: "p1", offset: 0 });
    roundTrip({ type: "splitBlock", blockId: "p2", offset: 16 });
  });

  it("mergeBlocks (two blocks, three blocks, and blocks with children)", () => {
    roundTrip({ type: "mergeBlocks", blockIds: ["p1", "p2"] });
    roundTrip({ type: "mergeBlocks", blockIds: ["p1", "p2", "list"] });
    roundTrip({ type: "mergeBlocks", blockIds: ["list", "quote"] });
  });

  it("applyOps composes inverses in reverse order for multi-op undo units", () => {
    const doc = baseDoc();
    const idFactory = makeIdFactory("unit");
    const result = applyOps(
      doc,
      [
        { type: "moveBlock", blockId: "quote", toParentId: "list", toIndex: 0 },
        { type: "updateBlock", blockId: "quote", text: [{ insert: "moved" }] },
        { type: "splitBlock", blockId: "p2", offset: 6 },
        { type: "deleteBlock", blockId: "h1", mode: "subtree" },
      ],
      idFactory,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const undone = applyOps(result.doc, result.inverse, idFactory);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expectSameDoc(undone.doc, doc);
  });
});

describe("pre-apply validation — ops that would break invariants are rejected", () => {
  it("rejects inserting with an existing id", () => {
    const result = applyOp(baseDoc(), {
      type: "insertBlock",
      blockId: "p1",
      parentId: "root",
      index: 0,
      flavour: "paragraph",
      props: {},
    });
    expect(result.ok).toBe(false);
  });

  it("rejects inserting under a missing parent (dangle)", () => {
    const result = applyOp(baseDoc(), {
      type: "insertBlock",
      blockId: "b-new",
      parentId: "ghost",
      index: 0,
      flavour: "paragraph",
      props: {},
    });
    expect(result.ok).toBe(false);
  });

  it("rejects moving a block into its own subtree (cycle)", () => {
    const result = applyOp(baseDoc(), { type: "moveBlock", blockId: "list", toParentId: "li1", toIndex: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].message).toContain("cycle");
  });

  it("rejects deleting or moving the root (orphan everything)", () => {
    expect(applyOp(baseDoc(), { type: "deleteBlock", blockId: "root" }).ok).toBe(false);
    expect(applyOp(baseDoc(), { type: "moveBlock", blockId: "root", toParentId: "list", toIndex: 0 }).ok).toBe(false);
  });

  it("rejects out-of-range indexes and offsets", () => {
    expect(
      applyOp(baseDoc(), {
        type: "insertBlock",
        blockId: "b-new",
        parentId: "root",
        index: 99,
        flavour: "paragraph",
        props: {},
      }).ok,
    ).toBe(false);
    expect(applyOp(baseDoc(), { type: "splitBlock", blockId: "p2", offset: 999 }, makeIdFactory()).ok).toBe(false);
  });

  it("rejects merging non-contiguous or non-sibling blocks", () => {
    expect(applyOp(baseDoc(), { type: "mergeBlocks", blockIds: ["p1", "quote"] }, makeIdFactory()).ok).toBe(false);
    expect(applyOp(baseDoc(), { type: "mergeBlocks", blockIds: ["p1", "li1"] }, makeIdFactory()).ok).toBe(false);
    expect(applyOp(baseDoc(), { type: "mergeBlocks", blockIds: ["p2", "p1"] }, makeIdFactory()).ok).toBe(false);
    expect(applyOp(baseDoc(), { type: "mergeBlocks", blockIds: ["p1"] }, makeIdFactory()).ok).toBe(false);
  });

  it("never mutates the input document, even on success", () => {
    const doc = baseDoc();
    const snapshot = serializeDocDocument(doc);
    mustApply(doc, { type: "updateBlock", blockId: "p1", props: { note: "x" } });
    mustApply(doc, { type: "deleteBlock", blockId: "list" });
    mustApply(doc, { type: "splitBlock", blockId: "p1", offset: 2 }, makeIdFactory());
    expect(serializeDocDocument(doc)).toBe(snapshot);
  });
});
