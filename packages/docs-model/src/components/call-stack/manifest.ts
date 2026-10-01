"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "call-stack",
  ownedTypes: ["call-stack"],
  description:
    "Call stack: a nested tree of calls drawn as code rows with tree guides, an aligned comment column, a diff gutter and source chips.",
  authoring: {
    whenToUse:
      "Use Call Stack to show which function calls which on one code path, with the file and line each frame lives at. Mark a condition with kind \"branch\" and a changed frame with change. Use Process Outline for prose steps and Component Tree for a render tree.",
    example: "Trace docs_apply_ops from the tool handler down to the atomic file write, marking the frames this change added.",
    docsPath: "10-system-design/40-block-vocabulary/30-trees-and-paths/30-call-stack",
  },
};
