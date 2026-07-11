"use client";

import { describe, expect, it } from "bun:test";
import { applyOp, applyOps } from "../doc-ops";
import type { DocBlockType, DocDocument } from "../doc-schema";

type Representative = {
  type: DocBlockType;
  props: Record<string, unknown>;
  conformingPatch: Record<string, unknown>;
  wrongPatch: Record<string, unknown>;
  wrongPath: string;
};

const REPRESENTATIVES: Representative[] = [
  {
    type: "heading",
    props: { level: 1 },
    conformingPatch: { level: 2 },
    wrongPatch: { level: "two" },
    wrongPath: "$.op.props.level",
  },
  {
    type: "file-tree",
    props: { entries: [{ path: "src/main.ts" }] },
    conformingPatch: { title: "Source files" },
    wrongPatch: { entries: "src/main.ts" },
    wrongPath: "$.op.props.entries",
  },
  {
    type: "structured-table",
    props: { columns: ["Name"], rows: [["Ada"]] },
    conformingPatch: { density: "compact" },
    wrongPatch: { columns: [42] },
    wrongPath: "$.op.props.columns[0]",
  },
  {
    type: "canvas",
    props: { canvasId: "canvas-main" },
    conformingPatch: { view: "architecture" },
    wrongPatch: { canvasId: 42 },
    wrongPath: "$.op.props.canvasId",
  },
  {
    type: "mermaid",
    props: { title: "Flow" },
    conformingPatch: { diagramType: "flowchart" },
    wrongPatch: { title: 42 },
    wrongPath: "$.op.props.title",
  },
];

function docWith(type: DocBlockType, props: Record<string, unknown>): DocDocument {
  return {
    schemaVersion: 1,
    id: `doc-${type}`,
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: ["target"] },
      target: {
        id: "target",
        type,
        props,
        text: [{ insert: "hello" }],
        children: [],
      },
    },
  };
}

function legacyParagraphDoc(): DocDocument {
  return {
    schemaVersion: 1,
    id: "doc-legacy-paragraph",
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: ["target"] },
      target: {
        id: "target",
        type: "paragraph",
        props: { legacy: true },
        text: [{ insert: "hello" }],
        children: [],
      },
    },
  };
}

function expectIssuePath(result: ReturnType<typeof applyOp>, path: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issues.some((issue) => issue.path === path)).toBe(true);
}

