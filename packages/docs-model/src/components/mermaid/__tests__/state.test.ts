"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { mermaidAgentView } from "../agent-view";
import { MermaidState } from "../state";

const fixtureBlock = sampleFixture.blocks["mermaid-1"] as DocBlock;
const context = { listDepth: 0, listIndex: 0 };

describe("mermaid component state", () => {
  it("accepts the fixture props", () => {
    expect(Value.Check(MermaidState, fixtureBlock.props)).toBe(true);
  });

  it("accepts title and viewer-rendered caption", () => {
    expect(Value.Check(MermaidState, { title: "x", caption: "y" })).toBe(true);
  });

  it("rejects stray properties", () => {
    expect(Value.Check(MermaidState, { ...fixtureBlock.props, stray: true })).toBe(false);
  });
});

describe("mermaid component agent view", () => {
  it("projects the fixture byte-for-byte", () => {
    expect(mermaidAgentView(fixtureBlock, context)).toBe(
      "> **Mermaid: Mermaid sample** — flowchart LR\n>   A[Doc] --> B[Render]",
    );
  });

  it("projects a title-less mermaid", () => {
    const block: DocBlock = {
      id: "mermaid-titleless",
      type: "mermaid",
      props: {},
      text: [{ insert: "flowchart TD" }],
      children: [],
    };
    expect(mermaidAgentView(block, context)).toBe("> **Mermaid** — flowchart TD");
  });
});
