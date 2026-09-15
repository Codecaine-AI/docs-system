"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { formatStepPath, resolveStepSiblings, stepsPatch } from "../lib";
import type { ProcessOutlineStep } from "../lib";
import { readProcessOutlineStepTree } from "../state";

export const insertStep = defineComponentAction({
  action: "process-outline.insertStep",
  blockType: "process-outline",
  description:
    "Insert a step at an index path: the last element is the insert position among the addressed sibling list, preceding elements walk `steps` from the root.",
  params: Type.Object({
    path: Type.Array(Type.Integer(), {
      minItems: 1,
      description:
        "Index path; [i] inserts at position i among the roots, [a, ..., i] at position i under the step addressed by the prefix.",
    }),
    text: Type.String({
      description: "Step text; backticks mark code values.",
    }),
    kind: Type.Optional(
      Type.Union([Type.Literal("step"), Type.Literal("note")], {
        description: 'Step kind; "note" is a clarification leaf. Default "step".',
      }),
    ),
    trace: Type.Optional(
      Type.Boolean({
        description:
          "Mark the step as one a real trace event corresponds to (`=>` in notation). Notes cannot be trace-marked.",
      }),
    ),
  }),
  apply(block, params) {
    const steps = readProcessOutlineStepTree(block);
    const resolved = resolveStepSiblings(steps, params.path.slice(0, -1));
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
    if (resolved.parent?.kind === "note") {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.path",
            message: "Cannot insert under a note step — notes are leaves.",
          },
        ],
      };
    }
    const index = params.path[params.path.length - 1];
    if (index < 0 || index > resolved.siblings.length) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.path",
            message: `"path" must end with an insert position in [0, ${resolved.siblings.length}].`,
          },
        ],
      };
    }

    if (params.kind === "note" && params.trace) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.trace",
            message: "A note cannot be trace-marked — notes are prose about a step, not trace events.",
          },
        ],
      };
    }

    const step: ProcessOutlineStep = { text: params.text };
    if (params.kind === "note") step.kind = "note";
    if (params.trace) step.trace = true;
    resolved.siblings.splice(index, 0, step);
    return { ok: true, props: stepsPatch(steps) };
  },
});
