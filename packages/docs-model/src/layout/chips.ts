/**
 * Inline code chips and mono text as the viewer draws them, for layout
 * lints: how a chip's text is typed (docs-viewer components/typed-chip.ts
 * `chipKind`) and where a chip or a mono value may break (docs-viewer
 * components/mono-breaks.tsx `chipPieces`, `chipNeedsPieces`, `monoBreaks`).
 * docs-model cannot import the viewer, so this is a copy of its pure logic.
 * docs-viewer's layout-metrics-drift test runs both copies on the same
 * fixtures and fails when one changes alone.
 */

/** What a chip's text is: a path, a quoted string, a type, a call, a number, a keyword literal, a property, or none of those. */
export type ChipKind = "path" | "string" | "type" | "call" | "literal" | "keyword" | "prop" | "other";

const VERBS =
  /^(get|set|add|remove|update|read|write|validate|project|render|create|delete|apply|resolve|parse|build|load|fetch|use|handle|make|to|is|has|find|compute|format|normalize|register|insert|move|split|merge|require|run|emit|open|close|save|select|toggle|reset|init|list|check|map|filter|reduce|serialize|commit|restore|stage|accept|reject)[A-Z0-9_]/;
const EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|html|py|rs|go|ya?ml|toml|sh|txt|svg|png|jpe?g|gif|webp|mp4|lock|sql|db)$/i;
const QUOTED = /^(["'`]).*\1$/;
const NUMBER = /^-?\d+(\.\d+)?(px|em|rem|ms|s|%|ch|vh|vw)?$/;
const KEYWORD_LITERAL = /^(true|false|null|undefined|NaN|Infinity)$/;
const CALL_EXPRESSION = /^[\w$.-]*[A-Za-z0-9_$]\(.*\)$/;
const MEMBER_CALL = /^[a-z][\w-]*\.[a-z][A-Za-z0-9]*$/;
const CAMEL_CASE = /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/;
const PASCAL_CASE = /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)*$/;
const KEY_PATH = /^[a-z][a-z0-9_-]*(\.[a-z][\w-]*)*$/;
const CUSTOM_PROPERTY = /^--[A-Za-z0-9][\w-]*\*?$/;

/** The viewer's chip classifier. A stack detail renders as path lines when the whole detail is a `path`. */
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
 * A chip's text cut into pieces. Each non-space piece is `white-space:
 * nowrap`, and a line may break only between pieces (a `<wbr>` between two
 * adjacent pieces, or a space). Whitespace runs are their own pieces.
 */
const CHIP_BREAK_AFTER = /(?<=[A-Za-z0-9][/._-])(?=[A-Za-z0-9<{[(~$@])/;
const CHIP_LONG_WORD = 20;

export function chipPieces(text: string): string[] {
  const words = text.split(/(\s+)/).filter((part) => part !== "");
  const spaced = words.some((part) => /^\s+$/.test(part));
  return words.flatMap((word) =>
    /^\s+$/.test(word) || (spaced && word.length <= CHIP_LONG_WORD)
      ? [word]
      : word.split(CHIP_BREAK_AFTER),
  );
}

/** Characters a browser may break after (or before) inside a word, per UAX #14. */
const NATIVE_BREAK = /[^\sA-Za-z0-9_.$#@:=<>"'`,;*&^]/;

/** False when the plain chip text already cannot break mid-token, so the viewer renders it as one text run. */
export function chipNeedsPieces(text: string): boolean {
  if (NATIVE_BREAK.test(text)) return true;
  const words = text.split(/(\s+)/).filter((part) => part !== "");
  return chipPieces(text).length !== words.length;
}

const MONO_BREAK_AFTER = /([/.\-|,])/;

/**
 * The pieces `monoBreaks(text)` renders with a `<wbr>` between each two:
 * the text cut after each `/ . - | ,` that more text follows. A separator at
 * the end of the text gives no break, and a text without one is one piece.
 * Stack path details render each segment this way.
 */
export function monoBreakPieces(text: string): string[] {
  if (!MONO_BREAK_AFTER.test(text)) return [text];
  const pieces: string[] = [];
  text.split(MONO_BREAK_AFTER).forEach((part, index, parts) => {
    if (index % 2 === 1) pieces[pieces.length - 1] += part;
    else pieces.push(part);
    if (index % 2 === 1 && (index === parts.length - 1 || parts[index + 1] === "")) pieces.push("");
  });
  return pieces.filter((piece, index) => piece !== "" || index === 0);
}
