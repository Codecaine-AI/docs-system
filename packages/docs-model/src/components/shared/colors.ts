"use client";

import { Type, type SchemaOptions } from "@sinclair/typebox";

/**
 * The docs color roster. Each name has four theme tokens: `--docs-c-<name>`
 * (text-safe ink), `--docs-c-<name>-soft` (wash), `--docs-c-<name>-line`
 * (rule) and `--docs-c-<name>-solid` (tile/fill).
 */
export const DOCS_COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export type DocsColor = (typeof DOCS_COLORS)[number];

export function isDocsColor(value: unknown): value is DocsColor {
  return typeof value === "string" && (DOCS_COLORS as readonly string[]).includes(value);
}

/** The roster names as one quoted list for schema descriptions: `"gray" | "red" | ...`. */
export const DOCS_COLOR_LIST = DOCS_COLORS.map((color) => `"${color}"`).join(" | ");

/** The roster as a TypeBox literal union; the description lists the names unless one is given. */
export function docsColorSchema(options: SchemaOptions = {}) {
  return Type.Union(
    DOCS_COLORS.map((color) => Type.Literal(color)),
    { description: `Docs color: ${DOCS_COLOR_LIST}.`, ...options },
  );
}
