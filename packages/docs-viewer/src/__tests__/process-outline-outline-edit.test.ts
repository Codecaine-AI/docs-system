import { describe, expect, it } from "bun:test";
import type { ProcessOutlineStep } from "@codecaine-ai/docs-model";
import {
  documentOrderPaths,
  noteMarkerTyped,
  planFirstStep,
  planIndent,
  planOutdent,
  planRemoveEmpty,
  planSetKind,
  planSetText,
  planSetTrace,
  planSplit,
  plainOffsetToRawOffset,
  plainText,
  previousStepPath,
  readStepsFromProps,
  runOutlineActions,
  stepAt,
  traceMarkerTyped,
} from "../components/process-outline/editor/outline-edit";

/**
 * Root
 *   Phase A
 *     Deep
 *     > note under phase A
 *   Phase B
 * Second root
 */
const TREE: ProcessOutlineStep[] = [
  {
    text: "Root",
    steps: [
      { text: "Phase A", steps: [{ text: "Deep" }, { text: "note", kind: "note" }] },
      { text: "Phase B" },
    ],
  },
  { text: "Second root" },
];

const PROPS = { steps: TREE };

const AT_END = { text: "", caret: 0 };

function line(text: string, caret = text.length) {
  return { text, caret };
}

/** Folds a plan's actions and returns the resulting step tree. */
function apply(props: Record<string, unknown>, plan: { actions: { action: string; params: Record<string, unknown> }[] } | null) {
  expect(plan).not.toBeNull();
  const result = runOutlineActions(props, plan!.actions);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return readStepsFromProps(result.props);
}

describe("outline-edit paths", () => {
  it("reads steps in document order and finds the step above", () => {
    expect(documentOrderPaths(TREE)).toEqual([[0], [0, 0], [0, 0, 0], [0, 0, 1], [0, 1], [1]]);
    // Previous sibling's deepest last descendant, not the sibling itself.
    expect(previousStepPath(TREE, [0, 1])).toEqual([0, 0, 1]);
    // Falls back to the parent when there is no previous sibling.
    expect(previousStepPath(TREE, [0, 0])).toEqual([0]);
    expect(previousStepPath(TREE, [0])).toBeUndefined();
  });

  it("resolves steps by path", () => {
    expect(stepAt(TREE, [0, 0, 1])?.kind).toBe("note");
    expect(stepAt(TREE, [])).toBeUndefined();
    expect(stepAt(TREE, [9])).toBeUndefined();
  });
});

describe("outline-edit chip offsets", () => {
  it("strips backticks for the rendered text", () => {
    expect(plainText("run `bun test` now")).toBe("run bun test now");
  });

  it("maps a rendered-text offset back onto the raw text", () => {
    const raw = "run `bun` now";
    expect(plainOffsetToRawOffset(raw, 0)).toBe(0);
    // "run " then the chip: rendered offset 4 is the "b", raw offset 5.
    expect(plainOffsetToRawOffset(raw, 4)).toBe(5);
    expect(plainOffsetToRawOffset(raw, 99)).toBe(raw.length);
  });
});

