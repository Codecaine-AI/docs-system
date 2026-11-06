"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "code",
  ownedTypes: ["code"],
  description: "Source code: language-tagged source text with structured line annotations.",
  authoring: {
    "whenToUse": "Use annotated source listings as evidence of the actual implementation. Put a state instance in State Shape alongside its field definition.",
    "example": "Show the real validation function, verbatim, with each cut marked by a comment line, and annotate the branch that rejects an invalid write with why it rejects it and what the caller must do.",
    "docsPath": "10-system-design/40-block-vocabulary/20-code/10-code-block"
}
};
