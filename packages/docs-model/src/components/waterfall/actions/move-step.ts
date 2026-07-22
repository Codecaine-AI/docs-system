"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { formatStepPath, resolveStep, resolveStepSiblings, stepsPatch } from "../lib";
import { readWaterfallStepTree } from "../state";

export const moveStep = defineComponentAction({
  action: "waterfall.moveStep",
  blockType: "waterfall",
  description:
    "Move the step at `from` (with its subtree) to the insert position `to` — `to` is interpreted against the tree AFTER the step is removed.",
  params: Type.Object({
    from: Type.Array(Type.Integer(), {
      minItems: 1,
      description: "Index path of the step to move.",
    }),
    to: Type.Array(Type.Integer(), {
      minItems: 1,
      description:
        "Insertion index path (last element = insert position), resolved after the step is detached.",
    }),
  }),
  apply(block, params) {
    const steps = readWaterfallStepTree(block);
    const origin = resolveStep(steps, params.from);
    if (!origin) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.from",
            message: `Step path ${formatStepPath(params.from)} does not resolve.`,
          },
        ],
      };
    }
    const [moved] = origin.siblings.splice(origin.index, 1);

    const dest = resolveStepSiblings(steps, params.to.slice(0, -1));
    if (!dest) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.to",
            message: `Step path ${formatStepPath(params.to)} does not resolve after removal.`,
          },
        ],
      };
    }
    if (dest.parent?.kind === "note") {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.to",
            message: "Cannot move under a note step — notes are leaves.",
          },
        ],
      };
    }
    const index = params.to[params.to.length - 1];
    if (index < 0 || index > dest.siblings.length) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.to",
            message: `"to" must end with an insert position in [0, ${dest.siblings.length}].`,
          },
        ],
      };
    }

    dest.siblings.splice(index, 0, moved);
    return { ok: true, props: stepsPatch(steps) };
  },
});
