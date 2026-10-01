"use client";

import type { ComponentBundle } from "../types";
import { pseudocodeAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { pseudocodeState } from "./state";

/** No named actions: props and text edit through schema-validated updateBlock. */
export const pseudocodeComponent: ComponentBundle = {
  manifest,
  states: { "pseudocode": pseudocodeState },
  actions: [],
  agentView: pseudocodeAgentView,
};

export { pseudocodeAgentView } from "./agent-view";
export { manifest } from "./manifest";
export * from "./state";
