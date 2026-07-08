"use client";

import type { DocBlock, DocBlockType, DocValidationIssue } from "./doc-schema";

/**
 * Typed block actions — the agent editing layer for structured blocks.
 *
 * Structured "object" blocks (file-tree, structured-table,
 * interaction-surface, code annotations) are edited through NAMED ACTIONS
 * instead of hand-editing props
 * JSON. Each `BlockActionDefinition.apply` validates its own params at
 * runtime (the `params` specs exist for discovery/tool-listing only), never
 * mutates the input block, and returns a SHALLOW-MERGE props patch that the
 * kernel executes through the existing updateBlock path (see the
 * `blockAction` op in doc-ops.ts) — a patch key set to `undefined` removes
 * that prop, and the inverse op is the usual updateBlock inverse.
 *
 * Text-category types (paragraph, heading, list-item, quote, callout) stay on
 * the generic op vocabulary and define no actions here.
 */

export type BlockCategory = "text" | "object";

/**
 * Editing category per block type. Text types edit through generic ops
 * (updateBlock text/props, split/merge); object types edit their structured
 * props through named actions.
 *
 * `code` counts as OBJECT because of its structured `annotations` prop
 * (edited via code.setAnnotation / code.removeAnnotation) — its SOURCE text
 * still edits through generic text ops like any text block.
 */
export const BLOCK_TYPE_CATEGORY: Record<DocBlockType, BlockCategory> = {
  paragraph: "text",
  heading: "text",
  "list-item": "text",
  quote: "text",
  callout: "text",
  code: "object",
  divider: "object",
  "structured-table": "object",
  "file-tree": "object",
  "interaction-surface": "object",
  mermaid: "object",
  canvas: "object",
  image: "object",
  video: "object",
};

export type BlockActionParamType = "string" | "number" | "boolean" | "object" | "array";

export type BlockActionParamSpec = {
  name: string;
  type: BlockActionParamType;
  required: boolean;
  description: string;
};

export type BlockActionResult =
  | {
      ok: true;
      /**
       * Shallow-merge patch fed to updateBlock semantics — a key set to
       * `undefined` removes that prop.
       */
      props: Record<string, unknown>;
    }
  | { ok: false; issues: DocValidationIssue[] };

export type BlockActionDefinition = {
  /** Registry key: "<blockType>.<verb>". */
  action: string;
  blockType: DocBlockType;
  /** One-line, agent-facing. */
  description: string;
  /** Discovery-only specs; the runtime checks live in apply(). */
  params: BlockActionParamSpec[];
  /** Pure: validates params itself and never mutates the input block. */
  apply(block: DocBlock, params: Record<string, unknown>): BlockActionResult;
};

// ---------------------------------------------------------------------------
// Param validation helpers — every rejection carries a "$.params.<name>" path.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function paramIssue(name: string, message: string): DocValidationIssue {
  return { path: `$.params.${name}`, message };
}

function failWith(...issues: DocValidationIssue[]): BlockActionResult {
  return { ok: false, issues };
}

function requireString(
  params: Record<string, unknown>,
  name: string,
  issues: DocValidationIssue[],
): string | undefined {
  const value = params[name];
  if (typeof value !== "string" || value.length === 0) {
    issues.push(paramIssue(name, `"${name}" is required and must be a non-empty string.`));
    return undefined;
  }
  return value;
}

function optionalString(
  params: Record<string, unknown>,
  name: string,
  issues: DocValidationIssue[],
): string | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issues.push(paramIssue(name, `"${name}" must be a string when provided.`));
    return undefined;
  }
  return value;
}

/** `undefined` = leave untouched, `null` = clear the field. */
function optionalStringOrNull(
  params: Record<string, unknown>,
  name: string,
  issues: DocValidationIssue[],
): string | null | undefined {
  const value = params[name];
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    issues.push(paramIssue(name, `"${name}" must be a string or null when provided.`));
    return undefined;
  }
  return value;
}

