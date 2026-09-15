"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import type { DocBlock } from "../../../doc-schema";
import {
  ProcessOutlineState,
  readProcessOutlineStepTree,
  readProcessOutlineSteps,
  processOutlineState,
} from "../state";

function processOutlineBlock(props: Record<string, unknown>): DocBlock {
  return { id: "b1", type: "process-outline", props, children: [] };
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

describe("process-outline component state schema", () => {
  it("accepts a structured step tree, including the empty one", () => {
    expect(Value.Check(ProcessOutlineState, { steps: STEPS })).toBe(true);
    expect(Value.Check(ProcessOutlineState, { steps: [] })).toBe(true);
  });

  it("accepts explicit step kinds", () => {
    expect(
      Value.Check(ProcessOutlineState, {
        steps: [{ text: "Run", kind: "step" }, { text: "why", kind: "note" }],
      }),
    ).toBe(true);
  });

  it("requires steps — the state is literally the list of steps", () => {
    expect(Value.Check(ProcessOutlineState, {})).toBe(false);
  });

  it("rejects malformed steps", () => {
    expect(Value.Check(ProcessOutlineState, { steps: [{ text: 42 }] })).toBe(false);
    expect(Value.Check(ProcessOutlineState, { steps: [{}] })).toBe(false);
    expect(Value.Check(ProcessOutlineState, { steps: [{ text: "Run", kind: "banana" }] })).toBe(false);
    expect(Value.Check(ProcessOutlineState, { steps: [{ text: "Run", stray: true }] })).toBe(false);
    expect(Value.Check(ProcessOutlineState, { steps: [{ text: "Run", steps: [{ text: 1 }] }] })).toBe(
      false,
    );
    expect(Value.Check(ProcessOutlineState, { steps: "Run" })).toBe(false);
  });

  it("rejects stray root properties — there is no title and no stored text form", () => {
    expect(Value.Check(ProcessOutlineState, { steps: [], stray: true })).toBe(false);
    expect(Value.Check(ProcessOutlineState, { steps: [], title: "Run" })).toBe(false);
  });
});

describe("process-outline component state check", () => {
  it("does not carry text", () => {
    expect(processOutlineState.carriesText).toBe(false);
  });

  it("flags a note step that has children — notes are leaves", () => {
    const issues = processOutlineState.check!(
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

  it("flags a trace-marked note — notes are prose, not events", () => {
    const issues = processOutlineState.check!(
      { steps: [{ text: "why", kind: "note", trace: true }] },
      "$.blocks.b1.props",
    );
    expect(issues).toEqual([
      {
        path: "$.blocks.b1.props.steps[0].trace",
        message:
          'Note step "why" is trace-marked — notes are prose about a step, not trace events.',
      },
    ]);
  });

  it("accepts a trace-marked step, with or without children", () => {
    expect(
      processOutlineState.check!(
        { steps: [{ text: "Run", trace: true, steps: [{ text: "Drain", trace: true }] }] },
        "$",
      ),
    ).toEqual([]);
    expect(Value.Check(ProcessOutlineState, { steps: [{ text: "Run", trace: true }] })).toBe(true);
    expect(Value.Check(ProcessOutlineState, { steps: [{ text: "Run", trace: "yes" }] })).toBe(false);
  });

  it("accepts note leaves and step parents", () => {
    expect(processOutlineState.check!({ steps: STEPS }, "$")).toEqual([]);
    expect(processOutlineState.check!({ steps: [{ text: "why", kind: "note", steps: [] }] }, "$")).toEqual([]);
    expect(processOutlineState.check!({}, "$")).toEqual([]);
  });
});

describe("process-outline state readers", () => {
  it("reads steps into depth-annotated nodes", () => {
    expect(readProcessOutlineSteps(processOutlineBlock({ steps: STEPS }))).toEqual([
      {
        text: "Run mode",
        note: false,
        trace: false,
        depth: 0,
        children: [
          {
            text: "Get candidates",
            note: false,
            trace: false,
            depth: 1,
            children: [
              { text: "Exclude locked work", note: false, trace: false, depth: 2, children: [] },
            ],
          },
          { text: "workers produce tentative evidence", note: true, trace: false, depth: 1, children: [] },
        ],
      },
    ]);
  });

  it("skips malformed entries tolerantly", () => {
    const block = processOutlineBlock({
      steps: [{ text: "Run", steps: [{ text: 42 }, "junk", { text: "Drain", kind: "weird" }] }, null],
    });
    const [root] = readProcessOutlineSteps(block);
    expect(root.children.map((node) => node.text)).toEqual(["Drain"]);
    expect(root.children[0].note).toBe(false);
  });

  it("returns an empty forest when steps are missing or malformed", () => {
    expect(readProcessOutlineSteps(processOutlineBlock({}))).toEqual([]);
    expect(readProcessOutlineSteps(processOutlineBlock({ steps: "Run" }))).toEqual([]);
  });

  it("returns fresh objects from the step-tree read", () => {
    const props = { steps: [{ text: "Run", steps: [{ text: "Drain" }] }] };
    const tree = readProcessOutlineStepTree(processOutlineBlock(props));
    tree[0].text = "Mutated";
    tree[0].steps![0].text = "Mutated child";
    expect(props.steps[0].text).toBe("Run");
    expect(props.steps[0].steps[0].text).toBe("Drain");
  });
});
