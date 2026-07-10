"use client";

import type { ComponentBundle } from "../types";
import { codeAgentView } from "./agent-view";
import { removeAnnotation } from "./actions/remove-annotation";
import { setAnnotation } from "./actions/set-annotation";
import { manifest } from "./manifest";
import { CodeState } from "./state";

export const codeComponent: ComponentBundle = {
  manifest,
  states: { code: { schema: CodeState, carriesText: true } },
  actions: [setAnnotation, removeAnnotation],
  agentView: codeAgentView,
};

export { codeAgentView } from "./agent-view";
export { removeAnnotation } from "./actions/remove-annotation";
export { setAnnotation } from "./actions/set-annotation";
export { manifest } from "./manifest";
export { CodeAnnotationSchema, CodeState, codeState, readCodeAnnotations } from "./state";
export type { CodeAnnotation } from "./state";
