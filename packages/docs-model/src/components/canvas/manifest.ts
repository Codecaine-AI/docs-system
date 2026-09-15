"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "canvas",
  ownedTypes: ["canvas"],
  description:
    "Canvas answers \"What connects to what?\" Use it for a high-level system map: major subsystems, ownership boundaries, dependencies, and the data or control connections between them. Group related parts and label connections with what crosses each boundary. For a decomp harness, show the orchestrator, workers, tool service, sandboxes, and evidence store, with their responsibilities and connections. Keep individual tool calls, waits, and shutdown ordering for a Sequence diagram. The block references a canvas sidecar managed through typed canvas tools.",
  authoring: {
    "whenToUse": "Use Canvas for system connections, ownership boundaries, and dependencies. Use Sequence for individual calls and waits.",
    "example": "Map the external client, shared docs service, and project corpora, labeling the read and write connections.",
    "docsPath": "10-system-design/40-block-vocabulary/80-canvas"
}
};