function requireInteger(
  params: Record<string, unknown>,
  name: string,
  issues: DocValidationIssue[],
  min: number,
  max: number,
): number | undefined {
  const value = params[name];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    issues.push(paramIssue(name, `"${name}" must be an integer in [${min}, ${max}].`));
    return undefined;
  }
  return value;
}

function optionalInteger(
  params: Record<string, unknown>,
  name: string,
  issues: DocValidationIssue[],
  min: number,
  max: number,
  fallback: number,
): number {
  if (params[name] === undefined) return fallback;
  return requireInteger(params, name, issues, min, max) ?? fallback;
}

// ---------------------------------------------------------------------------
// FILE-TREE — props contract v2 (backward-compatible superset of v1):
//   entries: Array<{ path; note?; change?; from? }>
// Paths are /-separated with no leading "./" or "/"; a trailing "/" marks an
// explicit directory entry. Entries keep stable ordering: add appends,
// rename patches in place.
// ---------------------------------------------------------------------------

export const FILE_TREE_CHANGES = ["added", "removed", "modified", "renamed"] as const;

export type FileTreeChange = (typeof FILE_TREE_CHANGES)[number];

export type FileTreeEntry = {
  path: string;
  note?: string;
  change?: FileTreeChange;
  /** Previous path — used with change: "renamed". */
  from?: string;
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
    entries.push(entry);
  }
  return entries;
}

function validateTreePath(value: string, name: string, issues: DocValidationIssue[]): boolean {
  if (value.startsWith("./")) {
    issues.push(paramIssue(name, `File-tree paths must not start with "./": "${value}".`));
    return false;
  }
  if (value.startsWith("/")) {
    issues.push(paramIssue(name, `File-tree paths are relative (no leading "/"): "${value}".`));
    return false;
  }
  const body = value.endsWith("/") ? value.slice(0, -1) : value;
  if (body.length === 0 || body.split("/").some((segment) => segment.length === 0)) {
    issues.push(paramIssue(name, `File-tree path has empty segments: "${value}".`));
    return false;
  }
  return true;
}

function optionalChange(
  params: Record<string, unknown>,
  name: string,
  issues: DocValidationIssue[],
): FileTreeChange | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (!isFileTreeChange(value)) {
    issues.push(
      paramIssue(name, `"${name}" must be one of ${FILE_TREE_CHANGES.map((c) => `"${c}"`).join(" | ")}.`),
    );
    return undefined;
  }
  return value;
}

/** `undefined` = leave untouched, `null` = clear the field. */
function optionalChangeOrNull(
  params: Record<string, unknown>,
  name: string,
  issues: DocValidationIssue[],
): FileTreeChange | null | undefined {
  if (params[name] === null) return null;
  return optionalChange(params, name, issues);
}

const fileTreeAddEntry: BlockActionDefinition = {
  action: "file-tree.addEntry",
  blockType: "file-tree",
  description: "Append a path entry (optional note and change marker) to the file tree.",
  params: [
    {
      name: "path",
      type: "string",
      required: true,
      description: '/-separated path, no leading "./"; a trailing "/" marks an explicit directory.',
    },
    { name: "note", type: "string", required: false, description: "Short annotation rendered after the path." },
    {
      name: "change",
      type: "string",
      required: false,
      description: 'Change marker: "added" | "removed" | "modified" | "renamed".',
    },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const path = requireString(params, "path", issues);
    if (path !== undefined) validateTreePath(path, "path", issues);
    const note = optionalString(params, "note", issues);
    const change = optionalChange(params, "change", issues);
    if (issues.length > 0) return { ok: false, issues };

    const entries = readFileTreeEntries(block);
    if (entries.some((entry) => entry.path === path)) {
      return failWith(paramIssue("path", `File-tree entry "${path}" already exists.`));
    }
    const entry: FileTreeEntry = { path: path as string };
    if (note !== undefined) entry.note = note;
    if (change !== undefined) entry.change = change;
    return { ok: true, props: { entries: [...entries, entry] } };
  },
};

