"use client";

import type { ComponentBundle } from "../types";
import { canvasAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { CanvasState, canvasState } from "./state";

export const canvasComponent: ComponentBundle = {
  manifest,
  states: { canvas: canvasState },
  // actions: [] until P3 — lifted from @codecaine-ai/canvas and marked forward, never redefined here.
  actions: [],
  agentView: canvasAgentView,
};

export { canvasAgentView, CanvasState, canvasState, manifest };
