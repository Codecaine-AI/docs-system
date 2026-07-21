"use client";

import { SEQUENCE_AGENT_PATCH_OPERATIONS } from "@codecaine-ai/sequence/agent-schema";
import { Type } from "@sinclair/typebox";

import type { ComponentAction } from "../../types";

export function liftSequenceOperations(): readonly ComponentAction[] {
  return SEQUENCE_AGENT_PATCH_OPERATIONS.map((descriptor) => ({
    action: `sequence.${descriptor.type}`,
    blockType: "sequence",
    description: descriptor.description,
    // Schema truth stays in the sequence package; Omit only removes the envelope discriminant.
    params: Type.Omit(descriptor.params, ["type"]),
    forward: { authority: "sequence" },
  }));
}
