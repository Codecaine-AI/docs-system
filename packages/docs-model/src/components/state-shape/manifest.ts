"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "state-shape",
  ownedTypes: ["state-shape"],
  description:
    "Object shape definition: a recursive field tree (name, type, optionality, meaning) describing what a structure's state looks like, with an optional link to the defining source symbol.",
  authoring: {
    "whenToUse": "Use State Shape to define persisted or in-memory state, its nested fields, optionality, and meaning. Include a JSON example instance and a defining source reference. Describe state before the Interaction Surface that changes or queries it.",
    "example": "Define an edit task with its project, revision, and status, then show one valid task instance.",
    "docsPath": "10-system-design/40-block-vocabulary/50-state-shape"
}
};
