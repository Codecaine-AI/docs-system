"use client";

import type { ComponentBundle } from "../types";
import { callStackAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { callStackState } from "./state";

/** No named actions: the whole tree edits through schema-validated updateBlock. */
export const callStackComponent: ComponentBundle = {
  manifest,
  states: { "call-stack": callStackState },
  actions: [],
  agentView: callStackAgentView,
};

export { callStackAgentView } from "./agent-view";
export { manifest } from "./manifest";
export * from "./state";
