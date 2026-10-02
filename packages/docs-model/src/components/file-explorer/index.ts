"use client";

import type { ComponentBundle } from "../types";
import { addEntry } from "./actions/add-entry";
import { removeEntry } from "./actions/remove-entry";
import { updateEntry } from "./actions/update-entry";
import { fileExplorerAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { fileExplorerState } from "./state";

/** Entry actions keyed by exact path; title and maxRows edit through schema-validated updateBlock. */
export const fileExplorerComponent: ComponentBundle = {
  manifest,
  states: { "file-explorer": fileExplorerState },
  actions: [addEntry, removeEntry, updateEntry],
  agentView: fileExplorerAgentView,
};

export { fileExplorerAgentView } from "./agent-view";
export { addEntry } from "./actions/add-entry";
export { removeEntry } from "./actions/remove-entry";
export { updateEntry } from "./actions/update-entry";
export { manifest } from "./manifest";
export * from "./state";
