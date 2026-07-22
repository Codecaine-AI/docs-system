"use client";

import type { ComponentBundle } from "../types";
import { insertStep } from "./actions/insert-step";
import { moveStep } from "./actions/move-step";
import { removeStep } from "./actions/remove-step";
import { setSteps } from "./actions/set-steps";
import { setStepText } from "./actions/set-step-text";
import { waterfallAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { waterfallState } from "./state";

export const waterfallComponent: ComponentBundle = {
  manifest,
  states: {
    waterfall: waterfallState,
  },
  actions: [setSteps, insertStep, setStepText, removeStep, moveStep],
  agentView: waterfallAgentView,
};

export { insertStep } from "./actions/insert-step";
export { moveStep } from "./actions/move-step";
export { removeStep } from "./actions/remove-step";
export { setSteps } from "./actions/set-steps";
export { setStepText } from "./actions/set-step-text";
export { waterfallAgentView } from "./agent-view";
export { manifest } from "./manifest";
export * from "./lib";
export * from "./state";
