"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";
import { DOCS_COLOR_LIST, docsColorSchema, isDocsColor, type DocsColor } from "../shared/colors";

export const FileTreeEntrySchema = Type.Object(
  {
    path: Type.String({ description: '/-separated path, no leading "./"; trailing "/" marks a directory.' }),
    note: Type.Optional(Type.String()),
    change: Type.Optional(
      Type.Union([
        Type.Literal("added"),
        Type.Literal("removed"),
        Type.Literal("modified"),
        Type.Literal("renamed"),
      ]),
    ),
    from: Type.Optional(Type.String({ description: "Previous path when renamed." })),
    color: Type.Optional(
      docsColorSchema({
        description: `Group color: ${DOCS_COLOR_LIST}. On a directory it colors that row and its whole subtree (a descendant's own color overrides); on a file, just that row.`,
      }),
    ),
  },
  { additionalProperties: false },
);

export const FileTreeState = Type.Object(
  { entries: Type.Array(FileTreeEntrySchema) },
  { additionalProperties: false },
);

export const fileTreeState: BlockStateDefinition = {
  schema: FileTreeState,
  carriesText: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export const FILE_TREE_CHANGES = ["added", "removed", "modified", "renamed"] as const;

export type FileTreeChange = (typeof FILE_TREE_CHANGES)[number];

/** Entry colors: the docs color roster. */
export type FileTreeColor = DocsColor;

export type FileTreeEntry = {
  path: string;
  note?: string;
  change?: FileTreeChange;
  /** Previous path — used with change: "renamed". */
  from?: string;
  /** Group color; a directory's color carries to its whole subtree. */
  color?: FileTreeColor;
};

function isFileTreeChange(value: unknown): value is FileTreeChange {
  return typeof value === "string" && (FILE_TREE_CHANGES as readonly string[]).includes(value);
}

/** Tolerant read: skips malformed entries, always returns fresh objects. */
export function readFileTreeEntries(block: DocBlock): FileTreeEntry[] {
  const raw = block.props.entries;
  if (!Array.isArray(raw)) return [];
  const entries: FileTreeEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.path !== "string" || item.path.length === 0) continue;
    const entry: FileTreeEntry = { path: item.path };
    if (typeof item.note === "string" && item.note.length > 0) entry.note = item.note;
    if (isFileTreeChange(item.change)) entry.change = item.change;
    if (typeof item.from === "string" && item.from.length > 0) entry.from = item.from;
    if (isDocsColor(item.color)) entry.color = item.color;
    entries.push(entry);
  }
  return entries;
}