const fileTreeRemoveEntry: BlockActionDefinition = {
  action: "file-tree.removeEntry",
  blockType: "file-tree",
  description: "Remove the entry with the given path from the file tree.",
  params: [
    { name: "path", type: "string", required: true, description: "Exact path of the entry to remove." },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const path = requireString(params, "path", issues);
    if (issues.length > 0) return { ok: false, issues };

    const entries = readFileTreeEntries(block);
    const index = entries.findIndex((entry) => entry.path === path);
    if (index === -1) {
      return failWith(paramIssue("path", `File-tree entry "${path}" does not exist.`));
    }
    return { ok: true, props: { entries: entries.filter((_, i) => i !== index) } };
  },
};

const fileTreeUpdateEntry: BlockActionDefinition = {
  action: "file-tree.updateEntry",
  blockType: "file-tree",
  description: "Patch an entry's note/change/from, or rename it via newPath (in place).",
  params: [
    { name: "path", type: "string", required: true, description: "Exact path of the entry to patch." },
    { name: "note", type: "string", required: false, description: "New note; pass null to clear." },
    { name: "change", type: "string", required: false, description: "New change marker; pass null to clear." },
    { name: "from", type: "string", required: false, description: "Previous path (for renamed); pass null to clear." },
    { name: "newPath", type: "string", required: false, description: "Rename the entry to this path (kept in place)." },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const path = requireString(params, "path", issues);
    const note = optionalStringOrNull(params, "note", issues);
    const change = optionalChangeOrNull(params, "change", issues);
    const from = optionalStringOrNull(params, "from", issues);
    const newPath = optionalString(params, "newPath", issues);
    if (newPath !== undefined) validateTreePath(newPath, "newPath", issues);
    if (issues.length > 0) return { ok: false, issues };

    const entries = readFileTreeEntries(block);
    const index = entries.findIndex((entry) => entry.path === path);
    if (index === -1) {
      return failWith(paramIssue("path", `File-tree entry "${path}" does not exist.`));
    }
    if (
      newPath !== undefined &&
      newPath !== path &&
      entries.some((entry, i) => i !== index && entry.path === newPath)
    ) {
      return failWith(paramIssue("newPath", `File-tree entry "${newPath}" already exists.`));
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
};

// ---------------------------------------------------------------------------
// STRUCTURED-TABLE — props contract: { columns: string[], rows: string[][] }.
// ---------------------------------------------------------------------------

function readTableColumns(block: DocBlock): string[] {
  const raw = block.props.columns;
  return Array.isArray(raw) ? raw.filter((column): column is string => typeof column === "string") : [];
}

function readTableRows(block: DocBlock): string[][] {
  const raw = block.props.rows;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => (typeof cell === "string" ? cell : String(cell ?? ""))));
}

/** Pads with `fill` / truncates a copy of `row` to exactly `length` cells. */
function normalizeRow(row: string[], length: number, fill = ""): string[] {
  const next = row.slice(0, length);
  while (next.length < length) next.push(fill);
  return next;
}

/** Resolves "exactly one of column | columnIndex" to a column index. */
function resolveColumn(
  params: Record<string, unknown>,
  columns: string[],
  issues: DocValidationIssue[],
): number | undefined {
  const hasColumn = params.column !== undefined;
  const hasColumnIndex = params.columnIndex !== undefined;
  if (hasColumn === hasColumnIndex) {
    issues.push(paramIssue("column", 'Provide exactly one of "column" or "columnIndex".'));
    return undefined;
  }
  if (hasColumn) {
    const name = requireString(params, "column", issues);
    if (name === undefined) return undefined;
    const index = columns.indexOf(name);
    if (index === -1) {
      issues.push(
        paramIssue("column", `Unknown column "${name}". Columns: ${columns.map((c) => `"${c}"`).join(", ")}.`),
      );
      return undefined;
    }
    return index;
  }
  return requireInteger(params, "columnIndex", issues, 0, columns.length - 1);
}

