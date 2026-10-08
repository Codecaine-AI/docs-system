"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import { applyOp } from "../../../doc-ops";
import type { DocBlock, DocBlockType, DocDocument } from "../../../doc-schema";
import { fileTreeAgentView } from "../agent-view";
import { FileTreeState, readFileTreeEntries } from "../state";

const treeFixture = sampleFixture.blocks["tree-1"];
const treeBlock = treeFixture as DocBlock;

describe("file-tree state", () => {
  it("accepts the fixture block props", () => {
    expect(Value.Check(FileTreeState, treeFixture.props)).toBe(true);
  });

  it("rejects a stray entry property", () => {
    const props = {
      ...treeFixture.props,
      entries: treeFixture.props.entries.map((entry, index) =>
        index === 0 ? { ...entry, stray: true } : entry,
      ),
    };
    expect(Value.Check(FileTreeState, props)).toBe(false);
  });

  it("requires entries", () => {
    const { entries: _entries, ...props } = treeFixture.props;
    expect(Value.Check(FileTreeState, props)).toBe(false);
  });

  it("rejects the removed title property", () => {
    expect(Value.Check(FileTreeState, { ...treeFixture.props, title: "Layout" })).toBe(false);
  });

  it("rejects a stray top-level property", () => {
    expect(Value.Check(FileTreeState, { ...treeFixture.props, stray: true })).toBe(false);
  });

  it("accepts a roster color and rejects any other color", () => {
    expect(Value.Check(FileTreeState, { entries: [{ path: "src/", color: "violet" }] })).toBe(true);
    expect(Value.Check(FileTreeState, { entries: [{ path: "src/", color: "magenta" }] })).toBe(false);
    expect(Value.Check(FileTreeState, { entries: [{ path: "src/", color: "#ff0000" }] })).toBe(false);
  });

  it("reads a valid color and drops an invalid one", () => {
    const block: DocBlock = {
      id: "t",
      type: "file-tree",
      props: {
        entries: [
          { path: "src/", color: "teal" },
          { path: "docs/", color: "magenta" },
          { path: "README.md", color: 3 },
        ],
      },
      children: [],
    };
    expect(readFileTreeEntries(block)).toEqual([
      { path: "src/", color: "teal" },
      { path: "docs/" },
      { path: "README.md" },
    ]);
  });
});

describe("file-tree agent view", () => {
  it("renders the fixture byte-for-byte", () => {
    const expected = [
      "```",
      "  src/",
      "  ├── components/",
      "  │   └── docs/",
      "> │       └── src/components/docs/BlockRenderer.tsx -> DocBlockRenderer.tsx",
      "  └── lib/",
      "      ├── docs-model/",
      "~     │   ├── doc-ops.ts  # typed ops + inverses",
      "+     │   └── doc-schema.ts  # types + validation",
      "-     └── legacy/  # dead code purge",
      "  README.md",
      "```",
    ].join("\n");

    expect(fileTreeAgentView(treeBlock, { listDepth: 0, listIndex: 0 })).toBe(expected);
  });

  it("renders the same bytes when entries carry colors", () => {
    const colored: DocBlock = {
      ...treeBlock,
      props: {
        ...treeBlock.props,
        entries: (treeBlock.props.entries as Array<Record<string, unknown>>).map((entry) => ({
          ...entry,
          color: "blue",
        })),
      },
    };
    expect(fileTreeAgentView(colored, { listDepth: 0, listIndex: 0 })).toBe(
      fileTreeAgentView(treeBlock, { listDepth: 0, listIndex: 0 }),
    );
  });
});

describe("updateBlock with entry colors", () => {
  function docWith(type: DocBlockType): DocDocument {
    return {
      schemaVersion: 1,
      id: `doc-${type}`,
      root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["target"] },
        target: { id: "target", type, props: { entries: [{ path: "src/" }] }, children: [] },
      },
    };
  }

  it.each(["file-tree", "file-explorer"] as const)("%s accepts a roster color", (type) => {
    const result = applyOp(docWith(type), {
      type: "updateBlock",
      blockId: "target",
      props: { entries: [{ path: "src/", color: "blue" }, { path: "src/index.ts", color: "pink" }] },
    });
    expect(result.ok).toBe(true);
  });

  it.each(["file-tree", "file-explorer"] as const)("%s rejects a color outside the roster", (type) => {
    const result = applyOp(docWith(type), {
      type: "updateBlock",
      blockId: "target",
      props: { entries: [{ path: "src/", color: "magenta" }] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path)).toContain("$.op.props.entries[0].color");
  });
});
