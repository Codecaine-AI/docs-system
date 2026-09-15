"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "file-tree",
  ownedTypes: ["file-tree"],
  description: "Annotated path tree: entries with notes and change markers.",
  authoring: {
    "whenToUse": "Use a File Tree to explain where files live and what each directory owns. Add notes or change markers when location or a migration is the subject.",
    "example": "Show the service entry point, skills directory, and generated references with a note for each.",
    "docsPath": "10-system-design/40-block-vocabulary/40-file-tree"
}
};
