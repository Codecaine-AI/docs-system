"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { readFileTreeEntries } from "../state";

export const removeEntry = defineComponentAction({
  action: "file-tree.removeEntry",
  blockType: "file-tree",
  description: "Remove the entry with the given path from the file tree.",
  params: Type.Object({
    path: Type.String({ minLength: 1, description: "Exact path of the entry to remove." }),
  }),
  apply(block, params) {
    const { path } = params;
    const entries = readFileTreeEntries(block);
    const index = entries.findIndex((entry) => entry.path === path);
    if (index === -1) {
      return {
        ok: false,
        issues: [{ path: "$.params.path", message: `File-tree entry "${path}" does not exist.` }],
      };
    }
    return { ok: true, props: { entries: entries.filter((_, i) => i !== index) } };
  },
});
