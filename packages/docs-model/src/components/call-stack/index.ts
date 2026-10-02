"use client";

import type { ComponentBundle } from "../types";
import { insertRow, moveRow, removeRow, setRows, updateRow } from "./actions";
import { callStackAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { callStackState } from "./state";

export const callStackComponent: ComponentBundle = {
  manifest,
  states: { "call-stack": callStackState },
  actions: [setRows, insertRow, updateRow, removeRow, moveRow],
  agentView: callStackAgentView,
};

export { callStackAgentView } from "./agent-view";
export { insertRow, moveRow, removeRow, setRows, updateRow } from "./actions";
export { manifest } from "./manifest";
export * from "./state";
