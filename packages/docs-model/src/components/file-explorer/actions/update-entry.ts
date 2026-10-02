"use client";

import { Type } from "@sinclair/typebox";
import type { DocValidationIssue } from "../../../doc-schema";
import { defineComponentAction } from "../../define";
import { validateTreePath } from "../../file-tree/lib";
import { readFileTreeEntries } from "../../file-tree/state";
import type { FileTreeEntry } from "../../file-tree/state";

export const updateEntry = defineComponentAction({
  action: "file-explorer.updateEntry",
  blockType: "file-explorer",
  description: "Patch an entry's note/change/from, or rename it via newPath (in place).",
  params: Type.Object({
    path: Type.String({ minLength: 1, description: "Exact path of the entry to patch." }),
    note: Type.Optional(
      Type.Union([Type.String(), Type.Null()], { description: "New note; pass null to clear." }),
    ),
    change: Type.Optional(
      Type.Union(
        [
          Type.Literal("added"),
          Type.Literal("removed"),
          Type.Literal("modified"),
          Type.Literal("renamed"),
          Type.Null(),
        ],
        { description: "New change marker; pass null to clear." },
      ),
    ),
    from: Type.Optional(
      Type.Union([Type.String(), Type.Null()], {
        description: "Previous path (for renamed); pass null to clear.",
      }),
    ),
    newPath: Type.Optional(
      Type.String({ description: "Rename the entry to this path (kept in place)." }),
    ),
  }),
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const { path, note, change, from, newPath } = params;
    if (newPath !== undefined) validateTreePath(newPath, "newPath", issues);
    if (issues.length > 0) return { ok: false, issues };

    const entries = readFileTreeEntries(block);
    const index = entries.findIndex((entry) => entry.path === path);
    if (index === -1) {
      return {
        ok: false,
        issues: [{ path: "$.params.path", message: `File-explorer entry "${path}" does not exist.` }],
      };
    }
    if (
      newPath !== undefined &&
      newPath !== path &&
      entries.some((entry, i) => i !== index && entry.path === newPath)
    ) {
      return {
        ok: false,
        issues: [{ path: "$.params.newPath", message: `File-explorer entry "${newPath}" already exists.` }],
      };
    }

    const updated: FileTreeEntry = { ...entries[index] };
    if (newPath !== undefined) updated.path = newPath;
    if (note !== undefined) {
      if (note === null) delete updated.note;
      else updated.note = note;
    }
    if (change !== undefined) {
      if (change === null) delete updated.change;
      else updated.change = change;
    }
    if (from !== undefined) {
      if (from === null) delete updated.from;
      else updated.from = from;
    }
    const next = [...entries];
    next[index] = updated;
    return { ok: true, props: { entries: next } };
  },
});
