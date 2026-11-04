"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "component-tree",
  ownedTypes: ["component-tree"],
  description:
    "Component tree: a nested render tree of components and hooks drawn as code rows with tree guides, an aligned comment column, a diff gutter and source chips.",
  authoring: {
    whenToUse:
      "Use Component Tree to show which component renders which. Write each row as a rendered JSX element or a branch. Add a hook row only when the page is about that hook, and never for useMemo or useCallback. Name other hooks in prose or pseudocode. Use Call Stack for plain function calls.",
    example: "Show the doc page render tree from DocPage down to the code block, marking the hook this change added.",
    docsPath: "10-system-design/40-block-vocabulary/30-trees-and-paths/40-component-tree",
  },
};
