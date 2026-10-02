"use client";

import { Type, type TObject, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { DocBlock, DocBlockType } from "../../doc-schema";
import { defineComponentAction, schemaIssues } from "../define";
import type { ComponentAction, ComponentActionResult } from "../types";
import { readOutlineRows, type OutlineChange, type OutlineRow } from "./outline-rows";

/**
 * Path-addressed edits over the shared outline row tree (call-stack `frames`,
 * component-tree `nodes`). An index path walks the children key from the
 * root; the last element indexes a row among its siblings (or, for inserts,
 * the insert position). Every action re-validates the resulting state.
 */
export type OutlineRowActionsConfig = {
  blockType: DocBlockType;
  /** Name of the nested children array and of the top-level props key. */
  childKey: string;
  kinds: readonly string[];
  rowSchema: TSchema;
  stateSchema: TSchema;
  /** Singular noun used in descriptions, e.g. "frame" or "node". */
  noun: string;
};

/** Issue-message rendering of an index path, e.g. "[0, 2, 1]". */
export function formatRowPath(path: readonly number[]): string {
  return `[${path.join(", ")}]`;
}

/** Walks `prefix` from the root and returns the sibling list it addresses. */
export function resolveRowSiblings(rows: OutlineRow[], prefix: readonly number[]): OutlineRow[] | undefined {
  let siblings = rows;
  for (const index of prefix) {
    const row = siblings[index];
    if (!row) return undefined;
    siblings = row.children;
  }
  return siblings;
}

/** Resolves a full index path to an existing row plus the sibling list holding it. */
export function resolveRow(
  rows: OutlineRow[],
  path: readonly number[],
): { siblings: OutlineRow[]; index: number; row: OutlineRow } | undefined {
  if (path.length === 0) return undefined;
  const siblings = resolveRowSiblings(rows, path.slice(0, -1));
  if (!siblings) return undefined;
  const index = path[path.length - 1];
  const row = siblings[index];
  return row ? { siblings, index, row } : undefined;
}

/** Normalized row → stored JSON: optional fields only when set, children key only when non-empty. */
export function serializeOutlineRows(rows: readonly OutlineRow[], childKey: string): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = { text: row.text };
    if (row.kind !== undefined) out.kind = row.kind;
    if (row.comment !== undefined) out.comment = row.comment;
    if (row.change !== undefined) out.change = row.change;
    if (row.source !== undefined) out.source = row.source;
    if (row.children.length > 0) out[childKey] = serializeOutlineRows(row.children, childKey);
    return out;
  });
}

function pathIssue(param: string, message: string): ComponentActionResult {
  return { ok: false, issues: [{ path: `$.params.${param}`, message }] };
}

const OPTIONAL_FIELDS = ["kind", "comment", "change", "source"] as const;

