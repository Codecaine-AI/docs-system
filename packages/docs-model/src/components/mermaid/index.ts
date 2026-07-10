"use client";

import type { ComponentBundle } from "../types";
import { mermaidAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { MermaidState } from "./state";

export const mermaidComponent: ComponentBundle = {
  manifest,
  states: { mermaid: { schema: MermaidState, carriesText: true } },
  actions: [],
  agentView: mermaidAgentView,
};

export { mermaidAgentView } from "./agent-view";
export { manifest } from "./manifest";
export { MermaidState } from "./state";
