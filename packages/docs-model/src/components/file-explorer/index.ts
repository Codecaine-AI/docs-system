"use client";

import type { ComponentBundle } from "../types";
import { fileExplorerAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { fileExplorerState } from "./state";

/** No named actions: the entries edit through schema-validated updateBlock. */
export const fileExplorerComponent: ComponentBundle = {
  manifest,
  states: { "file-explorer": fileExplorerState },
  actions: [],
  agentView: fileExplorerAgentView,
};

export { fileExplorerAgentView } from "./agent-view";
export { manifest } from "./manifest";
export * from "./state";
