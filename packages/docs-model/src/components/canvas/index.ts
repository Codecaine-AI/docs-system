"use client";

import type { ComponentBundle } from "../types";
import { liftCanvasOperations } from "./actions/lift";
import { canvasAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { CanvasState, canvasState } from "./state";

export const canvasComponent: ComponentBundle = {
  manifest,
  states: { canvas: canvasState },
  // P3 actions are lifted from canvas schema truth and forwarded, never redefined here.
  actions: liftCanvasOperations(),
  agentView: canvasAgentView,
};

export { canvasAgentView, CanvasState, canvasState, manifest };