describe("strict component-state writes", () => {
  for (const representative of REPRESENTATIVES) {
    describe(representative.type, () => {
      it("accepts a conforming updateBlock props patch", () => {
        const result = applyOp(docWith(representative.type, representative.props), {
          type: "updateBlock",
          blockId: "target",
          props: representative.conformingPatch,
        });
        expect(result.ok).toBe(true);
      });

      it("rejects an unknown prop at $.op.props.<key>", () => {
        const result = applyOp(docWith(representative.type, representative.props), {
          type: "updateBlock",
          blockId: "target",
          props: { unexpected: true },
        });
        expectIssuePath(result, "$.op.props.unexpected");
      });

      it("rejects a wrong-typed known prop", () => {
        const result = applyOp(docWith(representative.type, representative.props), {
          type: "updateBlock",
          blockId: "target",
          props: representative.wrongPatch,
        });
        expectIssuePath(result, representative.wrongPath);
      });
    });
  }

  it("accepts a conforming insertBlock", () => {
    const doc = docWith("heading", { level: 1 });
    const result = applyOp(doc, {
      type: "insertBlock",
      blockId: "canvas-new",
      parentId: "root",
      index: 1,
      blockType: "canvas",
      props: { canvasId: "canvas-new", title: "New canvas" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a stray insertBlock prop without half-applying", () => {
    const doc = docWith("heading", { level: 1 });
    const before = structuredClone(doc);
    const result = applyOp(doc, {
      type: "insertBlock",
      blockId: "canvas-new",
      parentId: "root",
      index: 1,
      blockType: "canvas",
      props: { canvasId: "canvas-new", zoom: 3 },
    });
    expectIssuePath(result, "$.op.props.zoom");
    expect(doc).toEqual(before);
    expect(doc.blocks["canvas-new"]).toBeUndefined();
    expect(doc.blocks.root.children).toEqual(["target"]);
  });

  it("runs a valid blockAction through strict updateBlock validation", () => {
    const result = applyOp(docWith("file-tree", { entries: [{ path: "src/main.ts" }] }), {
      type: "blockAction",
      blockId: "target",
      action: "file-tree.addEntry",
      params: { path: "src/index.ts", change: "added" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.blocks.target.props.entries).toEqual([
      { path: "src/main.ts" },
      { path: "src/index.ts", change: "added" },
    ]);
  });

  it("forwards the validation option through blockAction's updateBlock", () => {
    const original = docWith("file-tree", { entries: [], legacy: true });
    const op = {
      type: "blockAction" as const,
      blockId: "target",
      action: "file-tree.addEntry",
      params: { path: "src/index.ts", change: "added" },
    };

    expectIssuePath(applyOp(original, op), "$.op.props.legacy");

    const exempt = applyOp(original, op, undefined, { validateProps: false });
    expect(exempt.ok).toBe(true);
    if (!exempt.ok) return;
    expect(exempt.doc.blocks.target.props).toEqual({
      entries: [{ path: "src/index.ts", change: "added" }],
      legacy: true,
    });
  });

  it("keeps blockAction parameter failures at $.params.*", () => {
    const result = applyOp(docWith("file-tree", { entries: [] }), {
      type: "blockAction",
      blockId: "target",
      action: "file-tree.addEntry",
      params: { path: 42 },
    });
    expectIssuePath(result, "$.params.path");
  });

  it("refuses to apply a forwarded canvas action as a doc op", () => {
    const result = applyOp(docWith("canvas", { canvasId: "canvas-main" }), {
      type: "blockAction",
      blockId: "target",
      action: "canvas.addObject",
      params: {
        object: {
          id: "agent-draft",
          type: "process",
          label: "Draft response",
          geometry: { x: 440, y: 176, width: 192, height: 88 },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: "$.op.action",
      message:
        'Action "canvas.addObject" is handled by the canvas authority and cannot be applied as a doc op.',
    });
  });

  it("rejects a text-only update when the existing props are nonconforming", () => {
    const result = applyOp(docWith("heading", { level: 1, legacy: true }), {
      type: "updateBlock",
      blockId: "target",
      text: [{ insert: "rewritten" }],
    });
    expectIssuePath(result, "$.op.props.legacy");
  });

  it("does not validate splitBlock or mergeBlocks copies of legacy props", () => {
    const splitDoc = docWith("paragraph", { legacy: true });
    const split = applyOp(
      splitDoc,
      { type: "splitBlock", blockId: "target", offset: 2 },
      () => "tail",
    );
    expect(split.ok).toBe(true);
    if (split.ok) expect(split.doc.blocks.tail.props).toEqual({ legacy: true });

    const mergeDoc = docWith("paragraph", { legacy: true });
    mergeDoc.blocks.root.children.push("second");
    mergeDoc.blocks.second = {
      id: "second",
      type: "paragraph",
      props: {},
      text: [{ insert: "world" }],
      children: [],
    };
    const merged = applyOp(
      mergeDoc,
      { type: "mergeBlocks", blockIds: ["target", "second"] },
      () => "merged",
    );
    expect(merged.ok).toBe(true);
    if (merged.ok) expect(merged.doc.blocks.merged.props).toEqual({ legacy: true });
  });

  it("restores the exact original document with a valid updateBlock inverse", () => {
    const original = docWith("heading", { level: 1 });
    const updated = applyOp(original, {
      type: "updateBlock",
      blockId: "target",
      props: { level: 3 },
      text: [{ insert: "updated" }],
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    const undone = applyOps(updated.doc, updated.inverse);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.doc).toEqual(original);
  });

  describe("legacy props during inverse replay", () => {
    function expectUndoOnlyExemption(
      original: DocDocument,
      forward: ReturnType<typeof applyOps>,
    ): void {
      expect(forward.ok).toBe(true);
      if (!forward.ok) return;

      const restored = applyOps(forward.doc, forward.inverse, undefined, {
        validateProps: false,
      });
      expect(restored.ok).toBe(true);
      if (restored.ok) expect(restored.doc).toEqual(original);

      const strictReplay = applyOps(forward.doc, forward.inverse);
      expectIssuePath(strictReplay, "$.op.props.legacy");
    }

    it("restores a deleted legacy-prop subtree only during exempt inverse replay", () => {
      const original = legacyParagraphDoc();
      original.blocks.target.children.push("nested");
      original.blocks.nested = {
        id: "nested",
        type: "paragraph",
        props: {},
        text: [{ insert: "child" }],
        children: [],
      };

      const forward = applyOps(original, [
        { type: "deleteBlock", blockId: "target", mode: "subtree" },
      ]);

      expectUndoOnlyExemption(original, forward);
    });

    it("restores a split legacy-prop block only during exempt inverse replay", () => {
      const original = legacyParagraphDoc();
      const forward = applyOps(
        original,
        [{ type: "splitBlock", blockId: "target", offset: 2 }],
        () => "tail",
      );

      expectUndoOnlyExemption(original, forward);
    });

    it("restores merged legacy-prop blocks only during exempt inverse replay", () => {
      const original = legacyParagraphDoc();
      original.blocks.root.children.push("second");
      original.blocks.second = {
        id: "second",
        type: "paragraph",
        props: {},
        text: [{ insert: "world" }],
        children: [],
      };
      const forward = applyOps(
        original,
        [{ type: "mergeBlocks", blockIds: ["target", "second"] }],
        () => "merged",
      );

      expectUndoOnlyExemption(original, forward);
    });

    it("restores a cleaned-up legacy prop only during exempt inverse replay", () => {
      const original = legacyParagraphDoc();
      const forward = applyOps(original, [
        { type: "updateBlock", blockId: "target", props: { legacy: undefined } },
      ]);

      expectUndoOnlyExemption(original, forward);
    });
  });
});
