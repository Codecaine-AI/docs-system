"use client";

import type { ComponentBundle } from "../types";
import { addNode } from "./actions/add-node";
import { moveNode } from "./actions/move-node";
import { removeBoundary } from "./actions/remove-boundary";
import { removeNode } from "./actions/remove-node";
import { setBoundary } from "./actions/set-boundary";
import { updateNode } from "./actions/update-node";
import { stackAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { stackState } from "./state";

export const stackComponent: ComponentBundle = {
  manifest,
  states: { stack: stackState },
  actions: [addNode, updateNode, removeNode, moveNode, setBoundary, removeBoundary],
  agentView: stackAgentView,
};

export { addNode } from "./actions/add-node";
export { moveNode } from "./actions/move-node";
export { removeBoundary } from "./actions/remove-boundary";
export { removeNode } from "./actions/remove-node";
export { setBoundary } from "./actions/set-boundary";
export { updateNode } from "./actions/update-node";
export { stackAgentView } from "./agent-view";
export { manifest } from "./manifest";
export * from "./state";
