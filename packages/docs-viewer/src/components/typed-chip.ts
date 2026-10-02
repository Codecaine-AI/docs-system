/**
 * Typed inline code (theme lab, THEME-LAB-2 §3). Every backtick chip shares
 * one soft neutral background; only its TEXT color says what the code is, so
 * a line full of chips reads like highlighted code rather than a row of
 * identical boxes. The colors are VS Code's: Light+ on the light page, Dark+
 * on the dark page (the same palette the code panels use), so a chip in
 * prose looks the way the token does in the editor.
 */
export type ChipKind = "path" | "string" | "type" | "call" | "literal" | "keyword" | "prop" | "other";

/**
 * The ONE inline-code classifier: every typed chip in the viewer (delta-span
 * and markdown inline code, the editor's chip decorations, process-outline,
 * stack) classifies through `chipKind`, so a chip reads the same
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
/** A CSS custom property, e.g. `--docs-chip-bg`, or a family glob `--docs-kind-*`. */
const CUSTOM_PROPERTY = /^--[A-Za-z0-9][\w-]*\*?$/;

/**
 * What a chip's text is: a path, a quoted string, a type, a call, a number
 * (`literal`), a keyword literal, a property, or none of those.
 */
export function chipKind(raw: string): ChipKind {
  const text = raw.trim();
  if (!text) return "other";
  if (QUOTED.test(text)) return "string";
  if (NUMBER.test(text)) return "literal";
  if (KEYWORD_LITERAL.test(text)) return "keyword";
  if (text.includes("/") || (EXT.test(text) && !/\s/.test(text))) return "path";
  if (CALL_EXPRESSION.test(text)) return "call";
  if (MEMBER_CALL.test(text) && VERBS.test(text.split(".").pop() ?? "")) return "call";
  if (CAMEL_CASE.test(text)) return VERBS.test(text) ? "call" : "prop";
  if (PASCAL_CASE.test(text)) return "type";
  if (KEY_PATH.test(text) || CUSTOM_PROPERTY.test(text)) return "prop";
  return "other";
}

/**
 * VS Code colors for chips on a page panel (not a code surface): Light+ on a
 * light page, Dark+ on a dark one, picked by the inherited `color-scheme`
 * through `light-dark()`, so no mode selector is needed. Two Light+ hues are
 * darkened 10% to keep 4.5:1 on the light chip fill (#ebebe9): type #267F99
 * -> #22728A and number #098658 -> #08794F. The dark side reads the code
 * theme's --syntax-* roles with the Dark+ value as the literal. An
 * unclassified chip is the editor's default code ink (#1F1F1F / Dark+
 * #D4D4D4), never a muted grey. Without semantic.css (no color-scheme) the
 * light values apply. The page chips (render/block-classes.ts
 * INLINE_CODE_KIND_CLASSES + the semantic.css --docs-inline-code-*-fg
 * knobs) carry the same values.
 */
const CHIP_KIND_VSCODE_COLOR: Record<ChipKind, string> = {
  path: "light-dark(#a31515,var(--syntax-string,#ce9178))",
  string: "light-dark(#a31515,var(--syntax-string,#ce9178))",
  type: "light-dark(#22728a,var(--syntax-type,#4ec9b0))",
  call: "light-dark(#795e26,var(--syntax-function,#dcdcaa))",
  literal: "light-dark(#08794f,var(--syntax-number,#b5cea8))",
  keyword: "light-dark(#0000ff,var(--syntax-keyword,#569cd6))",
  prop: "light-dark(#001080,var(--syntax-key,#9cdcfe))",
  other: "light-dark(#1f1f1f,#d4d4d4)",
};

/** One color rule per kind for chips matched by `selector` (which carry `data-chip-kind`), in the VS Code palettes (Light+ / Dark+ by page mode). */
export function typedChipVsCodeColorCss(selector: string): string {
  return (Object.entries(CHIP_KIND_VSCODE_COLOR) as [ChipKind, string][])
    .map(([kind, color]) => `${selector}[data-chip-kind="${kind}"] { color:${color}; }`)
    .join("\n");
}
