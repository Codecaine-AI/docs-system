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

function processOutlineBlock(props?: Record<string, unknown>): DocBlock {
  return {
    id: "b1",
    type: "process-outline",
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

describe("process-outline.setSteps component action", () => {
  it("replaces the entire step tree", () => {
    const steps = [
      {
        text: "Run mode",
        steps: [{ text: "Drain `epoch`", steps: [{ text: "note text", kind: "note" }] }],
      },
      { text: "Second" },
    ];
    expect(mustOk(run(setSteps, processOutlineBlock(), { steps }))).toEqual({ steps });
  });

  it("replaces with an empty tree", () => {
    expect(mustOk(run(setSteps, processOutlineBlock(), { steps: [] }))).toEqual({ steps: [] });
  });

  it("returns fresh objects, not the params tree", () => {
    const steps = [{ text: "Run", steps: [{ text: "Drain" }] }];
    const props = mustOk(run(setSteps, processOutlineBlock(), { steps }));
    expect(props.steps).not.toBe(steps);
    expect((props.steps as any[])[0]).not.toBe(steps[0]);
    expect(props.steps).toEqual(steps);
  });

  it("rejects missing, non-array, or malformed steps", () => {
    expect(run(setSteps, processOutlineBlock(), {}).ok).toBe(false);
    expect(run(setSteps, processOutlineBlock(), { steps: "Run" }).ok).toBe(false);
    expect(run(setSteps, processOutlineBlock(), { steps: [{ text: 42 }] }).ok).toBe(false);
    expect(run(setSteps, processOutlineBlock(), { steps: [{ text: "Run", kind: "banana" }] }).ok).toBe(
      false,
    );
    expect(
      run(setSteps, processOutlineBlock(), { steps: [{ text: "Run", steps: [{ stray: true }] }] }).ok,
    ).toBe(false);
  });
});

describe("process-outline.insertStep component action", () => {
  it("inserts at a root position", () => {
    const props = mustOk(run(insertStep, processOutlineBlock(), { path: [1], text: "Middle" }));
    expect((props.steps as { text: string }[]).map((step) => step.text)).toEqual([
      "Run",
      "Middle",
      "Finish",
    ]);
    expect(Object.keys(props)).toEqual(["steps"]);
  });

  it("inserts a nested note", () => {
    const props = mustOk(
      run(insertStep, processOutlineBlock(), { path: [0, 0, 1], text: "context", kind: "note" }),
    );
    const drain = (props.steps as any[])[0].steps[0];
    expect(drain.steps).toEqual([{ text: "Spawn" }, { text: "context", kind: "note" }]);
  });

  it("does not store kind for plain steps", () => {
    const props = mustOk(
      run(insertStep, processOutlineBlock(), { path: [2], text: "Tail", kind: "step" }),
    );
    expect((props.steps as any[])[2]).toEqual({ text: "Tail" });
  });

  it("creates the child list when inserting under a leaf step", () => {
    const props = mustOk(run(insertStep, processOutlineBlock(), { path: [1, 0], text: "Ship" }));
    expect((props.steps as any[])[1]).toEqual({ text: "Finish", steps: [{ text: "Ship" }] });
  });

  it("rejects an unresolvable path prefix and an out-of-range insert position", () => {
    const missing = run(insertStep, processOutlineBlock(), { path: [5, 0], text: "X" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues[0].path).toBe("$.params.path");
    expect(run(insertStep, processOutlineBlock(), { path: [3], text: "X" }).ok).toBe(false);
    expect(run(insertStep, processOutlineBlock(), { path: [-1], text: "X" }).ok).toBe(false);
  });

  it("rejects inserting under a note step", () => {
    const result = run(insertStep, processOutlineBlock(), { path: [0, 1, 0], text: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toContain("notes are leaves");
  });

  it("rejects malformed params", () => {
    expect(run(insertStep, processOutlineBlock(), { path: [], text: "X" }).ok).toBe(false);
    expect(run(insertStep, processOutlineBlock(), { path: [0.5], text: "X" }).ok).toBe(false);
    expect(run(insertStep, processOutlineBlock(), { path: [0] }).ok).toBe(false);
    expect(run(insertStep, processOutlineBlock(), { path: [0], text: "X", kind: "banana" }).ok).toBe(false);
  });
});

describe("process-outline.setStepText component action", () => {
  it("replaces the text of a nested step", () => {
    const props = mustOk(run(setStepText, processOutlineBlock(), { path: [0, 0], text: "Drain fully" }));
    expect((props.steps as any[])[0].steps[0].text).toBe("Drain fully");
    expect((props.steps as any[])[0].steps[0].steps).toEqual([{ text: "Spawn" }]);
  });

  it("keeps a note's kind when retexted", () => {
    const props = mustOk(run(setStepText, processOutlineBlock(), { path: [0, 1], text: "because" }));
    expect((props.steps as any[])[0].steps[1]).toEqual({ text: "because", kind: "note" });
  });

  it("rejects an unresolvable path", () => {
    expect(run(setStepText, processOutlineBlock(), { path: [0, 9], text: "X" }).ok).toBe(false);
    expect(run(setStepText, processOutlineBlock(), { path: [2], text: "X" }).ok).toBe(false);
  });

  it("rejects malformed params", () => {
    expect(run(setStepText, processOutlineBlock(), { path: [], text: "X" }).ok).toBe(false);
    expect(run(setStepText, processOutlineBlock(), { path: [0], text: 42 }).ok).toBe(false);
  });
});

describe("process-outline.removeStep component action", () => {
  it("removes a step with its subtree", () => {
    const props = mustOk(run(removeStep, processOutlineBlock(), { path: [0, 0] }));
    expect((props.steps as any[])[0].steps).toEqual([{ text: "why", kind: "note" }]);
  });

  it("removes a root", () => {
    const props = mustOk(run(removeStep, processOutlineBlock(), { path: [0] }));
    expect((props.steps as any[]).map((step) => step.text)).toEqual(["Finish"]);
  });

  it("rejects an unresolvable path and malformed params", () => {
    expect(run(removeStep, processOutlineBlock(), { path: [4] }).ok).toBe(false);
    expect(run(removeStep, processOutlineBlock(), { path: [0, 0, 5] }).ok).toBe(false);
    expect(run(removeStep, processOutlineBlock(), { path: [] }).ok).toBe(false);
    expect(run(removeStep, processOutlineBlock(), {}).ok).toBe(false);
  });
});

describe("process-outline.moveStep component action", () => {
  it("moves a subtree under another step", () => {
    const props = mustOk(run(moveStep, processOutlineBlock(), { from: [0, 0], to: [1, 0] }));
    expect((props.steps as any[])[0].steps).toEqual([{ text: "why", kind: "note" }]);
    expect((props.steps as any[])[1]).toEqual({
      text: "Finish",
      steps: [{ text: "Drain", steps: [{ text: "Spawn" }] }],
    });
  });

  it("interprets `to` against the tree after removal", () => {
    // Removing root 0 shifts "Finish" to index 0; to [0, 0] nests under it.
    const props = mustOk(run(moveStep, processOutlineBlock(), { from: [0], to: [0, 0] }));
    expect((props.steps as any[]).map((step) => step.text)).toEqual(["Finish"]);
    expect((props.steps as any[])[0].steps[0].text).toBe("Run");
  });

  it("reorders siblings", () => {
    const props = mustOk(run(moveStep, processOutlineBlock(), { from: [1], to: [0] }));
    expect((props.steps as any[]).map((step) => step.text)).toEqual(["Finish", "Run"]);
  });

  it("rejects an unresolvable from path, a destination inside the removed subtree, and a note destination", () => {
    expect(run(moveStep, processOutlineBlock(), { from: [7], to: [0] }).ok).toBe(false);
    // [0, 0, ...] cannot resolve once [0] is detached and "Finish" has no children.
    expect(run(moveStep, processOutlineBlock(), { from: [0], to: [0, 0, 0] }).ok).toBe(false);
    const noteDest = run(moveStep, processOutlineBlock(), { from: [1], to: [0, 1, 0] });
    expect(noteDest.ok).toBe(false);
    if (!noteDest.ok) expect(noteDest.issues[0].message).toContain("notes are leaves");
  });

  it("rejects an out-of-range insert position and malformed params", () => {
    expect(run(moveStep, processOutlineBlock(), { from: [0], to: [2] }).ok).toBe(false);
    expect(run(moveStep, processOutlineBlock(), { from: [], to: [0] }).ok).toBe(false);
    expect(run(moveStep, processOutlineBlock(), { from: [0], to: [] }).ok).toBe(false);
    expect(run(moveStep, processOutlineBlock(), { from: [0] }).ok).toBe(false);
  });
});

/**
 * The trace mark is a step field, so it has to survive every action that
 * rewrites the tree — all five funnel through `cloneStep`, and a field that
 * silently vanished on a move or a rename would be worse than not having it.
 */
describe("process-outline trace mark across the actions", () => {
  const traced = (): DocBlock =>
    processOutlineBlock({
      steps: [
        { text: "Run", trace: true, steps: [{ text: "Drain" }, { text: "why", kind: "note" }] },
        { text: "Finish" },
      ],
    });

  it("insertStep stores the mark only when asked", () => {
    const props = mustOk(run(insertStep, traced(), { path: [2], text: "Tail", trace: true }));
    expect((props.steps as unknown[])[2]).toEqual({ text: "Tail", trace: true });
    const plain = mustOk(run(insertStep, traced(), { path: [2], text: "Tail" }));
    expect((plain.steps as unknown[])[2]).toEqual({ text: "Tail" });
  });

  it("insertStep refuses to trace-mark a note", () => {
    const result = run(insertStep, traced(), {
      path: [2],
      text: "why",
      kind: "note",
      trace: true,
    });
    expect(result.ok).toBe(false);
  });

  it("setStepText leaves the mark alone unless the param is given", () => {
    const kept = mustOk(run(setStepText, traced(), { path: [0], text: "Run again" }));
    expect((kept.steps as { trace?: boolean }[])[0].trace).toBe(true);

    const cleared = mustOk(run(setStepText, traced(), { path: [0], text: "Run", trace: false }));
    expect((cleared.steps as { trace?: boolean }[])[0].trace).toBeUndefined();

    const set = mustOk(run(setStepText, traced(), { path: [1], text: "Finish", trace: true }));
    expect((set.steps as { trace?: boolean }[])[1].trace).toBe(true);
  });

  it("setStepText refuses to trace-mark a note", () => {
    expect(
      run(setStepText, traced(), { path: [0, 1], text: "why", trace: true }).ok,
    ).toBe(false);
  });

  it("moveStep and removeStep carry the mark with the step and its subtree", () => {
    const moved = mustOk(run(moveStep, traced(), { from: [0], to: [1] }));
    expect((moved.steps as { text: string; trace?: boolean }[])[1]).toMatchObject({
      text: "Run",
      trace: true,
    });
    const removed = mustOk(run(removeStep, traced(), { path: [1] }));
    expect((removed.steps as { trace?: boolean }[])[0].trace).toBe(true);
  });

  it("setSteps accepts a trace-marked tree through the shared schema", () => {
    const props = mustOk(
      run(setSteps, processOutlineBlock(), { steps: [{ text: "Run", trace: true }] }),
    );
    expect(props.steps).toEqual([{ text: "Run", trace: true }]);
  });
});
