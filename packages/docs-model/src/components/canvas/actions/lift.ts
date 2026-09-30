"use client";

import { CANVAS_AGENT_PATCH_OPERATIONS } from "@codecaine-ai/canvas/agent-schema";
import { Type, type TObject } from "@sinclair/typebox";

import type { ComponentAction } from "../../types";

export function liftCanvasOperations(): readonly ComponentAction[] {
  return CANVAS_AGENT_PATCH_OPERATIONS.map((descriptor) => ({
    action: `canvas.${descriptor.type}`,
    blockType: "canvas",
    description: descriptor.description,
    // Schema truth stays in the canvas package; Omit only removes the
    // envelope discriminant. The cast bridges the canvas package's typebox
    // copy (hoisted workspace ^0.34) vs this package's — same structural
    // TObject, different module identities at type level whenever the two
    // resolve to different versions (mirrors sequence/actions/lift.ts).
    params: Type.Omit(descriptor.params as unknown as TObject, ["type"]),
    forward: { authority: "canvas" },
  }));
}
