"use client";

import { Type, type TSchema } from "@sinclair/typebox";

/**
 * Shared row tree for the two code-outline blocks, call-stack (`frames`) and
 * component-tree (`nodes`): one row per call or component, nested by
 * children, with an optional kind, an aligned comment, a diff state and a
 * `path:line` source. The blocks differ only in their kind vocabulary and the
 * name of the children key.
 */
export type OutlineChange = "added" | "modified" | "removed";

/** Normalized row: `children` always present, optional fields only when set. */
export type OutlineRow = {
  text: string;
  kind?: string;
  comment?: string;
  change?: OutlineChange;
  source?: string;
  children: OutlineRow[];
};

const OUTLINE_CHANGES: readonly OutlineChange[] = ["added", "modified", "removed"];

/** Recursive row schema: `childKey` names the nested array, `kinds` the allowed kind literals. */
export function outlineRowSchema(
  id: string,
  childKey: string,
  kinds: readonly string[],
  kindDescription: string,
): TSchema {
  return Type.Recursive(
    (This) =>
      Type.Object(
        {
          text: Type.String({ minLength: 1, description: "The call or component, written as code." }),
          kind: Type.Optional(
            Type.Union(
              kinds.map((kind) => Type.Literal(kind)),
              { description: kindDescription },
            ),
          ),
          comment: Type.Optional(Type.String({ description: "Short note in the aligned comment column." })),
          change: Type.Optional(
            Type.Union(
              OUTLINE_CHANGES.map((change) => Type.Literal(change)),
              { description: "Diff state: gutter marker and row tint." },
            ),
          ),
          source: Type.Optional(Type.String({ description: 'Where the row lives, "path:line".' })),
          [childKey]: Type.Optional(Type.Array(This)),
        },
        { additionalProperties: false },
      ),
    { $id: id },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Tolerant read: skips malformed rows and unknown kinds, always returns fresh objects. */
export function readOutlineRows(raw: unknown, childKey: string, kinds: readonly string[]): OutlineRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: OutlineRow[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.text !== "string" || item.text.length === 0) continue;
    const row: OutlineRow = { text: item.text, children: readOutlineRows(item[childKey], childKey, kinds) };
    if (typeof item.kind === "string" && kinds.includes(item.kind)) row.kind = item.kind;
    if (typeof item.comment === "string" && item.comment.trim()) row.comment = item.comment.trim();
    if (OUTLINE_CHANGES.includes(item.change as OutlineChange)) row.change = item.change as OutlineChange;
    if (typeof item.source === "string" && item.source.trim()) row.source = item.source.trim();
    rows.push(row);
  }
  return rows;
}

const CHANGE_MARKERS: Record<OutlineChange, string> = { added: "+", removed: "-", modified: "~" };

function hasChange(rows: readonly OutlineRow[]): boolean {
  return rows.some((row) => row.change !== undefined || hasChange(row.children));
}

/**
 * Deterministic markdown projection: one fenced block tagged `info`, one line
 * per row, two spaces of indent per depth. A branch row leads with `? `, a
 * comment trails as `  # comment`, a source as `  @path:line`. When any row
 * changed, every line gets a diff column (`+`, `-`, `~` or blank) ahead of the
 * indent; plain outlines carry no column.
 */
export function projectOutlineRows(info: string, rows: readonly OutlineRow[]): string {
  const gutter = hasChange(rows);
  const lines: string[] = [];
  const walk = (list: readonly OutlineRow[], depth: number) => {
    for (const row of list) {
      const column = gutter ? `${row.change ? CHANGE_MARKERS[row.change] : " "} ` : "";
      const marker = row.kind === "branch" ? "? " : "";
      const comment = row.comment ? `  # ${row.comment}` : "";
      const source = row.source ? `  @${row.source}` : "";
      lines.push(`${column}${"  ".repeat(depth)}${marker}${row.text}${comment}${source}`);
      walk(row.children, depth + 1);
    }
  };
  walk(rows, 0);
  return lines.length > 0 ? "```" + info + "\n" + lines.join("\n") + "\n```" : "";
}
