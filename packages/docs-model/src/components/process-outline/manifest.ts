"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "process-outline",
  ownedTypes: ["process-outline"],
  description:
    "Process Outline answers \"What should happen, and what should the trace look like?\" Use its ordered, nested steps to describe the expected execution path from phases down to meaningful operations. Give steps concrete actor-and-action names that a reader can map to trace events; use leaf notes for conditions, expected results, or diagnostic context. For a decomp harness, outline dispatch, worker execution, validation, evidence capture, and cleanup, with substeps where they clarify the expected trace. Use Canvas for the system map and Sequence when interactions between participants, waits, or precise ordering need to be visible. The stored form is an ordered step tree; process-outline notation is its import and projection format.",
  authoring: {
    "whenToUse": "Use Process Outline for the expected execution path, with nested phases and actor-and-action step names that can be compared with a trace.",
    "example": "Outline discovery, guidance loading, editing, validation, and completion, with failure notes where needed.",
    "docsPath": "10-system-design/40-block-vocabulary/90-process-outline"
}
};
