"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkParams } from "../../define";
import type { ComponentAction, ComponentActionResult } from "../../types";
import { insertStep } from "../actions/insert-step";
import { moveStep } from "../actions/move-step";
import { removeStep } from "../actions/remove-step";
import { setSteps } from "../actions/set-steps";
import { setStepText } from "../actions/set-step-text";

function waterfallBlock(props?: Record<string, unknown>): DocBlock {
  return {
    id: "b1",
    type: "waterfall",
    props: props ?? {
      steps: [
        {
          text: "Run",
          steps: [
            { text: "Drain", steps: [{ text: "Spawn" }] },
            { text: "why", kind: "note" },
          ],
        },
        { text: "Finish" },
      ],
    },
    children: [],
  };
}

function run(
  action: ComponentAction,
  block: DocBlock,
  params: Record<string, unknown>,
): ComponentActionResult {
  const before = JSON.stringify(block);
  const issues = checkParams(action, params);
  const result = issues.length > 0
    ? { ok: false as const, issues }
    : "apply" in action
      ? action.apply(block, params)
      : (() => { throw new Error("Expected a local action."); })();
  expect(JSON.stringify(block)).toBe(before);
  return result;
}

function mustOk(result: ComponentActionResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected ok, got issues: ${JSON.stringify(result.issues)}`);
  return result.props;
}

describe("waterfall.setSteps component action", () => {
  it("replaces the entire step tree", () => {
    const steps = [
      {
        text: "Run mode",
        steps: [{ text: "Drain `epoch`", steps: [{ text: "note text", kind: "note" }] }],
      },
      { text: "Second" },
    ];
    expect(mustOk(run(setSteps, waterfallBlock(), { steps }))).toEqual({ steps });
  });

  it("replaces with an empty tree", () => {
    expect(mustOk(run(setSteps, waterfallBlock(), { steps: [] }))).toEqual({ steps: [] });
  });

  it("returns fresh objects, not the params tree", () => {
    const steps = [{ text: "Run", steps: [{ text: "Drain" }] }];
    const props = mustOk(run(setSteps, waterfallBlock(), { steps }));
    expect(props.steps).not.toBe(steps);
    expect((props.steps as any[])[0]).not.toBe(steps[0]);
    expect(props.steps).toEqual(steps);
  });

  it("rejects missing, non-array, or malformed steps", () => {
    expect(run(setSteps, waterfallBlock(), {}).ok).toBe(false);
    expect(run(setSteps, waterfallBlock(), { steps: "Run" }).ok).toBe(false);
    expect(run(setSteps, waterfallBlock(), { steps: [{ text: 42 }] }).ok).toBe(false);
    expect(run(setSteps, waterfallBlock(), { steps: [{ text: "Run", kind: "banana" }] }).ok).toBe(
      false,
    );
    expect(
      run(setSteps, waterfallBlock(), { steps: [{ text: "Run", steps: [{ stray: true }] }] }).ok,
    ).toBe(false);
  });
});

describe("waterfall.insertStep component action", () => {
  it("inserts at a root position", () => {
    const props = mustOk(run(insertStep, waterfallBlock(), { path: [1], text: "Middle" }));
    expect((props.steps as { text: string }[]).map((step) => step.text)).toEqual([
      "Run",
      "Middle",
      "Finish",
    ]);
    expect(Object.keys(props)).toEqual(["steps"]);
  });

  it("inserts a nested note", () => {
    const props = mustOk(
      run(insertStep, waterfallBlock(), { path: [0, 0, 1], text: "context", kind: "note" }),
    );
    const drain = (props.steps as any[])[0].steps[0];
    expect(drain.steps).toEqual([{ text: "Spawn" }, { text: "context", kind: "note" }]);
  });

  it("does not store kind for plain steps", () => {
    const props = mustOk(
      run(insertStep, waterfallBlock(), { path: [2], text: "Tail", kind: "step" }),
    );
    expect((props.steps as any[])[2]).toEqual({ text: "Tail" });
  });

  it("creates the child list when inserting under a leaf step", () => {
    const props = mustOk(run(insertStep, waterfallBlock(), { path: [1, 0], text: "Ship" }));
    expect((props.steps as any[])[1]).toEqual({ text: "Finish", steps: [{ text: "Ship" }] });
  });

  it("rejects an unresolvable path prefix and an out-of-range insert position", () => {
    const missing = run(insertStep, waterfallBlock(), { path: [5, 0], text: "X" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues[0].path).toBe("$.params.path");
    expect(run(insertStep, waterfallBlock(), { path: [3], text: "X" }).ok).toBe(false);
    expect(run(insertStep, waterfallBlock(), { path: [-1], text: "X" }).ok).toBe(false);
  });

  it("rejects inserting under a note step", () => {
    const result = run(insertStep, waterfallBlock(), { path: [0, 1, 0], text: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toContain("notes are leaves");
  });

  it("rejects malformed params", () => {
    expect(run(insertStep, waterfallBlock(), { path: [], text: "X" }).ok).toBe(false);
    expect(run(insertStep, waterfallBlock(), { path: [0.5], text: "X" }).ok).toBe(false);
    expect(run(insertStep, waterfallBlock(), { path: [0] }).ok).toBe(false);
    expect(run(insertStep, waterfallBlock(), { path: [0], text: "X", kind: "banana" }).ok).toBe(false);
  });
});

describe("waterfall.setStepText component action", () => {
  it("replaces the text of a nested step", () => {
    const props = mustOk(run(setStepText, waterfallBlock(), { path: [0, 0], text: "Drain fully" }));
    expect((props.steps as any[])[0].steps[0].text).toBe("Drain fully");
    expect((props.steps as any[])[0].steps[0].steps).toEqual([{ text: "Spawn" }]);
  });

  it("keeps a note's kind when retexted", () => {
    const props = mustOk(run(setStepText, waterfallBlock(), { path: [0, 1], text: "because" }));
    expect((props.steps as any[])[0].steps[1]).toEqual({ text: "because", kind: "note" });
  });

  it("rejects an unresolvable path", () => {
    expect(run(setStepText, waterfallBlock(), { path: [0, 9], text: "X" }).ok).toBe(false);
    expect(run(setStepText, waterfallBlock(), { path: [2], text: "X" }).ok).toBe(false);
  });

  it("rejects malformed params", () => {
    expect(run(setStepText, waterfallBlock(), { path: [], text: "X" }).ok).toBe(false);
    expect(run(setStepText, waterfallBlock(), { path: [0], text: 42 }).ok).toBe(false);
  });
});

describe("waterfall.removeStep component action", () => {
  it("removes a step with its subtree", () => {
    const props = mustOk(run(removeStep, waterfallBlock(), { path: [0, 0] }));
    expect((props.steps as any[])[0].steps).toEqual([{ text: "why", kind: "note" }]);
  });

  it("removes a root", () => {
    const props = mustOk(run(removeStep, waterfallBlock(), { path: [0] }));
    expect((props.steps as any[]).map((step) => step.text)).toEqual(["Finish"]);
  });

  it("rejects an unresolvable path and malformed params", () => {
    expect(run(removeStep, waterfallBlock(), { path: [4] }).ok).toBe(false);
    expect(run(removeStep, waterfallBlock(), { path: [0, 0, 5] }).ok).toBe(false);
    expect(run(removeStep, waterfallBlock(), { path: [] }).ok).toBe(false);
    expect(run(removeStep, waterfallBlock(), {}).ok).toBe(false);
  });
});

describe("waterfall.moveStep component action", () => {
  it("moves a subtree under another step", () => {
    const props = mustOk(run(moveStep, waterfallBlock(), { from: [0, 0], to: [1, 0] }));
    expect((props.steps as any[])[0].steps).toEqual([{ text: "why", kind: "note" }]);
    expect((props.steps as any[])[1]).toEqual({
      text: "Finish",
      steps: [{ text: "Drain", steps: [{ text: "Spawn" }] }],
    });
  });

  it("interprets `to` against the tree after removal", () => {
    // Removing root 0 shifts "Finish" to index 0; to [0, 0] nests under it.
    const props = mustOk(run(moveStep, waterfallBlock(), { from: [0], to: [0, 0] }));
    expect((props.steps as any[]).map((step) => step.text)).toEqual(["Finish"]);
    expect((props.steps as any[])[0].steps[0].text).toBe("Run");
  });

  it("reorders siblings", () => {
    const props = mustOk(run(moveStep, waterfallBlock(), { from: [1], to: [0] }));
    expect((props.steps as any[]).map((step) => step.text)).toEqual(["Finish", "Run"]);
  });

  it("rejects an unresolvable from path, a destination inside the removed subtree, and a note destination", () => {
    expect(run(moveStep, waterfallBlock(), { from: [7], to: [0] }).ok).toBe(false);
    // [0, 0, ...] cannot resolve once [0] is detached and "Finish" has no children.
    expect(run(moveStep, waterfallBlock(), { from: [0], to: [0, 0, 0] }).ok).toBe(false);
    const noteDest = run(moveStep, waterfallBlock(), { from: [1], to: [0, 1, 0] });
    expect(noteDest.ok).toBe(false);
    if (!noteDest.ok) expect(noteDest.issues[0].message).toContain("notes are leaves");
  });

  it("rejects an out-of-range insert position and malformed params", () => {
    expect(run(moveStep, waterfallBlock(), { from: [0], to: [2] }).ok).toBe(false);
    expect(run(moveStep, waterfallBlock(), { from: [], to: [0] }).ok).toBe(false);
    expect(run(moveStep, waterfallBlock(), { from: [0], to: [] }).ok).toBe(false);
    expect(run(moveStep, waterfallBlock(), { from: [0] }).ok).toBe(false);
  });
});
