"use client";

import { cloneField } from "../shared/field";
import type { Field } from "../shared/field";

export function fieldsPatch(fields: Field[]): Record<string, unknown> {
  return { fields: fields.map(cloneField) };
}

/** "" (or omitted) addresses the root fields array; otherwise dot-separated field names. */
export function splitFieldPath(path: string | undefined): string[] {
  if (path === undefined || path === "") return [];
  return path.split(".");
}

/**
 * Resolves a dot-path to the CHILD list of the named field ([] = the root
 * list), creating the field's `fields` array when absent so callers can
 * insert into it. Returns undefined when a segment does not resolve.
 */
export function resolveChildList(fields: Field[], segments: string[]): Field[] | undefined {
  let siblings = fields;
  for (const segment of segments) {
    const node = siblings.find((field) => field.name === segment);
    if (!node) return undefined;
    node.fields ??= [];
    siblings = node.fields;
  }
  return siblings;
}

/**
 * Resolves a dot-path to the named field node plus the sibling list holding
 * it. Returns undefined when the path does not resolve (an empty path never
 * resolves — it names the root list, not a field).
 */
export function resolveField(
  fields: Field[],
  segments: string[],
): { siblings: Field[]; index: number } | undefined {
  if (segments.length === 0) return undefined;
  let siblings = fields;
  for (const segment of segments.slice(0, -1)) {
    const node = siblings.find((field) => field.name === segment);
    if (!node?.fields) return undefined;
    siblings = node.fields;
  }
  const index = siblings.findIndex((field) => field.name === segments[segments.length - 1]);
  return index === -1 ? undefined : { siblings, index };
}

/** First duplicated sibling name anywhere in the tree, or undefined when unique throughout. */
export function duplicateFieldName(fields: readonly Field[]): string | undefined {
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.name)) return field.name;
    seen.add(field.name);
    if (field.fields) {
      const nested = duplicateFieldName(field.fields);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}
