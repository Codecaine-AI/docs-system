"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "interaction-surface",
  ownedTypes: ["interaction-surface"],
  description: "Operation list describing how a system can be changed or queried: named operation signatures with params and returns.",
  authoring: {
    "whenToUse": "Use Interaction Surface to describe the actions, queries, and events available on a state or system, including parameters and return values. Action changes state, Query reads state, and Event describes observation or notification. Each operation is one collapsed row. Hovering its name shows the kind and purpose, and opening it shows Parameters and Returns cards. Use returnShape with recursive fields and a JSON example for known object returns; keep returns for its name or a primitive type. Add exampleCall with the code text of one real example invocation (authored values, never invented). Document callback payloads separately from subscription return values. Describe only non-obvious constraints or behavior. Pair it with State Shape. Use Sequence when the question concerns ordering between participants.",
    "example": "Document openDocument, applyOperations, and checkDocument with their parameters and results.",
    "docsPath": "10-system-design/40-block-vocabulary/40-structured-reference/20-interaction-surface"
}
};
