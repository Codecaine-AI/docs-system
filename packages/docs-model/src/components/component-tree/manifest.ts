"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "component-tree",
  ownedTypes: ["component-tree"],
  description:
    "Component tree: a nested render tree of components and hooks drawn as code rows with tree guides, an aligned comment column, a diff gutter and source chips.",
  authoring: {
    whenToUse:
      "Use Component Tree to show which component renders which, and the hooks each one calls. Write each node as JSX or a hook call. Use Call Stack for plain function calls.",
    example: "Show the doc page render tree from DocPage down to the code block, marking the hook this change added.",
    docsPath: "10-system-design/40-block-vocabulary/30-trees-and-paths/40-component-tree",
  },
};
