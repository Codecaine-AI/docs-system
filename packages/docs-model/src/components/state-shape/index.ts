"use client";

import type { ComponentBundle } from "../types";
import { addField } from "./actions/add-field";
import { removeField } from "./actions/remove-field";
import { setExample } from "./actions/set-example";
import { updateField } from "./actions/update-field";
import { stateShapeAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { stateShapeState } from "./state";

export const stateShapeComponent: ComponentBundle = {
  manifest,
  states: {
    "state-shape": stateShapeState,
  },
  actions: [addField, updateField, removeField, setExample],
  agentView: stateShapeAgentView,
};

export { stateShapeAgentView } from "./agent-view";
export { addField } from "./actions/add-field";
export { removeField } from "./actions/remove-field";
export { setExample } from "./actions/set-example";
export { updateField } from "./actions/update-field";
export { manifest } from "./manifest";
export * from "./state";
