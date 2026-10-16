"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";

export const setChecked = defineComponentAction({
  action: "list-item.setChecked",
  blockType: "list-item",
  description:
    "Make a list item a task and set its state: true is done (- [x]), false is open (- [ ]).",
  params: Type.Object({
    checked: Type.Boolean({ description: "true marks the task done; false marks it open." }),
  }),
  apply(_block, { checked }) {
    return { ok: true, props: { checked } };
  },
});