const tableAddRow: BlockActionDefinition = {
  action: "structured-table.addRow",
  blockType: "structured-table",
  description: "Insert a row (cells padded/truncated to the column count); index defaults to the end.",
  params: [
    { name: "cells", type: "array", required: true, description: "Cell strings, in column order." },
    { name: "index", type: "number", required: false, description: "Insert position in [0, rows.length]; default end." },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const rawCells = params.cells;
    const cells: string[] = [];
    if (!Array.isArray(rawCells)) {
      issues.push(paramIssue("cells", '"cells" is required and must be an array of strings.'));
    } else {
      for (const [i, cell] of rawCells.entries()) {
        if (typeof cell !== "string") {
          issues.push({ path: `$.params.cells[${i}]`, message: "Cell must be a string." });
        } else {
          cells.push(cell);
        }
      }
    }
    const columns = readTableColumns(block);
    const rows = readTableRows(block);
    const index = optionalInteger(params, "index", issues, 0, rows.length, rows.length);
    if (issues.length > 0) return { ok: false, issues };

    const next = [...rows];
    next.splice(index, 0, normalizeRow(cells, columns.length));
    return { ok: true, props: { rows: next } };
  },
};

const tableRemoveRow: BlockActionDefinition = {
  action: "structured-table.removeRow",
  blockType: "structured-table",
  description: "Remove the row at the given index.",
  params: [
    { name: "index", type: "number", required: true, description: "Row index in [0, rows.length - 1]." },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const rows = readTableRows(block);
    const index = requireInteger(params, "index", issues, 0, rows.length - 1);
    if (issues.length > 0) return { ok: false, issues };
    return { ok: true, props: { rows: rows.filter((_, i) => i !== index) } };
  },
};

const tableUpdateCell: BlockActionDefinition = {
  action: "structured-table.updateCell",
  blockType: "structured-table",
  description: "Set one cell, addressing the column by name (column) or position (columnIndex).",
  params: [
    { name: "rowIndex", type: "number", required: true, description: "Row index in [0, rows.length - 1]." },
    { name: "column", type: "string", required: false, description: "Column name — exactly one of column/columnIndex." },
    { name: "columnIndex", type: "number", required: false, description: "Column position — exactly one of column/columnIndex." },
    { name: "value", type: "string", required: true, description: "New cell value." },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const columns = readTableColumns(block);
    const rows = readTableRows(block);
    const rowIndex = requireInteger(params, "rowIndex", issues, 0, rows.length - 1);
    const columnIndex = resolveColumn(params, columns, issues);
    const value = params.value;
    if (typeof value !== "string") {
      issues.push(paramIssue("value", '"value" is required and must be a string.'));
    }
    if (issues.length > 0) return { ok: false, issues };

    const next = rows.map((row) => [...row]);
    const row = normalizeRow(next[rowIndex as number], columns.length);
    row[columnIndex as number] = value as string;
    next[rowIndex as number] = row;
    return { ok: true, props: { rows: next } };
  },
};

const tableAddColumn: BlockActionDefinition = {
  action: "structured-table.addColumn",
  blockType: "structured-table",
  description: "Insert a column (default at the end), extending every row with the fill value.",
  params: [
    { name: "name", type: "string", required: true, description: "New column name (must not already exist)." },
    { name: "index", type: "number", required: false, description: "Insert position in [0, columns.length]; default end." },
    { name: "fill", type: "string", required: false, description: 'Cell value for existing rows; default "".' },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const name = requireString(params, "name", issues);
    const columns = readTableColumns(block);
    if (name !== undefined && columns.includes(name)) {
      issues.push(paramIssue("name", `Column "${name}" already exists.`));
    }
    const index = optionalInteger(params, "index", issues, 0, columns.length, columns.length);
    const fill = optionalString(params, "fill", issues) ?? "";
    if (issues.length > 0) return { ok: false, issues };

    const nextColumns = [...columns];
    nextColumns.splice(index, 0, name as string);
    const nextRows = readTableRows(block).map((row) => {
      const padded = normalizeRow(row, columns.length);
      padded.splice(index, 0, fill);
      return padded;
    });
    return { ok: true, props: { columns: nextColumns, rows: nextRows } };
  },
};

