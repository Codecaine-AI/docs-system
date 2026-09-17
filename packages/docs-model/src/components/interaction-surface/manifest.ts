"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "interaction-surface",
  ownedTypes: ["interaction-surface"],
  description: "Operation list describing how a system can be changed or queried: named operation signatures with params and returns.",
  authoring: {
    "whenToUse": "Use Interaction Surface to describe the actions, queries, and events available on a state or system, including parameters and return values. Action changes state, Query reads state, and Event describes observation or notification. Each operation has its own kind-labeled card. Use returnShape with recursive fields and a JSON example for known object returns; keep returns for its name or a primitive type. Document callback payloads separately from subscription return values. Describe only non-obvious constraints or behavior. Pair it with State Shape. Use Sequence when the question concerns ordering between participants.",
    "example": "Document openDocument, applyOperations, and checkDocument with their parameters and results.",
    "docsPath": "10-system-design/40-block-vocabulary/60-interaction-surface"
}
};
