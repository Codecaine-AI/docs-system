"use client";

import { Type } from "@sinclair/typebox";

/**
 * Shared recursive field node (state-shape fields AND interaction-surface
 * operation params): a named slot with an optional type, optionality flag,
 * description, and nested child fields. `required: false` means optional
 * (renders a `?` suffix); omitted or `true` reads as required — the same
 * convention interaction-surface params have always used.
 */
export type Field = {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
  fields?: Field[];
};

export const FieldSchema = Type.Recursive(
  (This) =>
    Type.Object(
      {
        name: Type.String({ minLength: 1 }),
        type: Type.Optional(Type.String()),
        required: Type.Optional(Type.Boolean()),
        description: Type.Optional(Type.String()),
        fields: Type.Optional(Type.Array(This)),
      },
      { additionalProperties: false },
    ),
  { $id: "Field" },
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Tolerant recursive read: skips malformed entries, always returns fresh objects. */
export function readFields(raw: unknown): Field[] {
  if (!Array.isArray(raw)) return [];
  const fields: Field[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.name !== "string" || item.name.length === 0) continue;
    const field: Field = { name: item.name };
    if (typeof item.type === "string") field.type = item.type;
    if (typeof item.required === "boolean") field.required = item.required;
    if (typeof item.description === "string") field.description = item.description;
    if (Array.isArray(item.fields)) field.fields = readFields(item.fields);
    fields.push(field);
  }
  return fields;
}

/** Builds a plain-JSON field object (recursively) with only the defined keys. */
export function cloneField(field: Field): Field {
  const out: Field = { name: field.name };
  if (field.type !== undefined) out.type = field.type;
  if (field.required !== undefined) out.required = field.required;
  if (field.description !== undefined) out.description = field.description;
  if (field.fields !== undefined) out.fields = field.fields.map(cloneField);
  return out;
}

/**
 * Field-line grammar shared by the state-shape projection and the
 * interaction-surface param detail lines: two-space indent per nesting depth,
 * `<name><? when required: false>: <type>  # <description>` — `: <type>`
 * omitted when the type is absent, `  # <description>` omitted when the
 * description is absent. Children render at +1 depth.
 */
export function fieldLines(fields: readonly Field[], depth = 0): string[] {
  return fields.flatMap((field) => {
    const optional = field.required === false ? "?" : "";
    const type = field.type ? `: ${field.type}` : "";
    const description = field.description ? `  # ${field.description}` : "";
    return [
      `${"  ".repeat(depth)}${field.name}${optional}${type}${description}`,
      ...fieldLines(field.fields ?? [], depth + 1),
    ];
  });
}