describe("runOutlineActions", () => {
  it("folds several actions into one props object", () => {
    const result = runOutlineActions(PROPS, [
      { action: "process-outline.setStepText", params: { path: [1], text: "Renamed" } },
      { action: "process-outline.insertStep", params: { path: [2], text: "Third" } },
    ]);
    expect(result.ok).toBe(true);
    const steps = readStepsFromProps((result as { props: Record<string, unknown> }).props);
    expect(steps.map((step) => step.text)).toEqual(["Root", "Renamed", "Third"]);
  });

  it("surfaces the action's own refusal instead of writing an invalid tree", () => {
    const result = runOutlineActions(PROPS, [
      { action: "process-outline.insertStep", params: { path: [0, 0, 1, 0], text: "child" } },
    ]);
    expect(result.ok).toBe(false);
    expect((result as { issues: { message: string }[] }).issues[0].message).toContain(
      "notes are leaves",
    );
  });

  it("rejects params the TypeBox schema refuses", () => {
    const result = runOutlineActions(PROPS, [
      { action: "process-outline.setStepText", params: { path: [], text: "x" } },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown action", () => {
    const result = runOutlineActions(PROPS, [
      { action: "process-outline.setStepKind", params: {} },
    ]);
    expect(result.ok).toBe(false);
  });

  it("leaves the source props untouched", () => {
    const before = JSON.stringify(PROPS);
    runOutlineActions(PROPS, [
      { action: "process-outline.removeStep", params: { path: [0] } },
    ]);
    expect(JSON.stringify(PROPS)).toBe(before);
  });
});

describe("planSetText", () => {
  it("emits setStepText and keeps the caret", () => {
    const plan = planSetText(TREE, [1], "Renamed");
    expect(plan?.actions).toEqual([
      { action: "process-outline.setStepText", params: { path: [1], text: "Renamed" } },
    ]);
    expect(plan?.caret).toBe("keep");
  });

  it("is a no-op when the text did not change", () => {
    expect(planSetText(TREE, [1], "Second root")).toBeNull();
  });
});

describe("planSplit (Enter)", () => {
  it("splits at the caret into a new sibling below", () => {
    const plan = planSplit(TREE, [0, 1], { text: "Phase Bee", caret: 5 });
    expect(plan?.actions).toEqual([
      { action: "process-outline.setStepText", params: { path: [0, 1], text: "Phase" } },
      { action: "process-outline.insertStep", params: { path: [0, 2], text: " Bee" } },
    ]);
    expect(plan?.caret).toEqual({ path: [0, 2], offset: 0 });
    const steps = apply(PROPS, plan);
    expect(steps[0].steps?.map((step) => step.text)).toEqual(["Phase A", "Phase", " Bee"]);
  });

  it("emits only the insert when the caret is at the end", () => {
    const plan = planSplit(TREE, [1], line("Second root"));
    expect(plan?.actions).toHaveLength(1);
    expect(plan?.actions[0].action).toBe("process-outline.insertStep");
  });

  it("keeps children with the original step — the new step is a sibling", () => {
    const steps = apply(PROPS, planSplit(TREE, [0], line("Root")));
    expect(steps.map((step) => step.text)).toEqual(["Root", "", "Second root"]);
    expect(steps[0].steps).toHaveLength(2);
    expect(steps[1].steps).toBeUndefined();
  });

  it("continues a note run as another note", () => {
    const plan = planSplit(TREE, [0, 0, 1], line("note"));
    expect(plan?.actions[0].params).toEqual({ path: [0, 0, 2], text: "", kind: "note" });
  });
});

describe("planIndent (Tab)", () => {
  it("makes the step the last child of its previous sibling", () => {
    const plan = planIndent(TREE, [0, 1], line("Phase B"));
    expect(plan?.actions).toEqual([
      { action: "process-outline.moveStep", params: { from: [0, 1], to: [0, 0, 2] } },
    ]);
    const steps = apply(PROPS, plan);
    expect(steps[0].steps).toHaveLength(1);
    expect(steps[0].steps?.[0].steps?.map((step) => step.text)).toEqual([
      "Deep",
      "note",
      "Phase B",
    ]);
  });

  it("carries a pending text edit into the same commit", () => {
    const plan = planIndent(TREE, [0, 1], line("Phase B2"));
    expect(plan?.actions[0]).toEqual({
      action: "process-outline.setStepText",
      params: { path: [0, 1], text: "Phase B2" },
    });
    expect(plan?.actions).toHaveLength(2);
  });

  it("is blocked with no previous sibling", () => {
    expect(planIndent(TREE, [0], line("Root"))).toBeNull();
    expect(planIndent(TREE, [0, 0], line("Phase A"))).toBeNull();
  });

  it("is blocked when the previous sibling is a note — notes are leaves", () => {
    const tree: ProcessOutlineStep[] = [{ text: "n", kind: "note" }, { text: "s" }];
    expect(planIndent(tree, [1], line("s"))).toBeNull();
  });

  it("preserves the caret offset across the move", () => {
    expect(planIndent(TREE, [0, 1], { text: "Phase B", caret: 3 })?.caret).toEqual({
      path: [0, 0, 2],
      offset: 3,
    });
  });
});

describe("planOutdent (Shift+Tab)", () => {
  it("makes the step the next sibling of its parent", () => {
    const plan = planOutdent(TREE, [0, 0, 0], line("Deep"));
    expect(plan?.actions).toEqual([
      { action: "process-outline.moveStep", params: { from: [0, 0, 0], to: [0, 1] } },
    ]);
    const steps = apply(PROPS, plan);
    expect(steps[0].steps?.map((step) => step.text)).toEqual(["Phase A", "Deep", "Phase B"]);
  });

  it("leaves following siblings where they are", () => {
    const steps = apply(PROPS, planOutdent(TREE, [0, 0], line("Phase A")));
    expect(steps.map((step) => step.text)).toEqual(["Root", "Phase A", "Second root"]);
    expect(steps[0].steps?.map((step) => step.text)).toEqual(["Phase B"]);
  });

  it("is blocked at the root level", () => {
    expect(planOutdent(TREE, [0], line("Root"))).toBeNull();
    expect(planOutdent(TREE, [1], line("Second root"))).toBeNull();
  });
});

describe("planRemoveEmpty (Backspace at start)", () => {
  it("removes the step and sends the caret to the step above", () => {
    const tree: ProcessOutlineStep[] = [{ text: "a", steps: [{ text: "b" }] }, { text: "" }];
    const plan = planRemoveEmpty(tree, [1]);
    expect(plan?.actions).toEqual([
      { action: "process-outline.removeStep", params: { path: [1] } },
    ]);
    expect(plan?.caret).toEqual({ path: [0, 0], offset: "end" });
  });

  it("clears the focus when nothing is left above", () => {
    expect(planRemoveEmpty([{ text: "" }], [0])?.caret).toBe("clear");
  });

  it("is blocked when the step still owns a subtree", () => {
    const tree: ProcessOutlineStep[] = [{ text: "", steps: [{ text: "child" }] }];
    expect(planRemoveEmpty(tree, [0])).toBeNull();
  });
});

describe("planSetKind (note conversion)", () => {
  it("turns a step into a note by removing and re-inserting it in place", () => {
    const plan = planSetKind(TREE, [0, 1], "note", line("Phase B"));
    expect(plan?.actions).toEqual([
      { action: "process-outline.removeStep", params: { path: [0, 1] } },
      {
        action: "process-outline.insertStep",
        params: { path: [0, 1], text: "Phase B", kind: "note" },
      },
    ]);
    const steps = apply(PROPS, plan);
    expect(steps[0].steps?.[1]).toEqual({ text: "Phase B", kind: "note" });
  });

  it("turns a note back into a step", () => {
    const steps = apply(PROPS, planSetKind(TREE, [0, 0, 1], "step", line("note")));
    expect(steps[0].steps?.[0].steps?.[1]).toEqual({ text: "note" });
  });

  it("is blocked for a step with children — a note cannot have any", () => {
    expect(planSetKind(TREE, [0, 0], "note", line("Phase A"))).toBeNull();
  });

  it("is a no-op when the kind already matches", () => {
    expect(planSetKind(TREE, [0, 0, 1], "note", line("note"))).toBeNull();
  });
});

describe("note marker", () => {
  it("strips the marker and shifts the caret", () => {
    expect(noteMarkerTyped({ text: "> hello", caret: 3 })).toEqual({ text: "hello", caret: 1 });
  });

  it("ignores text without the marker", () => {
    expect(noteMarkerTyped({ text: ">no space", caret: 1 })).toBeNull();
    expect(noteMarkerTyped({ text: "plain", caret: 1 })).toBeNull();
  });
});

describe("trace marker", () => {
  it("strips the marker and shifts the caret", () => {
    expect(traceMarkerTyped({ text: "=> hello", caret: 4 })).toEqual({ text: "hello", caret: 1 });
  });

  it("ignores text without the marker", () => {
    expect(traceMarkerTyped({ text: "=>no space", caret: 1 })).toBeNull();
    expect(traceMarkerTyped({ text: "> a note", caret: 1 })).toBeNull();
  });
});

describe("planSetTrace", () => {
  it("marks a step without disturbing its subtree", () => {
    const steps = apply(PROPS, planSetTrace(TREE, [0, 0], true, line("Phase A")));
    expect(steps[0].steps?.[0]).toEqual({
      text: "Phase A",
      trace: true,
      steps: [{ text: "Deep" }, { text: "note", kind: "note" }],
    });
  });

  it("clears the mark again", () => {
    const marked: ProcessOutlineStep[] = [{ text: "Run", trace: true }];
    const steps = apply({ steps: marked }, planSetTrace(marked, [0], false, line("Run")));
    expect(steps).toEqual([{ text: "Run" }]);
  });

  it("is blocked on a note, and on a step already in that state", () => {
    expect(planSetTrace(TREE, [0, 0, 1], true, line("note"))).toBeNull();
    expect(planSetTrace(TREE, [0, 0], false, line("Phase A"))).toBeNull();
    expect(planSetTrace(TREE, [9], true, line("nope"))).toBeNull();
  });

  it("carries the line's text, so a rename and the mark commit together", () => {
    const steps = apply(PROPS, planSetTrace(TREE, [1], true, line("Renamed root")));
    expect(steps[1]).toEqual({ text: "Renamed root", trace: true });
  });
});

describe("planFirstStep", () => {
  it("seeds an empty outline with one root step", () => {
    const steps = apply({ steps: [] }, planFirstStep());
    expect(steps).toEqual([{ text: "" }]);
    expect(planFirstStep().caret).toEqual({ path: [0], offset: 0 });
    expect(AT_END.caret).toBe(0);
  });
});
