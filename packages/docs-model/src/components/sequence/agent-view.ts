"use client";

import { stringProp } from "../projection-utils";
import type { ComponentBundle } from "../types";

export const sequenceAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "sequence": {
      const source = stringProp(block, "src") ?? stringProp(block, "sequenceId");
      const title = stringProp(block, "title");
      if (!source) return "<!-- sequence: (missing src) -->";
      let comment = `<!-- sequence: ${source}`;
      if (title) comment += ` title="${title}"`;
      comment += " -->";
      return comment;
    }
    default:
      return null;
  }
};
