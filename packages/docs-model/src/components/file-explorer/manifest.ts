"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "file-explorer",
  ownedTypes: ["file-explorer"],
  description:
    "File explorer: IDE-style rows built from flat paths, with collapsible folders, compacted single-child folder chains, change badges and one-line notes, folded past maxRows.",
  authoring: {
    whenToUse:
      "Use File Explorer to show the files a change touches the way an editor sidebar shows them, with a badge per changed file. Use File Tree for a plain tree listing of a layout.",
    example: "Show the files the file-tree refactor added, modified and renamed, with a note on the two that matter.",
    docsPath: "10-system-design/40-block-vocabulary/30-trees-and-paths/20-file-explorer",
  },
};
