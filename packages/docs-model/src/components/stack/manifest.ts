"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "stack",
  ownedTypes: ["stack"],
  description:
    "Boundary stack: a nested tree of named layers, auto-laid out top to bottom, with uses arrows between siblings and dashed boundary lines naming the rule enforced between two layers. No coordinates; free layout is the canvas.",
  authoring: {
    whenToUse:
      "Use Stack to show layering and the rule enforced at each line: which layer uses which, and what may never cross. Write the layers as a tree of nodes, mark a node `uses` to draw an arrow to its next sibling, and add a boundary after a node to draw the rule beneath it. Use Canvas instead when the picture needs free placement or arbitrary edges.",
    example:
      "Show the package layering: host apps above the docs framework, docs-model nested as the pure layer, and the import rule between each layer.",
    docsPath: "10-system-design/40-block-vocabulary/50-flow-and-diagrams/30-stack",
  },
};
