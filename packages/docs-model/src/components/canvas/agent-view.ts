"use client";

import { stringProp } from "../projection-utils";
import type { ComponentBundle } from "../types";

export const canvasAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "canvas": {
      const src = stringProp(block, "src");
      const view = stringProp(block, "view");
      const title = stringProp(block, "title");
      if (!src) return "<!-- canvas: (missing src) -->";
      let comment = `<!-- canvas: ${src}`;
      if (view) comment += ` view=${view}`;
      if (title) comment += ` title="${title}"`;
      comment += " -->";
      return comment;
    }
    default:
      return null;
  }
};
