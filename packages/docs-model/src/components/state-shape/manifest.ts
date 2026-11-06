"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "state-shape",
  ownedTypes: ["state-shape"],
  description:
    "Object shape definition: a recursive field tree (name, type, optionality, meaning) describing what a structure's state looks like, with an optional link to the defining source symbol.",
  authoring: {
    "whenToUse": "Use State Shape to define persisted or in-memory state, its nested fields, optionality, and meaning. Include a JSON example instance and a defining source reference. Describe state before the Interaction Surface that changes or queries it. Give every field a description, and make each one add a fact that its name, type and optional marker do not say: a format or unit, a constraint, a default, what an omitted or null value means, or which code sets or reads it. For example, describe retryAfterMs as \"Wait before the next try, in milliseconds. 0 retries at once.\", not \"The retry delay\". When the source gives no such fact, say what the field holds in words that the name does not already use. When a type is a named alias of a few values, such as a color or status type, list the allowed values in the description. Every fact in a description must be one the source states. Put a code name or a literal value in a description in backticks, such as `daemonFetch` or `\"\"`, so it renders as code. Make the JSON example a real instance: every required field, each nested object and array filled in, and no key the field tree does not list.",
    "example": "Define an edit task with its project, revision, and status, then show one valid task instance.",
    "docsPath": "10-system-design/40-block-vocabulary/40-structured-reference/10-state-shape"
}
};