/** Builds the five path-addressed row actions for one outline component. */
export function createOutlineRowActions(config: OutlineRowActionsConfig) {
  const { blockType, childKey, kinds, rowSchema, stateSchema, noun } = config;
  const read = (block: DocBlock) => readOutlineRows(block.props[childKey], childKey, kinds);
  const finish = (rows: readonly OutlineRow[]): ComponentActionResult => {
    const props = { [childKey]: serializeOutlineRows(rows, childKey) };
    if (!Value.Check(stateSchema, props)) {
      return { ok: false, issues: schemaIssues(Value.Errors(stateSchema, props), "$.op.props") };
    }
    return { ok: true, props };
  };
  const nullable = (schema: TSchema, description: string) =>
    Type.Optional(Type.Union([schema, Type.Null()], { description }));
  const pathParam = (description: string) =>
    Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1, description });

  const insertRow = defineComponentAction({
    action: `${blockType}.insertRow`,
    blockType,
    description: `Insert a ${noun} row (with optional nested \`${childKey}\`) at an index path: the last element is the insert position among the addressed sibling list, preceding elements walk \`${childKey}\` from the root.`,
    params: Type.Object({
      path: pathParam(
        `Index path; [i] inserts at position i among the roots, [a, ..., i] at position i under the ${noun} addressed by the prefix.`,
      ),
      row: rowSchema,
    }),
    apply(block, params) {
      const rows = read(block);
      const siblings = resolveRowSiblings(rows, params.path.slice(0, -1));
      if (!siblings) return pathIssue("path", `Row path ${formatRowPath(params.path)} does not resolve.`);
      const index = params.path[params.path.length - 1];
      if (index > siblings.length) {
        return pathIssue("path", `"path" must end with an insert position in [0, ${siblings.length}].`);
      }
      siblings.splice(index, 0, ...readOutlineRows([params.row], childKey, kinds));
      return finish(rows);
    },
  });

  const updateRow = defineComponentAction({
    action: `${blockType}.updateRow`,
    blockType,
    description: `Patch the ${noun} row at an index path. Omitted fields stay; null clears an optional field. Nested \`${childKey}\` are untouched.`,
    params: Type.Object({
      path: pathParam(`Index path of the ${noun}, e.g. [0, 2] for the third child of the first root.`),
      patch: Type.Object(
        {
          text: Type.Optional(Type.String({ minLength: 1, description: "Replacement row text, written as code." })),
          kind: nullable(
            Type.Union(kinds.map((kind) => Type.Literal(kind))),
            `Row kind (${kinds.map((kind) => `"${kind}"`).join(" | ")}); null clears it.`,
          ),
          comment: nullable(Type.String(), "Aligned comment; null clears it."),
          change: nullable(
            Type.Union([Type.Literal("added"), Type.Literal("modified"), Type.Literal("removed")]),
            'Diff state ("added" | "modified" | "removed"); null clears it.',
          ),
          source: nullable(Type.String(), 'Source location "path:line"; null clears it.'),
        },
        { additionalProperties: false, minProperties: 1, description: "Partial row; null clears an optional field." },
      ),
    }),
    apply(block, params) {
      const rows = read(block);
      const resolved = resolveRow(rows, params.path);
      if (!resolved) return pathIssue("path", `Row path ${formatRowPath(params.path)} does not resolve.`);
      const { row } = resolved;
      const patch = params.patch as Record<string, string | null | undefined>;
      if (typeof patch.text === "string") row.text = patch.text;
      for (const field of OPTIONAL_FIELDS) {
        const value = patch[field];
        if (value === undefined) continue;
        if (value === null) delete row[field];
        else if (field === "change") row.change = value as OutlineChange;
        else row[field] = value;
      }
      return finish(rows);
    },
  });

  const removeRow = defineComponentAction({
    action: `${blockType}.removeRow`,
    blockType,
    description: `Remove the ${noun} row at an index path, together with its nested \`${childKey}\`.`,
    params: Type.Object({
      path: pathParam(`Index path of the ${noun} to remove, e.g. [0, 2].`),
    }),
    apply(block, params) {
      const rows = read(block);
      const resolved = resolveRow(rows, params.path);
      if (!resolved) return pathIssue("path", `Row path ${formatRowPath(params.path)} does not resolve.`);
      resolved.siblings.splice(resolved.index, 1);
      return finish(rows);
    },
  });

  const moveRow = defineComponentAction({
    action: `${blockType}.moveRow`,
    blockType,
    description: `Move the ${noun} row at \`from\` (with its nested \`${childKey}\`) to the insert position \`to\` — \`to\` is interpreted against the tree AFTER the row is removed.`,
    params: Type.Object({
      from: pathParam(`Index path of the ${noun} to move.`),
      to: pathParam("Insertion index path (last element = insert position), resolved after the row is detached."),
    }),
    apply(block, params) {
      const rows = read(block);
      const origin = resolveRow(rows, params.from);
      if (!origin) return pathIssue("from", `Row path ${formatRowPath(params.from)} does not resolve.`);
      const [moved] = origin.siblings.splice(origin.index, 1);
      const dest = resolveRowSiblings(rows, params.to.slice(0, -1));
      if (!dest) return pathIssue("to", `Row path ${formatRowPath(params.to)} does not resolve after removal.`);
      const index = params.to[params.to.length - 1];
      if (index > dest.length) {
        return pathIssue("to", `"to" must end with an insert position in [0, ${dest.length}].`);
      }
      dest.splice(index, 0, moved);
      return finish(rows);
    },
  });

  const setRows = defineComponentAction({
    action: `${blockType}.setRows`,
    blockType,
    description: `Bulk replace: swap the entire ${noun} tree for the given rows.`,
    params: Type.Object({
      rows: Type.Array(rowSchema, {
        description: `Complete replacement ${noun} tree (nested via \`${childKey}\`); an empty array empties the block.`,
      }),
    }),
    apply(_block, params) {
      return finish(readOutlineRows(params.rows, childKey, kinds));
    },
  });

  return { insertRow, updateRow, removeRow, moveRow, setRows } satisfies Record<string, ComponentAction<TObject>>;
}
