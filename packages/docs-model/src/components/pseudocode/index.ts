"use client";

import type { ComponentBundle } from "../types";
import { insertLine } from "./actions/insert-line";
import { removeLine } from "./actions/remove-line";
import { setLines } from "./actions/set-lines";
import { updateLine } from "./actions/update-line";
import { pseudocodeAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { pseudocodeState } from "./state";

/** Line actions rewrite the text (markers in front when diff is on); updateBlock still edits props and text whole. */
export const pseudocodeComponent: ComponentBundle = {
  manifest,
  states: { "pseudocode": pseudocodeState },
  actions: [insertLine, updateLine, removeLine, setLines],
  agentView: pseudocodeAgentView,
};

export { pseudocodeAgentView } from "./agent-view";
export { insertLine } from "./actions/insert-line";
export { removeLine } from "./actions/remove-line";
export { setLines } from "./actions/set-lines";
export { updateLine } from "./actions/update-line";
export { manifest } from "./manifest";
export * from "./state";
