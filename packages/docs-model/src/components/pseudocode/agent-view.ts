"use client";

import { deltaToPlainTextInline } from "../../delta-markdown";
import type { ComponentBundle } from "../types";

/** One ```pseudocode fence (```pseudocode diff when the +/- column is a diff); the text verbatim. */
export const pseudocodeAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "pseudocode": {
      const info = block.props.diff === true ? "pseudocode diff" : "pseudocode";
      return "```" + info + "\n" + deltaToPlainTextInline(block.text) + "\n```";
    }
    default:
      return null;
  }
};
