"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { processOutlineAgentView } from "../agent-view";

function processOutlineBlock(props: Record<string, unknown>): DocBlock {
  return { id: "b1", type: "process-outline", props, children: [] };
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

describe("process-outline component agent view", () => {
  it("projects the step tree as process-outline text in a plain process-outline fence", () => {
    expect(processOutlineAgentView(processOutlineBlock({ steps: STEPS }), CTX)).toBe(
      "```process-outline\n" + PROJECTED + "\n```",
    );
  });

  it("projects a single-step tree", () => {
    expect(processOutlineAgentView(processOutlineBlock({ steps: [{ text: "Run" }] }), CTX)).toBe(
      "```process-outline\nRun\n```",
    );
  });

  it("projects empty or malformed props as an empty fence", () => {
    expect(processOutlineAgentView(processOutlineBlock({ steps: [] }), CTX)).toBe("```process-outline\n\n```");
    expect(processOutlineAgentView(processOutlineBlock({}), CTX)).toBe("```process-outline\n\n```");
  });

  it("returns null for other block types", () => {
    const block: DocBlock = { id: "b1", type: "paragraph", props: {}, children: [] };
    expect(processOutlineAgentView(block, CTX)).toBeNull();
  });

  it("shows the trace mark so an agent sees which steps are events", () => {
    const view = processOutlineAgentView(
      processOutlineBlock({
        steps: [
          { text: "Run", trace: true, steps: [{ text: "Drain", trace: true }, { text: "Sweep" }] },
        ],
      }),
      CTX,
    );
    expect(view).toBe("```process-outline\n=> Run\n     => Drain\n     -> Sweep\n```");
  });
});
