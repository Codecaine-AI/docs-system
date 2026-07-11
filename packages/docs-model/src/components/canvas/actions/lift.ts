"use client";

import { CANVAS_AGENT_PATCH_OPERATIONS } from "@codecaine-ai/canvas/agent-schema";
import { Type } from "@sinclair/typebox";

import type { ComponentAction } from "../../types";

export function liftCanvasOperations(): readonly ComponentAction[] {
  return CANVAS_AGENT_PATCH_OPERATIONS.map((descriptor) => ({
    action: `canvas.${descriptor.type}`,
    blockType: "canvas",
    description: descriptor.description,
    // Schema truth stays in the canvas package; Omit only removes the envelope discriminant.
    params: Type.Omit(descriptor.params, ["type"]),
    forward: { authority: "canvas" },
  }));
}
