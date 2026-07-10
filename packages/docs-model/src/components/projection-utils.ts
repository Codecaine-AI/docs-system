"use client";

import type { DocBlock } from "../doc-schema";

export function stringProp(block: DocBlock, key: string): string | undefined {
  const value = block.props[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function numberProp(block: DocBlock, key: string): number | undefined {
  const value = block.props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function blockquotePrefix(text: string): string {
  if (!text) return ">";
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}
