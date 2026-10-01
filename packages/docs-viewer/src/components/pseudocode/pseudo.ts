/**
 * Pseudocode block support.
 *
 * Two parts, both display-only (stored text and copy text are never changed):
 *  - `pseudoGrammar`: a small highlight.js grammar, registered on the
 *    pseudocode block's own highlighter instance (highlight.ts) — control words (if / else / for each /
 *    while / return), operator words (in / is / not / and / or), literals,
 *    calls, `.property` access, `->`, strings, numbers, and `//` comments.
 *  - `renderPseudoLines`: each source line split into its highlighted code,
 *    its trailing `// …` comment (rendered in one aligned grid column that
 *    wraps inside the panel) and, when `diff` is set, the mark read from the
 *    leading `+` / `-` / space column.
 *
 * Diff markers are only read when the author sets `props.diff: true` — no
 * auto-detection, so a pseudocode line that starts with `-` stays literal.
 */

import type { HLJSApi, Language } from "highlight.js";

export const PSEUDO_LANGUAGE = "pseudo";

/** Control-flow words; highlight.ts tags them hljs-control (purple), like the code block's `if`. */
export const PSEUDO_CONTROL_WORDS = ["if", "else", "for", "each", "while", "return", "break", "continue", "skip", "emit", "yield", "await", "then", "until", "repeat", "do"];

export function pseudoGrammar(hljs: HLJSApi): Language {
  return {
    name: "Pseudocode",
    aliases: ["pseudocode"],
    keywords: {
      keyword: [...PSEUDO_CONTROL_WORDS, "in", "is", "not", "and", "or", "let", "set", "function", "def", "end"],
      literal: ["true", "false", "null", "nil", "none"],
    },
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.QUOTE_STRING_MODE,
      hljs.C_NUMBER_MODE,
      { scope: "operator", match: /->|=>/ },
      // A call: a name directly followed by "(" — but never a control word (`if (x)`).
      {
        scope: "title.function",
        match: /\b(?!(?:if|while|for|return|each|not|and|or|in|is)\b)[A-Za-z_][\w]*(?=\()/,
      },
      { scope: "property", match: /(?<=\.)[A-Za-z_]\w*/ },
    ],
  };
}

export type PseudoDiffMark = "add" | "del" | null;

/** One source line, split for the block's row grid. Every field is escaped or highlighted HTML. */
export type PseudoLine = {
  /** Diff mark when `diff` is on and the line starts with `+` / `-`; else null. */
  mark: PseudoDiffMark;
  /** The line's code with its indent, highlighted; a comment-only line keeps its comment here. */
  code: string;
  /** The trailing `// …` comment, escaped, for the aligned comment column; null when there is none. */
  comment: string | null;
};

/**
 * Split a line into its code and its TRAILING `//` comment. A `//` inside a
 * double-quoted string is not a comment. A line that is only a comment keeps
 * it inline (comment === null) so it highlights in place.
 */
export function splitTrailingComment(line: string): { code: string; comment: string | null } {
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\" && inString) {
      index += 1;
      continue;
    }
    if (char === '"') inString = !inString;
    else if (!inString && char === "/" && line[index + 1] === "/") {
      const code = line.slice(0, index).trimEnd();
      if (!code.trim()) return { code: line, comment: null };
      return { code, comment: line.slice(index) };
    }
  }
  return { code: line, comment: null };
}

/** Reads the leading diff column: `+` added, `-` removed, one space (or nothing) unchanged. */
function parseDiffMark(line: string): { mark: PseudoDiffMark; rest: string } {
  const first = line[0];
  if (first === "+") return { mark: "add", rest: line.slice(1) };
  if (first === "-") return { mark: "del", rest: line.slice(1) };
  if (first === " ") return { mark: null, rest: line.slice(1) };
  return { mark: null, rest: line };
}

/**
 * One entry per source line (always `code.split("\n").length`). Without
 * `diff` every character of the line stays in `code` + `comment`; with it the
 * first column is read as the diff mark and dropped. `highlight` turns one
 * code fragment into escaped token HTML; `escape` escapes plain text.
 */
export function renderPseudoLines(
  code: string,
  options: { diff: boolean; highlight: (fragment: string) => string; escape: (text: string) => string },
): PseudoLine[] {
  return code.split("\n").map((raw) => {
    const { mark, rest } = options.diff ? parseDiffMark(raw) : { mark: null, rest: raw };
    const split = splitTrailingComment(rest);
    return {
      mark,
      code: split.code ? options.highlight(split.code) : "",
      comment: split.comment === null ? null : options.escape(split.comment),
    };
  });
}
