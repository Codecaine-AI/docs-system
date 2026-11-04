"use client";

/**
 * Deterministic JSON pretty-printer with a path→line-range map. One canon,
 * two consumers: the state-shape agent view emits `lines` inside its
 * ```json fence, and docs-viewer consumes `ranges` to compute L#–# chips
 * and hover extents for the example pane.
 */

export type JsonLineRange = {
  /** Dot-path for object keys, [i] for array indices, e.g. "fields[0].name". */
  path: string;
  /** 1-based line the entry's key/opening token appears on. */
  start: number;
  /** 1-based line of the entry's closing token (start for single-line values). */
  end: number;
};

export type JsonLinesResult = {
  lines: string[];
  ranges: JsonLineRange[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Mirrors JSON.stringify: undefined/function/symbol props are omitted. */
function isSerializableEntry(value: unknown): boolean {
  return JSON.stringify(value) !== undefined;
}

function joinKey(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

export type JsonLinesOptions = {
  /**
   * Print a non-empty array or object whose entries are all primitives on one
   * line when that line fits in this many columns, indent included. Omit it
   * for the canonical form.
   */
  inlineWidth?: number;
};

const isPrimitive = (value: unknown): boolean => value === null || typeof value !== "object";

/** The one-line form of an array or object of primitives, with its child paths; null when it does not qualify. */
function inlineForm(value: unknown, path: string): { text: string; children: string[] } | null {
  if (Array.isArray(value)) {
    if (value.length === 0 || !value.every(isPrimitive)) return null;
    return { text: `[${value.map((item) => JSON.stringify(item) ?? "null").join(", ")}]`, children: value.map((_, index) => `${path}[${index}]`) };
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, entry]) => isSerializableEntry(entry));
    if (entries.length === 0 || !entries.every(([, entry]) => isPrimitive(entry))) return null;
    return {
      text: `{ ${entries.map(([key, entry]) => `${JSON.stringify(key)}: ${JSON.stringify(entry)}`).join(", ")} }`,
      children: entries.map(([key]) => joinKey(path, key)),
    };
  }
  return null;
}

function emitValue(
  value: unknown,
  path: string,
  indent: string,
  prefix: string,
  suffix: string,
  lines: string[],
  ranges: JsonLineRange[],
  options: JsonLinesOptions = {},
): void {
  // Pre-order recording: parents precede children, ranges sort by start line.
  const range: JsonLineRange | undefined =
    path === "" ? undefined : { path, start: lines.length + 1, end: lines.length + 1 };
  if (range) ranges.push(range);

  const inline = options.inlineWidth === undefined ? null : inlineForm(value, path);
  if (inline && `${indent}${prefix}${inline.text}${suffix}`.length <= options.inlineWidth!) {
    lines.push(`${indent}${prefix}${inline.text}${suffix}`);
    for (const child of inline.children) ranges.push({ path: child, start: lines.length, end: lines.length });
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${indent}${prefix}[]${suffix}`);
    } else {
      lines.push(`${indent}${prefix}[`);
      value.forEach((item, index) => {
        emitValue(
          item,
          `${path}[${index}]`,
          `${indent}  `,
          "",
          index < value.length - 1 ? "," : "",
          lines,
          ranges,
          options,
        );
      });
      lines.push(`${indent}]${suffix}`);
    }
  } else if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, entry]) => isSerializableEntry(entry));
    if (entries.length === 0) {
      lines.push(`${indent}${prefix}{}${suffix}`);
    } else {
      lines.push(`${indent}${prefix}{`);
      entries.forEach(([key, entry], index) => {
        emitValue(
          entry,
          joinKey(path, key),
          `${indent}  `,
          `${JSON.stringify(key)}: `,
          index < entries.length - 1 ? "," : "",
          lines,
          ranges,
          options,
        );
      });
      lines.push(`${indent}}${suffix}`);
    }
  } else {
    // JSON.stringify canon for primitives (string escaping, NaN → null, …);
    // undefined only reaches here as an array element, which JSON prints as null.
    lines.push(`${indent}${prefix}${JSON.stringify(value) ?? "null"}${suffix}`);
  }

  if (range) range.end = lines.length;
}

/**
 * Canonical 2-space-indent pretty print (objects/arrays multi-line except
 * empty; byte-identical to `JSON.stringify(value, null, 2)` for JSON values),
 * recording for every object key and array element its 1-based start line
 * (where its key/opening token appears) and end line (its closing token's
 * line). Determinism: same value → same bytes and ranges; object keys emit
 * in insertion order, exactly as JSON.parse/JSON.stringify preserve them.
 * `options.inlineWidth` folds short arrays and objects of primitives onto one
 * line (the read surface's example pane); the agent view keeps the canon.
 */
export function printJsonLines(value: unknown, options: JsonLinesOptions = {}): JsonLinesResult {
  const lines: string[] = [];
  const ranges: JsonLineRange[] = [];
  emitValue(value, "", "", "", "", lines, ranges, options);
  return { lines, ranges };
}
