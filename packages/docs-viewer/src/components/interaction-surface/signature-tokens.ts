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
// `void` reads as a keyword (like null and the booleans), not a type name.
const KEYWORDS = new Set(["void", "keyof", "typeof", "readonly", "infer", "extends", "unique", "asserts"]);
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

/* ------------------------------------------------------------------------ */
/* Example calls                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Roles for an authored example invocation (`file-tree.addEntry({ path:
 * "src/a.ts" })`), named like the signature tokens so one stylesheet colors
 * both: `receiver` a variable or member object, `name` a called function,
 * `key` an object-literal key, literals by type, the rest punctuation.
 */
export type CallTokenKind = "receiver" | "name" | "key" | "string" | "number" | "boolean" | "null" | "keyword" | "punct" | "space";

export type CallToken = { kind: CallTokenKind; text: string };

/** One example-call line: its tokens and the param paths it belongs to (deepest first). */
export type CallLine = { tokens: CallToken[]; paths: string[] };

// Identifiers may carry inner hyphens (`file-tree`): example calls quote doc
// operation names, not only valid JavaScript.
const CALL_LEXEME =
  /\s+|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\p{L}\p{N}_$])|=>|\.\.\.|[\p{L}_$][\p{L}\p{N}_$]*(?:-[\p{L}_$][\p{L}\p{N}_$]*)*|[^]/gu;
const CALL_KEYWORDS = new Set(["new", "await", "async", "function", "return", "typeof", "void", "const", "let"]);

function nextNonSpace(lexemes: readonly string[], from: number): string | undefined {
  let index = from;
  while (index < lexemes.length && /^\s/.test(lexemes[index]!)) index += 1;
  return lexemes[index];
}

/**
 * Splits an example call into lines of role tokens and tags each line with
 * the object-key paths it sits in (`path`, `cell.row`), so a param ledger row
 * can light the lines that set it. Keys count from the outermost object
 * literal: `f({ a: { b: 1 } })` sets `a` and `a.b`; arrays keep their key's
 * path. Joining every token's text gives each line back.
 */
export function tokenizeExampleCall(source: string): CallLine[] {
  const stack: string[] = []; // path prefix of each open { / [
  return source.split("\n").map((line) => {
    const lexemes = line.match(CALL_LEXEME) ?? [];
    const paths = new Set<string>(stack.filter(Boolean));
    let pendingKey = "";
    const tokens = lexemes.map((text, index): CallToken => {
      const prefix = stack[stack.length - 1] ?? "";
      if (/^\s/.test(text)) return { kind: "space", text };
      if (text === "{" || text === "[") { stack.push(pendingKey || prefix); pendingKey = ""; return { kind: "punct", text }; }
      if (text === "}" || text === "]") { stack.pop(); return { kind: "punct", text }; }
      const next = nextNonSpace(lexemes, index + 1);
      const isKey = next === ":" && stack.length > 0 && (/^["']/.test(text) || /^[\p{L}_$]/u.test(text));
      if (isKey) {
        const key = text.replace(/^["']|["']$/g, "");
        pendingKey = prefix ? `${prefix}.${key}` : key;
        paths.add(pendingKey);
        return { kind: "key", text };
      }
      if (text === "," ) pendingKey = "";
      if (/^["'`]/.test(text)) return { kind: "string", text };
      if (/^-?\d/.test(text)) return { kind: "number", text };
      if (!/^[\p{L}_$]/u.test(text)) return { kind: "punct", text };
      if (BOOLEANS.has(text)) return { kind: "boolean", text };
      if (NULLS.has(text)) return { kind: "null", text };
      if (CALL_KEYWORDS.has(text)) return { kind: "keyword", text };
      if (next === "(") return { kind: "name", text };
      return { kind: "receiver", text };
    });
    return { tokens, paths: [...paths].sort((a, b) => b.split(".").length - a.split(".").length) };
  });
}
