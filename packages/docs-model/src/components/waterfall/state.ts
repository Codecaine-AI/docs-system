"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock, DocValidationIssue } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";
import { readStepTree, stepNodes } from "./lib";
import type { WaterfallNode, WaterfallStep } from "./lib";

export const WaterfallStepSchema = Type.Recursive(
  (This) =>
    Type.Object(
      {
        text: Type.String(),
        kind: Type.Optional(
          Type.Union([Type.Literal("step"), Type.Literal("note")]),
        ),
        steps: Type.Optional(Type.Array(This)),
      },
      { additionalProperties: false },
    ),
  { $id: "WaterfallStep" },
);

/** The block is literally the list of steps — an empty array is a legal empty waterfall. */
export const WaterfallState = Type.Object(
  {
    steps: Type.Array(WaterfallStepSchema),
  },
  { additionalProperties: false },
);

/** Notes are leaves — a `kind: "note"` step must not carry child steps. */
function checkNoteLeaves(
  steps: readonly WaterfallStep[],
  basePath: string,
  issues: DocValidationIssue[],
): void {
  steps.forEach((step, index) => {
    if (step.kind === "note" && step.steps && step.steps.length > 0) {
      issues.push({
        path: `${basePath}[${index}].steps`,
        message: `Note step "${step.text}" has child steps — notes are leaves.`,
      });
    }
    if (step.steps) checkNoteLeaves(step.steps, `${basePath}[${index}].steps`, issues);
  });
}

export const waterfallState: BlockStateDefinition = {
  schema: WaterfallState,
  carriesText: false,
  check(props, basePath) {
    const issues: DocValidationIssue[] = [];
    checkNoteLeaves((props.steps ?? []) as WaterfallStep[], `${basePath}.steps`, issues);
    return issues;
  },
};

/** Step tree for actions/serialization. Tolerant, always fresh objects. */
export function readWaterfallStepTree(block: DocBlock): WaterfallStep[] {
  return readStepTree(block.props.steps);
}

/** Derived-node view of the same tree, with computed depths. */
export function readWaterfallSteps(block: DocBlock): WaterfallNode[] {
  return stepNodes(readWaterfallStepTree(block));
}
