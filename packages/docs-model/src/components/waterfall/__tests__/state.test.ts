"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import type { DocBlock } from "../../../doc-schema";
import {
  WaterfallState,
  readWaterfallStepTree,
  readWaterfallSteps,
  waterfallState,
} from "../state";

function waterfallBlock(props: Record<string, unknown>): DocBlock {
  return { id: "b1", type: "waterfall", props, children: [] };
}

const STEPS = [
  {
    text: "Run mode",
    steps: [
      { text: "Get candidates", steps: [{ text: "Exclude locked work" }] },
      { text: "workers produce tentative evidence", kind: "note" },
    ],
  },
];

describe("waterfall component state schema", () => {
  it("accepts a structured step tree, including the empty one", () => {
    expect(Value.Check(WaterfallState, { steps: STEPS })).toBe(true);
    expect(Value.Check(WaterfallState, { steps: [] })).toBe(true);
  });

  it("accepts explicit step kinds", () => {
    expect(
      Value.Check(WaterfallState, {
        steps: [{ text: "Run", kind: "step" }, { text: "why", kind: "note" }],
      }),
    ).toBe(true);
  });

  it("requires steps — the state is literally the list of steps", () => {
    expect(Value.Check(WaterfallState, {})).toBe(false);
  });

  it("rejects malformed steps", () => {
    expect(Value.Check(WaterfallState, { steps: [{ text: 42 }] })).toBe(false);
    expect(Value.Check(WaterfallState, { steps: [{}] })).toBe(false);
    expect(Value.Check(WaterfallState, { steps: [{ text: "Run", kind: "banana" }] })).toBe(false);
    expect(Value.Check(WaterfallState, { steps: [{ text: "Run", stray: true }] })).toBe(false);
    expect(Value.Check(WaterfallState, { steps: [{ text: "Run", steps: [{ text: 1 }] }] })).toBe(
      false,
    );
    expect(Value.Check(WaterfallState, { steps: "Run" })).toBe(false);
  });

  it("rejects stray root properties — there is no title and no stored text form", () => {
    expect(Value.Check(WaterfallState, { steps: [], stray: true })).toBe(false);
    expect(Value.Check(WaterfallState, { steps: [], title: "Run" })).toBe(false);
  });
});

describe("waterfall component state check", () => {
  it("does not carry text", () => {
    expect(waterfallState.carriesText).toBe(false);
  });

  it("flags a note step that has children — notes are leaves", () => {
    const issues = waterfallState.check!(
      {
        steps: [
          {
            text: "Run",
            steps: [{ text: "why", kind: "note", steps: [{ text: "child" }] }],
          },
        ],
      },
      "$.blocks.b1.props",
    );
    expect(issues).toEqual([
      {
        path: "$.blocks.b1.props.steps[0].steps[0].steps",
        message: 'Note step "why" has child steps — notes are leaves.',
      },
    ]);
  });

  it("accepts note leaves and step parents", () => {
    expect(waterfallState.check!({ steps: STEPS }, "$")).toEqual([]);
    expect(waterfallState.check!({ steps: [{ text: "why", kind: "note", steps: [] }] }, "$")).toEqual([]);
    expect(waterfallState.check!({}, "$")).toEqual([]);
  });
});

describe("waterfall state readers", () => {
  it("reads steps into depth-annotated nodes", () => {
    expect(readWaterfallSteps(waterfallBlock({ steps: STEPS }))).toEqual([
      {
        text: "Run mode",
        note: false,
        depth: 0,
        children: [
          {
            text: "Get candidates",
            note: false,
            depth: 1,
            children: [
              { text: "Exclude locked work", note: false, depth: 2, children: [] },
            ],
          },
          { text: "workers produce tentative evidence", note: true, depth: 1, children: [] },
        ],
      },
    ]);
  });

  it("skips malformed entries tolerantly", () => {
    const block = waterfallBlock({
      steps: [{ text: "Run", steps: [{ text: 42 }, "junk", { text: "Drain", kind: "weird" }] }, null],
    });
    const [root] = readWaterfallSteps(block);
    expect(root.children.map((node) => node.text)).toEqual(["Drain"]);
    expect(root.children[0].note).toBe(false);
  });

  it("returns an empty forest when steps are missing or malformed", () => {
    expect(readWaterfallSteps(waterfallBlock({}))).toEqual([]);
    expect(readWaterfallSteps(waterfallBlock({ steps: "Run" }))).toEqual([]);
  });

  it("returns fresh objects from the step-tree read", () => {
    const props = { steps: [{ text: "Run", steps: [{ text: "Drain" }] }] };
    const tree = readWaterfallStepTree(waterfallBlock(props));
    tree[0].text = "Mutated";
    tree[0].steps![0].text = "Mutated child";
    expect(props.steps[0].text).toBe("Run");
    expect(props.steps[0].steps[0].text).toBe("Drain");
  });
});
