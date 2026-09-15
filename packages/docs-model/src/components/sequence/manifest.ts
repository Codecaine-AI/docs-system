"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "sequence",
  ownedTypes: ["sequence"],
  description:
    "Sequence answers \"Who calls whom, in what order, and what must finish before the next action?\" Use it to explain a bounded interaction in detail: tool calls, request and return paths, sandbox execution, asynchronous work, waits, retries, failures, and shutdown. For a decomp harness, identify the worker, tool service, sandbox, and any other actual participants; show who requests work, who waits for completion, where results return, and when sandbox shutdown occurs relative to those events. Use synchronous calls, asynchronous messages, returns, and guarded fragments to express the documented behavior. Vertical position shows event order, not measured elapsed time; state durations or timing constraints explicitly when supported. Participant order is consistent at the top and bottom. The block references a sequence sidecar managed through typed sequence tools.",
  authoring: {
    "whenToUse": "Use Sequence for a bounded interaction where participant order, calls, returns, waits, retries, or failures explain the behavior. Verify the sequence against source or trace evidence.",
    "example": "Show a client opening a task, reading a document, applying an operation, and receiving validation findings.",
    "docsPath": "10-system-design/40-block-vocabulary/70-sequence"
}
};
