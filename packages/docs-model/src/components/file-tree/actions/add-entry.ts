"use client";

import { Type } from "@sinclair/typebox";
import type { DocValidationIssue } from "../../../doc-schema";
import { defineComponentAction } from "../../define";
import { validateTreePath } from "../lib";
import { readFileTreeEntries } from "../state";
import type { FileTreeEntry } from "../state";

export const addEntry = defineComponentAction({
  action: "file-tree.addEntry",
  blockType: "file-tree",
  description: "Append a path entry (optional note and change marker) to the file tree.",
  params: Type.Object(
    {
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
    },
    { additionalProperties: false },
  ),
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const { path, note, change } = params;
    validateTreePath(path, "path", issues);
    if (issues.length > 0) return { ok: false, issues };

    const entries = readFileTreeEntries(block);
    if (entries.some((entry) => entry.path === path)) {
      return {
        ok: false,
        issues: [{ path: "$.params.path", message: `File-tree entry "${path}" already exists.` }],
      };
    }
    const entry: FileTreeEntry = { path };
    if (note !== undefined) entry.note = note;
    if (change !== undefined) entry.change = change;
    return { ok: true, props: { entries: [...entries, entry] } };
  },
});
