"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { stepsPatch } from "../lib";
import type { WaterfallStep } from "../lib";
import { WaterfallStepSchema } from "../state";

export const setSteps = defineComponentAction({
  action: "waterfall.setSteps",
  blockType: "waterfall",
  description:
    "Bulk replace: swap the entire step tree for the given steps. Parse arrow-tree notation with parseWaterfall to build the tree from text.",
  params: Type.Object({
    steps: Type.Array(WaterfallStepSchema, {
      description:
        "Complete replacement step tree; an empty array empties the waterfall.",
    }),
  }),
  apply(_block, { steps }) {
    return { ok: true, props: stepsPatch(steps as WaterfallStep[]) };
  },
});
