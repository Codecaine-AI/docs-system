"use client";

import type { ComponentBundle } from "../types";
import { interactionSurfaceAgentView } from "./agent-view";
import { addOperation } from "./actions/add-operation";
import { removeOperation } from "./actions/remove-operation";
import { updateOperation } from "./actions/update-operation";
import { manifest } from "./manifest";
import { InteractionSurfaceState } from "./state";

export const interactionSurfaceComponent: ComponentBundle = {
  manifest,
  states: {
    "interaction-surface": {
      schema: InteractionSurfaceState,
      carriesText: false,
    },
  },
  actions: [addOperation, updateOperation, removeOperation],
  agentView: interactionSurfaceAgentView,
};

export { interactionSurfaceAgentView } from "./agent-view";
export { addOperation } from "./actions/add-operation";
export { removeOperation } from "./actions/remove-operation";
export { updateOperation } from "./actions/update-operation";
export { manifest } from "./manifest";
export * from "./state";
