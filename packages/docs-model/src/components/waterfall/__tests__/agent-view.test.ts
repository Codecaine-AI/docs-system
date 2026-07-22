"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { waterfallAgentView } from "../agent-view";

function waterfallBlock(props: Record<string, unknown>): DocBlock {
  return { id: "b1", type: "waterfall", props, children: [] };
}

const CTX = { listDepth: 0, listIndex: 0 };

const STEPS = [
  {
    text: "Run mode",
    steps: [
      { text: "Get candidates", steps: [{ text: "Exclude locked work" }] },
      {
        text: "Drain the epoch",
        steps: [
          { text: "Spawn workers" },
          { text: "workers produce tentative evidence", kind: "note" },
        ],
      },
    ],
  },
];

const PROJECTED = [
  "Run mode",
  "     -> Get candidates",
  "          -> Exclude locked work",
  "     -> Drain the epoch",
  "          -> Spawn workers",
  "          > workers produce tentative evidence",
].join("\n");

describe("waterfall component agent view", () => {
  it("projects the step tree as arrow-tree text in a plain waterfall fence", () => {
    expect(waterfallAgentView(waterfallBlock({ steps: STEPS }), CTX)).toBe(
      "```waterfall\n" + PROJECTED + "\n```",
    );
  });

  it("projects a single-step tree", () => {
    expect(waterfallAgentView(waterfallBlock({ steps: [{ text: "Run" }] }), CTX)).toBe(
      "```waterfall\nRun\n```",
    );
  });

  it("projects empty or malformed props as an empty fence", () => {
    expect(waterfallAgentView(waterfallBlock({ steps: [] }), CTX)).toBe("```waterfall\n\n```");
    expect(waterfallAgentView(waterfallBlock({}), CTX)).toBe("```waterfall\n\n```");
  });

  it("returns null for other block types", () => {
    const block: DocBlock = { id: "b1", type: "paragraph", props: {}, children: [] };
    expect(waterfallAgentView(block, CTX)).toBeNull();
  });
});
