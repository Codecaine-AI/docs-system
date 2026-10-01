"use client";

import type { ComponentBundle } from "../types";
import { flowStripAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { flowStripState } from "./state";

/** No named actions: props and text edit through schema-validated updateBlock. */
export const flowStripComponent: ComponentBundle = {
  manifest,
  states: { "flow-strip": flowStripState },
  actions: [],
  agentView: flowStripAgentView,
};

export { flowStripAgentView } from "./agent-view";
export { manifest } from "./manifest";
export * from "./state";