const tableRemoveColumn: BlockActionDefinition = {
  action: "structured-table.removeColumn",
  blockType: "structured-table",
  description: "Remove a column by name (column) or position (columnIndex), shrinking every row.",
  params: [
    { name: "column", type: "string", required: false, description: "Column name — exactly one of column/columnIndex." },
    { name: "columnIndex", type: "number", required: false, description: "Column position — exactly one of column/columnIndex." },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const columns = readTableColumns(block);
    const columnIndex = resolveColumn(params, columns, issues);
    if (issues.length > 0) return { ok: false, issues };

    const nextColumns = columns.filter((_, i) => i !== columnIndex);
    const nextRows = readTableRows(block).map((row) =>
      normalizeRow(row, columns.length).filter((_, i) => i !== columnIndex),
    );
    return { ok: true, props: { columns: nextColumns, rows: nextRows } };
  },
};

// ---------------------------------------------------------------------------
// INTERACTION-SURFACE — props contract:
//   operations: [{ name, description?, params?, returns?, kind? }]
// where params is [{ name, type?, required?, description? }] and kind is one
// of "action" | "query" | "event" (actions are the default reading). An
// interaction-surface describes the ways a state/system can be changed or
// queried — operation signatures, NOT HTTP endpoints. Operations keep stable
// ordering: add appends, update patches in place.
// ---------------------------------------------------------------------------

export const INTERACTION_SURFACE_KINDS = ["action", "query", "event"] as const;

export type InteractionSurfaceKind = (typeof INTERACTION_SURFACE_KINDS)[number];

export type InteractionSurfaceParam = {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
};

export type InteractionSurfaceOperation = {
  /** Operation signature name, e.g. "file-tree.addEntry". */
  name: string;
  description?: string;
  params?: InteractionSurfaceParam[];
  returns?: string;
  kind?: InteractionSurfaceKind;
};

function isInteractionSurfaceKind(value: unknown): value is InteractionSurfaceKind {
  return (
    typeof value === "string" &&
    (INTERACTION_SURFACE_KINDS as readonly string[]).includes(value)
  );
}

/** Builds a plain-JSON param object with only the defined keys. */
function operationParamToProps(param: InteractionSurfaceParam): Record<string, unknown> {
  const out: Record<string, unknown> = { name: param.name };
  if (param.type !== undefined) out.type = param.type;
  if (param.required !== undefined) out.required = param.required;
  if (param.description !== undefined) out.description = param.description;
  return out;
}

function operationToProps(operation: InteractionSurfaceOperation): Record<string, unknown> {
  const out: Record<string, unknown> = { name: operation.name };
  if (operation.description !== undefined) out.description = operation.description;
  if (operation.params !== undefined) out.params = operation.params.map(operationParamToProps);
  if (operation.returns !== undefined) out.returns = operation.returns;
  if (operation.kind !== undefined) out.kind = operation.kind;
  return out;
}

/** Tolerant read: skips malformed entries, always returns fresh objects. */
export function readInteractionSurfaceOperations(block: DocBlock): InteractionSurfaceOperation[] {
  const raw = block.props.operations;
  if (!Array.isArray(raw)) return [];
  const operations: InteractionSurfaceOperation[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.name !== "string" || item.name.length === 0) continue;
    const operation: InteractionSurfaceOperation = { name: item.name };
    if (typeof item.description === "string" && item.description.length > 0) {
      operation.description = item.description;
    }
    if (Array.isArray(item.params)) {
      const params: InteractionSurfaceParam[] = [];
      for (const rawParam of item.params) {
        if (!isRecord(rawParam) || typeof rawParam.name !== "string" || rawParam.name.length === 0) continue;
        const param: InteractionSurfaceParam = { name: rawParam.name };
        if (typeof rawParam.type === "string") param.type = rawParam.type;
        if (typeof rawParam.required === "boolean") param.required = rawParam.required;
        if (typeof rawParam.description === "string") param.description = rawParam.description;
        params.push(param);
      }
      operation.params = params;
    }
    if (typeof item.returns === "string" && item.returns.length > 0) operation.returns = item.returns;
    if (isInteractionSurfaceKind(item.kind)) operation.kind = item.kind;
    operations.push(operation);
  }
  return operations;
}

