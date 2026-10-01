"use client";

import type { ComponentBundle } from "../types";
import { stackAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { stackState } from "./state";

/** No named actions: the whole tree edits through schema-validated updateBlock. */
export const stackComponent: ComponentBundle = {
  manifest,
  states: { stack: stackState },
  actions: [],
  agentView: stackAgentView,
};

export { stackAgentView } from "./agent-view";
export { manifest } from "./manifest";
export * from "./state";
