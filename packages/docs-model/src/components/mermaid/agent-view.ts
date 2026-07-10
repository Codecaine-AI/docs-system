"use client";

import { deltaToMarkdownInline } from "../../delta-markdown";
import { blockquotePrefix, stringProp } from "../projection-utils";
import type { ComponentBundle } from "../types";

export const mermaidAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "mermaid": {
      const title = stringProp(block, "title");
      const body = deltaToMarkdownInline(block.text);

      let head = "**Mermaid";
      if (title) head += `: ${title}`;
      head += "**";
      if (body) head += ` — ${body}`;
      return blockquotePrefix(head);
    }
    default:
      return null;
  }
};