function operationsPatch(operations: InteractionSurfaceOperation[]): Record<string, unknown> {
  return { operations: operations.map(operationToProps) };
}

/**
 * Validates a `params` array of `{ name, type?, required?, description? }`
 * records at `$.params.<pathBase>[i].*`; returns the parsed array, or
 * undefined when any element is malformed (issues pushed).
 */
function validateOperationParams(
  value: unknown,
  pathBase: string,
  issues: DocValidationIssue[],
): InteractionSurfaceParam[] | undefined {
  if (!Array.isArray(value)) {
    issues.push(
      paramIssue(pathBase, `"${pathBase}" must be an array of { name, type?, required?, description? }.`),
    );
    return undefined;
  }
  const params: InteractionSurfaceParam[] = [];
  let valid = true;
  for (const [index, rawParam] of value.entries()) {
    const path = `${pathBase}[${index}]`;
    if (!isRecord(rawParam)) {
      issues.push(paramIssue(path, "Param must be an object with a \"name\"."));
      valid = false;
      continue;
    }
    if (typeof rawParam.name !== "string" || rawParam.name.length === 0) {
      issues.push(paramIssue(`${path}.name`, '"name" is required and must be a non-empty string.'));
      valid = false;
    }
    if (rawParam.type !== undefined && typeof rawParam.type !== "string") {
      issues.push(paramIssue(`${path}.type`, '"type" must be a string when provided.'));
      valid = false;
    }
    if (rawParam.required !== undefined && typeof rawParam.required !== "boolean") {
      issues.push(paramIssue(`${path}.required`, '"required" must be a boolean when provided.'));
      valid = false;
    }
    if (rawParam.description !== undefined && typeof rawParam.description !== "string") {
      issues.push(paramIssue(`${path}.description`, '"description" must be a string when provided.'));
      valid = false;
    }
    if (!valid) continue;
    const param: InteractionSurfaceParam = { name: rawParam.name as string };
    if (rawParam.type !== undefined) param.type = rawParam.type as string;
    if (rawParam.required !== undefined) param.required = rawParam.required as boolean;
    if (rawParam.description !== undefined) param.description = rawParam.description as string;
    params.push(param);
  }
  return valid ? params : undefined;
}

function optionalKind(
  params: Record<string, unknown>,
  name: string,
  issues: DocValidationIssue[],
): InteractionSurfaceKind | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (!isInteractionSurfaceKind(value)) {
    issues.push(
      paramIssue(
        name,
        `"${name}" must be one of ${INTERACTION_SURFACE_KINDS.map((kind) => `"${kind}"`).join(" | ")}.`,
      ),
    );
    return undefined;
  }
  return value;
}

const interactionSurfaceAddOperation: BlockActionDefinition = {
  action: "interaction-surface.addOperation",
  blockType: "interaction-surface",
  description:
    "Append an operation signature ({ name, description?, params?, returns?, kind? }) to the surface.",
  params: [
    { name: "name", type: "string", required: true, description: 'Operation name, e.g. "file-tree.addEntry" (must not already exist).' },
    { name: "description", type: "string", required: false, description: "One-line description of what the operation does." },
    { name: "params", type: "array", required: false, description: "Signature params: [{ name, type?, required?, description? }]." },
    { name: "returns", type: "string", required: false, description: "What the operation returns/yields." },
    { name: "kind", type: "string", required: false, description: 'Operation kind: "action" | "query" | "event" (default reading: action).' },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const name = requireString(params, "name", issues);
    const description = optionalString(params, "description", issues);
    const operationParams =
      params.params === undefined ? undefined : validateOperationParams(params.params, "params", issues);
    const returns = optionalString(params, "returns", issues);
    const kind = optionalKind(params, "kind", issues);
    if (issues.length > 0) return { ok: false, issues };

    const operations = readInteractionSurfaceOperations(block);
    if (operations.some((operation) => operation.name === name)) {
      return failWith(paramIssue("name", `Operation "${name}" already exists.`));
    }
    const operation: InteractionSurfaceOperation = { name: name as string };
    if (description !== undefined) operation.description = description;
    if (operationParams !== undefined) operation.params = operationParams;
    if (returns !== undefined) operation.returns = returns;
    if (kind !== undefined) operation.kind = kind;
    return { ok: true, props: operationsPatch([...operations, operation]) };
  },
};

