"use client";

import { stringProp } from "../projection-utils";
import type { ComponentBundle } from "../types";

export const canvasAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "canvas": {
      const source = stringProp(block, "src") ?? stringProp(block, "canvasId");
      const view = stringProp(block, "view");
      const title = stringProp(block, "title");
      if (!source) return "<!-- canvas: (missing src) -->";
      let comment = `<!-- canvas: ${source}`;
      if (view) comment += ` view=${view}`;
      if (title) comment += ` title="${title}"`;
      comment += " -->";
      return comment;
    }
    default:
      return null;
  }
};
