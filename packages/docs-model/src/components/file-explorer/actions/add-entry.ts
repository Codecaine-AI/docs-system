"use client";

import { Type } from "@sinclair/typebox";
import type { DocValidationIssue } from "../../../doc-schema";
import { defineComponentAction } from "../../define";
import { DOCS_COLOR_LIST, docsColorSchema } from "../../shared/colors";
import { validateTreePath } from "../../file-tree/lib";
import { readFileTreeEntries } from "../../file-tree/state";
import type { FileTreeEntry } from "../../file-tree/state";

export const addEntry = defineComponentAction({
  action: "file-explorer.addEntry",
  blockType: "file-explorer",
  description: "Append a path entry (optional note, change marker and color) to the file explorer.",
  params: Type.Object({
    path: Type.String({
      minLength: 1,
      description: '/-separated path, no leading "./"; a trailing "/" marks an explicit directory.',
    }),
    note: Type.Optional(Type.String({ description: "Short annotation rendered after the path." })),
    change: Type.Optional(
      Type.Union(
        [
          Type.Literal("added"),
          Type.Literal("removed"),
          Type.Literal("modified"),
          Type.Literal("renamed"),
        ],
        { description: 'Change marker: "added" | "removed" | "modified" | "renamed".' },
      ),
    ),
    color: Type.Optional(
      docsColorSchema({
        description: `Group color: ${DOCS_COLOR_LIST}. A directory's color carries to its whole subtree; a file's colors just its row.`,
      }),
    ),
  }),
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const { path, note, change, color } = params;
    validateTreePath(path, "path", issues);
    if (issues.length > 0) return { ok: false, issues };

    const entries = readFileTreeEntries(block);
    if (entries.some((entry) => entry.path === path)) {
      return {
        ok: false,
        issues: [{ path: "$.params.path", message: `File-explorer entry "${path}" already exists.` }],
      };
    }
    const entry: FileTreeEntry = { path };
    if (note !== undefined) entry.note = note;
    if (change !== undefined) entry.change = change;
    if (color !== undefined) entry.color = color;
    return { ok: true, props: { entries: [...entries, entry] } };
  },
});
