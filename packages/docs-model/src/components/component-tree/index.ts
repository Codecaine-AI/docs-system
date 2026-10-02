"use client";

import type { ComponentBundle } from "../types";
import { insertRow, moveRow, removeRow, setRows, updateRow } from "./actions";
import { componentTreeAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { componentTreeState } from "./state";

export const componentTreeComponent: ComponentBundle = {
  manifest,
  states: { "component-tree": componentTreeState },
  actions: [setRows, insertRow, updateRow, removeRow, moveRow],
  agentView: componentTreeAgentView,
};

export { componentTreeAgentView } from "./agent-view";
export { insertRow, moveRow, removeRow, setRows, updateRow } from "./actions";
export { manifest } from "./manifest";
export * from "./state";
