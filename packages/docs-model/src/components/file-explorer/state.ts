"use client";

import { Type } from "@sinclair/typebox";
import type { BlockStateDefinition } from "../types";
import { FileTreeEntrySchema } from "../file-tree/state";

/** Same entry shape as the file tree; the explorer adds an optional title and a fold height. */
export const FileExplorerState = Type.Object(
  {
    entries: Type.Array(FileTreeEntrySchema),
    title: Type.Optional(Type.String({ description: "Header title; no header without it." })),
    maxRows: Type.Optional(Type.Integer({ minimum: 1, description: "Rows shown before folding (default 8)." })),
  },
  { additionalProperties: false },
);

export const fileExplorerState: BlockStateDefinition = { schema: FileExplorerState, carriesText: false };
