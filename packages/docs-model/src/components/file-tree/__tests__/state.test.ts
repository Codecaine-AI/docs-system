"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { fileTreeAgentView } from "../agent-view";
import { FileTreeState } from "../state";

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
});
