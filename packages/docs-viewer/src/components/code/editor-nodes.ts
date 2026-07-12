"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { blockAttrs } from "../../editor/core/node-helpers";
import { CODE_BLOCK_CLASSES } from "../../render/block-classes";

export const DocCodeBlock = Node.create({
  name: "docCodeBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return { ...blockAttrs, language: { default: null as string | null } };
  },
  parseHTML() {
    return [{ tag: "pre", preserveWhitespace: "full" as const }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["pre", mergeAttributes(HTMLAttributes, { class: CODE_BLOCK_CLASSES }), ["code", 0]];
  },
});