const interactionSurfaceUpdateOperation: BlockActionDefinition = {
  action: "interaction-surface.updateOperation",
  blockType: "interaction-surface",
  description:
    "Patch an operation (rename via patch.name; null clears description/params/returns/kind).",
  params: [
    { name: "name", type: "string", required: true, description: "Current operation name." },
    { name: "patch", type: "object", required: true, description: "Partial operation; patch.name renames, null clears." },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const name = requireString(params, "name", issues);
    const patch = params.patch;
    let newName: string | undefined;
    let description: string | null | undefined;
    let operationParams: InteractionSurfaceParam[] | null | undefined;
    let returns: string | null | undefined;
    let kind: InteractionSurfaceKind | null | undefined;
    if (!isRecord(patch)) {
      issues.push(paramIssue("patch", '"patch" is required and must be an object.'));
    } else {
      if (patch.name !== undefined) {
        if (typeof patch.name !== "string" || patch.name.length === 0) {
          issues.push(paramIssue("patch.name", '"patch.name" must be a non-empty string.'));
        } else {
          newName = patch.name;
        }
      }
      description = optionalStringOrNull(patch, "description", issues);
      returns = optionalStringOrNull(patch, "returns", issues);
      if (patch.params !== undefined) {
        operationParams =
          patch.params === null ? null : validateOperationParams(patch.params, "patch.params", issues);
      }
      if (patch.kind !== undefined) {
        kind = patch.kind === null ? null : optionalKind(patch, "kind", issues);
      }
    }
    // The optionalStringOrNull helper reports at "$.params.<key>"; remap the
    // two patch-scoped keys so issue paths point inside the patch object.
    for (const issue of issues) {
      if (issue.path === "$.params.description") issue.path = "$.params.patch.description";
      if (issue.path === "$.params.returns") issue.path = "$.params.patch.returns";
      if (issue.path === "$.params.kind") issue.path = "$.params.patch.kind";
    }
    if (issues.length > 0) return { ok: false, issues };

    const operations = readInteractionSurfaceOperations(block);
    const index = operations.findIndex((operation) => operation.name === name);
    if (index === -1) {
      return failWith(paramIssue("name", `Operation "${name}" does not exist.`));
    }
    if (
      newName !== undefined &&
      newName !== name &&
      operations.some((operation, i) => i !== index && operation.name === newName)
    ) {
      return failWith(paramIssue("patch.name", `Operation "${newName}" already exists.`));
    }

    const updated: InteractionSurfaceOperation = { ...operations[index] };
    if (newName !== undefined) updated.name = newName;
    if (description !== undefined) {
      if (description === null) delete updated.description;
      else updated.description = description;
    }
    if (operationParams !== undefined) {
      if (operationParams === null) delete updated.params;
      else updated.params = operationParams;
    }
    if (returns !== undefined) {
      if (returns === null) delete updated.returns;
      else updated.returns = returns;
    }
    if (kind !== undefined) {
      if (kind === null) delete updated.kind;
      else updated.kind = kind;
    }

    const next = [...operations];
    next[index] = updated;
    return { ok: true, props: operationsPatch(next) };
  },
};

const interactionSurfaceRemoveOperation: BlockActionDefinition = {
  action: "interaction-surface.removeOperation",
  blockType: "interaction-surface",
  description: "Remove the operation with the given name from the surface.",
  params: [
    { name: "name", type: "string", required: true, description: "Exact name of the operation to remove." },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const name = requireString(params, "name", issues);
    if (issues.length > 0) return { ok: false, issues };

    const operations = readInteractionSurfaceOperations(block);
    if (!operations.some((operation) => operation.name === name)) {
      return failWith(paramIssue("name", `Operation "${name}" does not exist.`));
    }
    return {
      ok: true,
      props: operationsPatch(operations.filter((operation) => operation.name !== name)),
    };
  },
};

