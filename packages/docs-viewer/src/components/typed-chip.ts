/**
 * Typed inline code (theme lab, THEME-LAB-2 §3). Every backtick chip shares
 * one soft neutral background; only its TEXT color says what the code is, so
 * a line full of chips reads like highlighted code rather than a row of
 * identical boxes. The colors are the page-level syntax roles
 * (`--docs-syn-*`, semantic.css ROLE TOKENS); each literal fallback is the
 * light (app palette) value, for renders without semantic.css.
 */
export type ChipKind = "path" | "type" | "call" | "literal" | "prop" | "other";

/**
 * The ONE inline-code classifier: every typed chip in the viewer (delta-span
 * and markdown inline code, the editor's chip decorations, process-outline,
 * flow-strip, stack) classifies through `chipKind`, so a chip reads the same
 * wherever it sits.
 */

/** A camelCase name starting with one of these reads as a function / method. */
const VERBS =
  /^(get|set|add|remove|update|read|write|validate|project|render|create|delete|apply|resolve|parse|build|load|fetch|use|handle|make|to|is|has|find|compute|format|normalize|register|insert|move|split|merge|require|run|emit|open|close|save|select|toggle|reset|init|list|check|map|filter|reduce|serialize|commit|restore|stage|accept|reject)[A-Z0-9_]/;
/** A bare file name (no slash) still reads as a path when it ends in a known extension. */
const EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|html|py|rs|go|ya?ml|toml|sh|txt|svg|png|jpe?g|gif|webp|mp4|lock|sql|db)$/i;
const QUOTED = /^(["'`]).*\1$/;
const NUMBER = /^-?\d+(\.\d+)?(px|em|rem|ms|s|%|ch|vh|vw)?$/;
const KEYWORD_LITERAL = /^(true|false|null|undefined|NaN|Infinity)$/;
/** `name(...)`, `obj.method()`, `ns.fn(arg)`. */
const CALL_EXPRESSION = /^[\w$.-]*[A-Za-z0-9_$]\(.*\)$/;
/** `editor.setContent` style member access whose last segment is a verb-led name. */
const MEMBER_CALL = /^[a-z][\w-]*\.[a-z][A-Za-z0-9]*$/;
const CAMEL_CASE = /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/;
const PASCAL_CASE = /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)*$/;
/** `kind`, `props.level`, `snake_case`, `kebab-name`. */
const KEY_PATH = /^[a-z][a-z0-9_-]*(\.[a-z][\w-]*)*$/;
/** A CSS custom property, e.g. `--docs-chip-bg`. */
const CUSTOM_PROPERTY = /^--[A-Za-z0-9][\w-]*$/;

/** What a chip's text is: a path, a type, a call, a literal, a property, or none of those. */
export function chipKind(raw: string): ChipKind {
  const text = raw.trim();
  if (!text) return "other";
  if (QUOTED.test(text) || NUMBER.test(text) || KEYWORD_LITERAL.test(text)) return "literal";
  if (text.includes("/") || (EXT.test(text) && !/\s/.test(text))) return "path";
  if (CALL_EXPRESSION.test(text)) return "call";
  if (MEMBER_CALL.test(text) && VERBS.test(text.split(".").pop() ?? "")) return "call";
  if (CAMEL_CASE.test(text)) return VERBS.test(text) ? "call" : "prop";
  if (PASCAL_CASE.test(text)) return "type";
  if (KEY_PATH.test(text) || CUSTOM_PROPERTY.test(text)) return "prop";
  return "other";
}

const CHIP_KIND_COLOR: Record<ChipKind, string> = {
  path: "var(--docs-syn-string,#9d530d)",
  type: "var(--docs-syn-type,#805f01)",
  call: "var(--docs-syn-fn,#0b6e99)",
  literal: "var(--docs-syn-number,#26744f)",
  prop: "var(--docs-syn-prop,#0d7164)",
  other: "var(--docs-chip-fg,#1f1f1f)",
};

/** One color rule per kind for chips matched by `selector` (which carry `data-chip-kind`). */
export function typedChipColorCss(selector: string): string {
  return (Object.entries(CHIP_KIND_COLOR) as [ChipKind, string][])
    .map(([kind, color]) => `${selector}[data-chip-kind="${kind}"] { color:${color}; }`)
    .join("\n");
}
