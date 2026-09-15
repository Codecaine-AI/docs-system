"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { formatStepPath, resolveStep, stepsPatch } from "../lib";
import { readProcessOutlineStepTree } from "../state";

export const setStepText = defineComponentAction({
  action: "process-outline.setStepText",
  blockType: "process-outline",
  description:
    "Replace the text of the step at an index path (elements walk `steps` from the root; the last element indexes the step among its siblings). Optionally set or clear its trace mark in the same edit.",
  params: Type.Object({
    path: Type.Array(Type.Integer(), {
      minItems: 1,
      description: "Index path of the step, e.g. [0, 2] for the third child of the first root.",
    }),
    text: Type.String({
      description: "Replacement step text; backticks mark code values.",
    }),
    trace: Type.Optional(
      Type.Boolean({
        description:
          "Set or clear the step's trace mark (`=>` in notation). Omit to leave it as it is. Notes cannot be trace-marked.",
      }),
    ),
  }),
  apply(block, params) {
    const steps = readProcessOutlineStepTree(block);
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
    // The marker is part of the line, so setting the line can set it — that
    // keeps `=>` a one-action edit without a sixth action on the tool surface.
    if (params.trace !== undefined) {
      if (params.trace && resolved.step.kind === "note") {
        return {
          ok: false,
          issues: [
            {
              path: "$.params.trace",
              message:
                "A note cannot be trace-marked — notes are prose about a step, not trace events.",
            },
          ],
        };
      }
      if (params.trace) resolved.step.trace = true;
      else delete resolved.step.trace;
    }
    resolved.step.text = params.text;
    return { ok: true, props: stepsPatch(steps) };
  },
});
