"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "structured-table",
  ownedTypes: ["structured-table"],
  description: "Structured table: a columns × rows grid.",
  authoring: {
    "whenToUse": "Use a Structured Table for a comparison, index, or mapping with the same properties across rows. Use State Shape for nested typed fields.",
    "example": "Compare supported clients by installation path and connection method.",
    "docsPath": "10-system-design/40-block-vocabulary/30-structured-table"
}
};
