"use client";

import type { ComponentBundle } from "../types";
import { richTextAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { RICH_TEXT_STATES } from "./state";

export const richTextComponent: ComponentBundle = {
  manifest,
  states: RICH_TEXT_STATES,
  // D7: scalar props edit via schema-validated updateBlock, so this bundle has no named actions.
  actions: [],
  agentView: richTextAgentView,
};

export { richTextAgentView } from "./agent-view";
export { manifest } from "./manifest";
export {
  CalloutState,
  DividerState,
  HeadingState,
  ImageState,
  ListItemState,
  ParagraphState,
  QuoteState,
  RICH_TEXT_STATES,
  VideoState,
} from "./state";
