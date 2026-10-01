"use client";

import type { ComponentBundle } from "../types";
import { componentTreeAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { componentTreeState } from "./state";

/** No named actions: the whole tree edits through schema-validated updateBlock. */
export const componentTreeComponent: ComponentBundle = {
  manifest,
  states: { "component-tree": componentTreeState },
  actions: [],
  agentView: componentTreeAgentView,
};

export { componentTreeAgentView } from "./agent-view";
export { manifest } from "./manifest";
export * from "./state";
