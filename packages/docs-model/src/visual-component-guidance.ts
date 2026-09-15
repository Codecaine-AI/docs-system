import { manifest as canvas } from "./components/canvas/manifest";
import { manifest as processOutline } from "./components/process-outline/manifest";
import { manifest as sequence } from "./components/sequence/manifest";

/** Shared authoring context. Import only metadata so prompts need no schema runtime. */
export function visualComponentGuidance(): string {
  return [
    "Choose the visual that answers the reader's question. For a layered explanation, use Canvas for system connections, Process Outline for the expected execution trace, and Sequence for a detailed interaction. Link the views with consistent participant and phase names. Include only the views the explanation needs; do not repeat the same detail in all three.",
    canvas.description,
    processOutline.description,
    sequence.description,
    "Distinguish intended behavior from an observed trace. Verify participants, calls, cleanup ownership, and timing against source or trace evidence before describing them as current behavior. Mark a proposed flow as proposed. The harness examples above illustrate the choice of visual; they do not establish its actual execution order.",
  ].join("\n\n");
}
