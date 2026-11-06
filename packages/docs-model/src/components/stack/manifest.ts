"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "stack",
  ownedTypes: ["stack"],
  description:
    "Boundary stack: a nested tree of named layers, auto-laid out top to bottom, with uses arrows between siblings and dashed boundary lines naming the rule enforced between two layers. No coordinates; free layout is the canvas.",
  authoring: {
    whenToUse:
      "Use Stack to show layering and the rule enforced at each line: which layer uses which, and what may never cross. " +
      "Write the layers as a tree of nodes, mark a node `uses` to draw an arrow to its next sibling, and add a boundary after a node to draw the rule beneath it. " +
      "Draw a uses arrow when the sources show or state that the node imports or calls its next sibling. " +
      "When the sources state a rule but no import or call, such as a path check that a value must pass, draw no arrow and write the rule as a boundary. " +
      "Give each line between two sibling layers a boundary when the sources hold a rule for it. " +
      "A boundary states a restriction or a required interface, such as \"docs-viewer never imports host-app code\" or \"data enters only through `DocsClient`\". It never describes what a layer outputs. " +
      "Put each rule beneath the layer whose code enforces it. Name the check, the function that runs it, and what a refused value becomes. Name each exception the source makes, such as the tools that skip the check. A rule never only names a kind of check, such as \"Lexical checks\". " +
      "Give each detail a fact that the name, the arrow label and the rule do not state. Write it as segments split by ` · `: the layer's file path first when it has one, then the exports that the layer above calls. " +
      "A badge is one role word that is not in the name, such as `pure` or `host`. Put a file path in the detail, never in the badge. " +
      "Wrap each code name in a detail or a rule in backticks, such as `checkDocsPath`, so the stack sets it in the code face. " +
      "Give a leaf a color only when the page says what the color marks. " +
      "When a layer also imports or calls a layer further down, say so in its detail and in the prose next to the stack. " +
      "Keep the layer count in the prose equal to the nodes the stack draws. Use Canvas instead when the picture needs free placement or arbitrary edges.",
    example:
      "Show the package layering: host apps above the docs framework, docs-model nested as the pure layer, and the import rule between each layer.",
    docsPath: "10-system-design/40-block-vocabulary/50-flow-and-diagrams/30-stack",
  },
};
