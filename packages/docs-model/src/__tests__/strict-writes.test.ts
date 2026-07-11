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

  it("keeps blockAction parameter failures at $.params.*", () => {
    const result = applyOp(docWith("file-tree", { entries: [] }), {
      type: "blockAction",
      blockId: "target",
      action: "file-tree.addEntry",
      params: { path: 42 },
    });
    expectIssuePath(result, "$.params.path");
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
});
