"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "flow-strip",
  ownedTypes: ["flow-strip"],
  description:
    "Flow strip: a short row of numbered step cards joined by arrows, each with a name and one detail line, under an optional title and over an optional caption.",
  authoring: {
    whenToUse:
      "Use Flow Strip to show a short linear loop or pipeline at a glance, three to six steps. Use Process Outline when steps nest or need notes, and Sequence when the exact messages between parties matter.",
    example: "Show the docs MCP edit loop: begin, read, apply ops, check, end.",
    docsPath: "10-system-design/40-block-vocabulary/50-flow-and-diagrams/20-flow-strip",
  },
};
