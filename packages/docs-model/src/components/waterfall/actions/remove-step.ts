"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { formatStepPath, resolveStep, stepsPatch } from "../lib";
import { readWaterfallStepTree } from "../state";

export const removeStep = defineComponentAction({
  action: "waterfall.removeStep",
  blockType: "waterfall",
  description: "Remove the step at an index path, together with its entire subtree.",
  params: Type.Object({
    path: Type.Array(Type.Integer(), {
      minItems: 1,
      description: "Index path of the step to remove, e.g. [0, 2].",
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
    resolved.siblings.splice(resolved.index, 1);
    return { ok: true, props: stepsPatch(steps) };
  },
});