// ---------------------------------------------------------------------------
// CODE — structured `annotations` prop: [{ lines, label?, note }].
// (The code SOURCE stays on generic text ops — see BLOCK_TYPE_CATEGORY.)
// ---------------------------------------------------------------------------

export type CodeAnnotation = { lines: string; label?: string; note: string };

/** Tolerant read: skips malformed entries, always returns fresh objects. */
export function readCodeAnnotations(block: DocBlock): CodeAnnotation[] {
  const raw = block.props.annotations;
  if (!Array.isArray(raw)) return [];
  const annotations: CodeAnnotation[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.lines !== "string" || typeof item.note !== "string") continue;
    const annotation: CodeAnnotation = { lines: item.lines, note: item.note };
    if (typeof item.label === "string" && item.label.length > 0) annotation.label = item.label;
    annotations.push(annotation);
  }
  return annotations;
}

const codeSetAnnotation: BlockActionDefinition = {
  action: "code.setAnnotation",
  blockType: "code",
  description: 'Upsert a line annotation keyed by its exact "lines" string (e.g. "4-9").',
  params: [
    { name: "lines", type: "string", required: true, description: 'Line range key, e.g. "1" or "4-9".' },
    { name: "note", type: "string", required: true, description: "Annotation body." },
    { name: "label", type: "string", required: false, description: "Optional short label." },
  ],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const lines = requireString(params, "lines", issues);
    const note = params.note;
    if (typeof note !== "string" || note.length === 0) {
      issues.push(paramIssue("note", '"note" is required and must be a non-empty string.'));
    }
    const label = optionalString(params, "label", issues);
    if (issues.length > 0) return { ok: false, issues };

    const annotation: CodeAnnotation = { lines: lines as string, note: note as string };
    if (label !== undefined) annotation.label = label;

    const annotations = readCodeAnnotations(block);
    const index = annotations.findIndex((candidate) => candidate.lines === lines);
    const next = [...annotations];
    if (index === -1) next.push(annotation);
    else next[index] = annotation;
    return { ok: true, props: { annotations: next } };
  },
};

const codeRemoveAnnotation: BlockActionDefinition = {
  action: "code.removeAnnotation",
  blockType: "code",
  description: 'Remove the annotation whose "lines" key matches exactly.',
  params: [{ name: "lines", type: "string", required: true, description: "Line range key of the annotation." }],
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const lines = requireString(params, "lines", issues);
    if (issues.length > 0) return { ok: false, issues };

    const annotations = readCodeAnnotations(block);
    if (!annotations.some((candidate) => candidate.lines === lines)) {
      return failWith(paramIssue("lines", `Code annotation for lines "${lines}" does not exist.`));
    }
    return {
      ok: true,
      props: { annotations: annotations.filter((candidate) => candidate.lines !== lines) },
    };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ALL_BLOCK_ACTIONS: readonly BlockActionDefinition[] = [
  fileTreeAddEntry,
  fileTreeRemoveEntry,
  fileTreeUpdateEntry,
  tableAddRow,
  tableRemoveRow,
  tableUpdateCell,
  tableAddColumn,
  tableRemoveColumn,
  interactionSurfaceAddOperation,
  interactionSurfaceUpdateOperation,
  interactionSurfaceRemoveOperation,
  codeSetAnnotation,
  codeRemoveAnnotation,
];

export const BLOCK_ACTIONS: ReadonlyMap<string, BlockActionDefinition> = new Map(
  ALL_BLOCK_ACTIONS.map((definition) => [definition.action, definition]),
);

export function getBlockAction(action: string): BlockActionDefinition | undefined {
  return BLOCK_ACTIONS.get(action);
}

export function listBlockActions(blockType?: DocBlockType): BlockActionDefinition[] {
  const all = [...BLOCK_ACTIONS.values()];
  return blockType === undefined ? all : all.filter((definition) => definition.blockType === blockType);
}
