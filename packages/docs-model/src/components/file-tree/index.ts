"use client";

import { fileTreeAgentView } from "./agent-view";
import { addEntry } from "./actions/add-entry";
import { removeEntry } from "./actions/remove-entry";
import { updateEntry } from "./actions/update-entry";
import { manifest } from "./manifest";
import { fileTreeState } from "./state";
import type { ComponentBundle } from "../types";

export const fileTreeComponent: ComponentBundle = {
  manifest,
  states: { "file-tree": fileTreeState },
  actions: [addEntry, removeEntry, updateEntry],
  agentView: fileTreeAgentView,
};

export { fileTreeAgentView } from "./agent-view";
export { addEntry } from "./actions/add-entry";
export { removeEntry } from "./actions/remove-entry";
export { updateEntry } from "./actions/update-entry";
export { manifest } from "./manifest";
export {
  FILE_TREE_CHANGES,
  FileTreeEntrySchema,
  FileTreeState,
  fileTreeState,
  readFileTreeEntries,
} from "./state";
export type { FileTreeChange, FileTreeEntry } from "./state";
