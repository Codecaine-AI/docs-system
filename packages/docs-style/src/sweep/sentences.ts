/**
 * Places lint sentences inside masked markdown. A finding names its sentence in proseText form,
 * where each code or reference span is one "\u0000". The rewrite model reads masked markdown,
 * where each protected span is a token such as "⟦0⟧". Both reduce to one key, so they match.
 */
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { proseText, sentences } from "../text";
import type { ProtectedToken } from "../types";

/** Characters a key ignores: markdown marks and escapes, so bold and plain text compare equal. */
const KEY_IGNORES = /[*~_\\]/g;

export interface MaskedSentence {
  /** The sentence as it appears in the masked markdown, with the marks that wrap it. */
  masked: string;
  /** The comparison key. See sentenceKey. */
  key: string;
}

/** Drops marks and collapses whitespace. Apply it to proseText and to masked sentences alike. */
export function sentenceKey(text: string): string {
  return text.replace(KEY_IGNORES, "").replace(/\s+/g, " ").trim();
}

/**
 * Splits masked markdown into sentences at the same places the lint splits the block's proseText.
 * The markdown is first rebuilt as that proseText: each token becomes the proseText of the spans it
 * holds, and bold, italic, and strike marks drop out. Each character remembers the masked slice
 * it came from, so every sentence maps back to its exact masked text.
 */
export function maskedSentences(markdown: string, tokens: readonly ProtectedToken[]): MaskedSentence[] {
  const byToken = new Map(tokens.map((token) => [token.token, token]));
  const tokenAt = tokens.length
    ? new RegExp(tokens.map((token) => escapeRegExp(token.token)).sort((a, b) => b.length - a.length).join("|"), "y")
    : undefined;
  let plain = "";
  const from: number[] = [];
  const to: number[] = [];
  const push = (text: string, start: number, end: number) => {
    for (let k = 0; k < text.length; k += 1) {
      plain += text[k];
      from.push(start);
      to.push(end);
    }
  };
  let i = 0;
  while (i < markdown.length) {
    const width = tokenAt ? matchAt(tokenAt, markdown, i) : 0;
    if (width) {
      push(proseOf(byToken.get(markdown.slice(i, i + width))!), i, i + width);
      i += width;
    } else {
      // Outside a token, "*" and "~~" are always marks: protectSpans turns literal ones into tokens.
      const mark = markWidth(markdown, i);
      if (!mark) push(markdown[i]!, i, i + 1);
      i += mark || 1;
    }
  }

  const out: MaskedSentence[] = [];
  let cursor = 0;
  for (const part of sentences(plain)) {
    const at = plain.indexOf(part, cursor);
    if (at < 0) continue;
    cursor = at + part.length;
    let start = from[at]!;
    let end = to[at + part.length - 1]!;
    // Keep the marks that open and close the sentence, so the slice reads as written.
    while (start > 0 && markWidth(markdown, start - 1)) start -= 1;
    while (end < markdown.length && markWidth(markdown, end)) end += 1;
    out.push({ masked: markdown.slice(start, end), key: sentenceKey(part) });
  }
  return out;
}

function matchAt(pattern: RegExp, text: string, at: number): number {
  pattern.lastIndex = at;
  return pattern.exec(text)?.[0].length ?? 0;
}

/** The width of the mark at `at`: 1 for "*", 2 for "~~" (1 when inside a "~~" pair), else 0. */
function markWidth(text: string, at: number): number {
  if (text[at] === "*") return 1;
  if (text[at] === "~" && (text[at + 1] === "~" || text[at - 1] === "~")) return text[at + 1] === "~" ? 2 : 1;
  return 0;
}

/** The proseText of the spans a token holds: a link keeps its text, code and references become "\u0000". */
function proseOf(token: ProtectedToken): string {
  try {
    const spans: unknown = JSON.parse(token.original);
    if (Array.isArray(spans)) return proseText(spans as DeltaSpan[]);
  } catch {
    // Not span JSON. Fall back on what the token kind implies.
  }
  return token.kind === "link" ? token.preview : "\u0000";
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
