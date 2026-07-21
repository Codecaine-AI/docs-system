"use client";

import type { ComponentBundle } from "../types";
import { liftSequenceOperations } from "./actions/lift";
import { sequenceAgentView } from "./agent-view";
import { manifest } from "./manifest";
import { SequenceState, sequenceState } from "./state";

export const sequenceComponent: ComponentBundle = {
  manifest,
  states: { sequence: sequenceState },
  // Actions are lifted from sequence schema truth and forwarded, never redefined here.
  actions: liftSequenceOperations(),
  agentView: sequenceAgentView,
};

export { sequenceAgentView, SequenceState, sequenceState, manifest };
