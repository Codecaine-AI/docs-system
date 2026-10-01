"use client";

import type { ComponentBundle } from "../types";
import { readFlowStrip } from "./state";

/**
 * Deterministic markdown projection: the title in bold, then one numbered
 * line per step (`N. name — detail`), then the caption as its own paragraph.
 */
export const flowStripAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "flow-strip": {
      const { title, steps, caption } = readFlowStrip(block);
      const list = steps.map((step, index) => `${index + 1}. ${step.name}${step.detail ? ` — ${step.detail}` : ""}`);
      return [title ? `**${title}**` : "", list.join("\n"), caption ?? ""].filter(Boolean).join("\n\n");
    }
    default:
      return null;
  }
};
