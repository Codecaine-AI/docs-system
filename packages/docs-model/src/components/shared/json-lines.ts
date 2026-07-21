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

function emitValue(
  value: unknown,
  path: string,
  indent: string,
  prefix: string,
  suffix: string,
  lines: string[],
  ranges: JsonLineRange[],
): void {
  // Pre-order recording: parents precede children, ranges sort by start line.
  const range: JsonLineRange | undefined =
    path === "" ? undefined : { path, start: lines.length + 1, end: lines.length + 1 };
  if (range) ranges.push(range);

  if (Array.isArray(value)) {
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
 */
export function printJsonLines(value: unknown): JsonLinesResult {
  const lines: string[] = [];
  const ranges: JsonLineRange[] = [];
  emitValue(value, "", "", "", "", lines, ranges);
  return { lines, ranges };
}
