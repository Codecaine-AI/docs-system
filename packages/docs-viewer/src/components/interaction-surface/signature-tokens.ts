/**
 * Lexer for the free-form type text an interaction-surface signature prints
 * after `name:` and `->` (`string`, `Record<questionId, Decision result>`,
 * `"native" | "none"`, `(result: { ok: boolean }) => void`). Each token gets a
 * VS Code Dark+ / Light+ role so the signature pane colors like a code block:
 * the block's inline <style> maps every `data-sig-token` kind onto a
 * --syntax-* role token.
 *
 * Type text is authored prose as often as TypeScript, so the rules stay
 * forgiving: any word is a type name unless it is a literal or a type-level
 * keyword, and a word directly after `{ ( , ;` and before `:` (optionally
 * `?:`) is a property key.
 */

export type SigTypeTokenKind =
  | "type-name"
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "keyword"
  | "punct"
  | "space";

export type SigTypeToken = { kind: SigTypeTokenKind; text: string };

const LEXEME =
  /\s+|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\p{L}\p{N}_$])|=>|->|\.\.\.|[\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)*|[^]/gu;

const BOOLEANS = new Set(["true", "false"]);
const NULLS = new Set(["null", "undefined"]);
// Type-level operators Dark+ paints as keywords. Prose words that double as
// TS keywords (in, is, as) stay type names: type text is often a sentence.
const KEYWORDS = new Set(["keyof", "typeof", "readonly", "infer", "extends", "unique", "asserts"]);
const KEY_OPENERS = new Set(["{", "(", ",", ";"]);

function isWord(text: string): boolean {
  return /^[\p{L}_$]/u.test(text);
}

/** Splits type text into role tokens; joining every `text` gives the input back. */
export function tokenizeSigType(source: string): SigTypeToken[] {
  const lexemes = source.match(LEXEME) ?? [];
  const tokens: SigTypeToken[] = [];
  let previous = ""; // last non-space lexeme
  lexemes.forEach((text, index) => {
    let kind: SigTypeTokenKind;
    if (/^\s/.test(text)) kind = "space";
    else if (/^["'`]/.test(text)) kind = "string";
    else if (/^-?\d/.test(text)) kind = "number";
    else if (text === "=>") kind = "keyword";
    else if (!isWord(text)) kind = "punct";
    else if (BOOLEANS.has(text)) kind = "boolean";
    else if (NULLS.has(text)) kind = "null";
    else if (KEYWORDS.has(text)) kind = "keyword";
    else if (KEY_OPENERS.has(previous) && followedByColon(lexemes, index + 1)) kind = "key";
    else kind = "type-name";
    tokens.push({ kind, text });
    if (kind !== "space") previous = text;
  });
  return tokens;
}

function followedByColon(lexemes: readonly string[], from: number): boolean {
  let index = from;
  while (index < lexemes.length && /^\s/.test(lexemes[index]!)) index += 1;
  if (lexemes[index] === "?") index += 1;
  return lexemes[index] === ":";
}
