"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { formatStepPath, resolveStep, stepsPatch } from "../lib";
import { readWaterfallStepTree } from "../state";

export const setStepText = defineComponentAction({
  action: "waterfall.setStepText",
  blockType: "waterfall",
  description:
    "Replace the text of the step at an index path (elements walk `steps` from the root; the last element indexes the step among its siblings).",
  params: Type.Object({
    path: Type.Array(Type.Integer(), {
      minItems: 1,
      description: "Index path of the step, e.g. [0, 2] for the third child of the first root.",
    }),
    text: Type.String({
      description: "Replacement step text; backticks mark code values.",
    }),
  }),
  apply(block, params) {
    const steps = readWaterfallStepTree(block);
    const resolved = resolveStep(steps, params.path);
    if (!resolved) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.path",
            message: `Step path ${formatStepPath(params.path)} does not resolve.`,
          },
        ],
      };
    }
    resolved.step.text = params.text;
    return { ok: true, props: stepsPatch(steps) };
  },
});
