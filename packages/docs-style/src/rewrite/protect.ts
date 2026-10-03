/**
 * Span protection for the Tier 3 rewrite. The model edits inline markdown, but a block stores
 * delta spans, and the docs-model markdown bridge renders a reference as plain text. So
 * protection never round-trips through markdown: each code, link, and reference span leaves the
 * text as a token "⟦n⟧" that carries its exact spans, and restoring puts those spans back.
 */
import { inlineToDelta, wrapMarkdownMarks, type DeltaSpan, type DeltaSpanAttributes } from "@codecaine-ai/docs-model";
import type { ProtectedToken } from "../types";

/** One block of a rewrite: depth 0 is the lead, 1 is a bullet, 2 is a sub-bullet. */
export interface RewrittenBlock {
  spans: DeltaSpan[];
  depth: number;
}

type Marks = Pick<DeltaSpanAttributes, "bold" | "italic" | "strike">;

/** A token in model output. Stray spaces inside the brackets still count. */
const TOKEN = /⟦\s*(\d+)\s*⟧/g;

/**
 * Plain text the markdown bridge would read as syntax: two words with "_" become italics. A word
 * that holds such a character is protected too, so the model and the bridge both leave it alone.
 */
const SYNTAX = /[_*`[\]⟦⟧]|~~/;
const BARE_URL = /^https?:\/\//;
const PREVIEW_LIMIT = 80;

/** Block text to masked inline markdown. Marks stay as markdown; code, links, and references become tokens. */
export function protectSpans(spans: DeltaSpan[]): { markdown: string; tokens: ProtectedToken[] } {
  const tokens: ProtectedToken[] = [];
  const runs: { text: string; marks: Marks }[] = [];
  const write = (text: string, marks: Marks) => {
    if (!text) return;
    const last = runs.at(-1);
    if (last && sameMarks(last.marks, marks)) last.text += text;
    else runs.push({ text, marks });
  };
  const protect = (group: DeltaSpan[], kind: ProtectedToken["kind"]) => {
    const token = `⟦${tokens.length}⟧`;
    tokens.push({ token, kind, original: JSON.stringify(group), preview: preview(group) });
    write(token, sharedMarks(group));
  };

  for (const [index, group] of targetGroups(spans).entries()) {
    const kind = protectedKind(group[0]!);
    if (kind) {
      protect(group, kind);
      continue;
    }
    const span = group[0]!;
    let at = 0;
    for (const literal of literalWords(span.insert, index === 0)) {
      write(span.insert.slice(at, literal.start), marksOf(span));
      protect([withInsert(span, span.insert.slice(literal.start, literal.end))], literal.kind);
      at = literal.end;
    }
    write(span.insert.slice(at), marksOf(span));
  }
  return { markdown: runs.map((run) => wrapMarkdownMarks(run.text, run.marks)).join(""), tokens };
}

/**
 * Model output back to block text. Line 1 is the lead (depth 0), a "- " line is a bullet
 * (depth 1), and an indented "  - " line is a sub-bullet (depth 2). A line that starts with
 * "1. " or "1) " is text, never a list marker: step paragraphs open with their number. Marks
 * parse through inlineToDelta, the converter docs_write_text uses, and each token becomes its
 * exact spans. ok is true only when every token appears exactly once across all blocks.
 */
export function restoreSpans(
  markdown: string,
  tokens: readonly ProtectedToken[],
): { blocks: RewrittenBlock[]; ok: boolean; problems: string[] } {
  const originals = new Map(tokens.map((token) => [token.token, token.original]));
  const counts = new Map<string, number>();
  const unknown = new Set<string>();

  const restoreLine = (line: string): DeltaSpan[] => {
    const out: DeltaSpan[] = [];
    for (const span of inlineToDelta(line).spans) {
      let at = 0;
      for (const match of span.insert.matchAll(TOKEN)) {
        append(out, withInsert(span, span.insert.slice(at, match.index)));
        const token = `⟦${Number(match[1])}⟧`;
        const original = originals.get(token);
        if (original === undefined) {
          unknown.add(match[0]);
          append(out, withInsert(span, match[0]));
        } else {
          counts.set(token, (counts.get(token) ?? 0) + 1);
          for (const restored of JSON.parse(original) as DeltaSpan[]) append(out, restored);
        }
        at = match.index + match[0].length;
      }
      append(out, withInsert(span, span.insert.slice(at)));
    }
    return out;
  };

  const blocks = splitLines(markdown).map(({ text, depth }) => ({ spans: restoreLine(text), depth }));
  const problems: string[] = [];
  for (const { token } of tokens) {
    const count = counts.get(token) ?? 0;
    if (count === 0) problems.push(`${token} is missing`);
    if (count > 1) problems.push(`${token} appears ${count} times`);
  }
  for (const token of unknown) problems.push(`${token} is not a known token`);
  return { blocks, ok: problems.length === 0, problems };
}

/**
 * Splits model output into the lead and its bullets.
 * - A line without a marker before the first bullet continues the lead, so a paragraph with a
 *   stray line break stays one block.
 * - After the first bullet, an unmarked line is its own bullet: models end a list with a loose
 *   sentence. Only an indented unmarked line continues the bullet above it.
 */
function splitLines(markdown: string): { text: string; depth: number }[] {
  const blocks: { text: string; depth: number }[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const bullet = /^(\s*)[-*+•]\s+(.*)$/.exec(line);
    const indent = (bullet?.[1] ?? /^\s*/.exec(line)![0]).replace(/\t/g, "  ").length;
    const last = blocks.at(-1);
    if (!last) {
      // A lead written as a bullet still leads: a list item often comes back as "- text".
      blocks.push({ text: (bullet ? bullet[2]! : line).trim(), depth: 0 });
    } else if (bullet) {
      // A sub-bullet needs a bullet above it. Without one it is a bullet.
      const depth = indent >= 2 && blocks.some((block) => block.depth === 1) ? 2 : 1;
      blocks.push({ text: bullet[2]!.trim(), depth });
    } else if (last.depth === 0 || indent >= 2) {
      last.text += ` ${line.trim()}`;
    } else {
      blocks.push({ text: line.trim(), depth: 1 });
    }
  }
  return blocks;
}

/** Adjacent spans with one link URL or one reference are one link with mixed marks: one token. */
function targetGroups(spans: DeltaSpan[]): DeltaSpan[][] {
  const groups: DeltaSpan[][] = [];
  for (const span of spans) {
    const last = groups.at(-1);
    if (last && sameTarget(last[0]!, span)) last.push(span);
    else groups.push([span]);
  }
  return groups;
}

function sameTarget(a: DeltaSpan, b: DeltaSpan): boolean {
  const x = a.attributes;
  const y = b.attributes;
  if (x?.reference || y?.reference) return Boolean(x?.reference && y?.reference) && canonical(x!.reference) === canonical(y!.reference);
  return Boolean(x?.link) && x?.link === y?.link;
}

function protectedKind(span: DeltaSpan): ProtectedToken["kind"] | undefined {
  const attributes = span.attributes;
  if (attributes?.reference) return "reference";
  if (attributes?.link) return "link";
  if (attributes?.code) return "code";
  return undefined;
}

function isProtected(span: DeltaSpan): boolean {
  return protectedKind(span) !== undefined;
}

/**
 * Whitespace-separated words in plain text that must not reach the model or the markdown bridge:
 * bare URLs and words with markdown syntax characters, such as `docs_check`. Sentence
 * punctuation and wrapping quotes or brackets stay outside the token, so the model still sees them.
 * At the start of a block, a step number such as "1." or "2)" is a token too: it is a fact the
 * model must not renumber or drop, and a line that starts with it reads like a list marker.
 */
function literalWords(text: string, blockStart: boolean): { start: number; end: number; kind: ProtectedToken["kind"] }[] {
  const words: { start: number; end: number; kind: ProtectedToken["kind"] }[] = [];
  const firstWord = text.length - text.trimStart().length;
  for (const match of text.matchAll(/\S+/g)) {
    let start = match.index;
    let end = start + match[0].length;
    if (blockStart && start === firstWord && /^\d+[.)]$/.test(match[0])) {
      words.push({ start, end, kind: "code" });
      continue;
    }
    const count = (char: string) => [...text.slice(start, end)].filter((c) => c === char).length;
    while (end > start && (`.,;:!?"'”’`.includes(text[end - 1]!) || (text[end - 1] === ")" && count(")") > count("(")))) end -= 1;
    while (start < end && (`"'“‘`.includes(text[start]!) || (text[start] === "(" && count("(") > count(")")))) start += 1;
    const word = text.slice(start, end);
    if (BARE_URL.test(word)) words.push({ start, end, kind: "link" });
    else if (SYNTAX.test(word)) words.push({ start, end, kind: "code" });
  }
  return words;
}

/** Adds a span, merging it into the previous plain span when the marks match. Protected spans stay exact. */
function append(out: DeltaSpan[], span: DeltaSpan): void {
  if (!span.insert) return;
  const last = out.at(-1);
  if (last && !isProtected(last) && !isProtected(span) && canonical(last.attributes) === canonical(span.attributes)) {
    out[out.length - 1] = withInsert(last, last.insert + span.insert);
  } else {
    out.push(span);
  }
}

function withInsert(span: DeltaSpan, insert: string): DeltaSpan {
  return span.attributes ? { insert, attributes: span.attributes } : { insert };
}

function marksOf(span: DeltaSpan): Marks {
  const attributes = span.attributes;
  return {
    ...(attributes?.bold ? { bold: true as const } : {}),
    ...(attributes?.italic ? { italic: true as const } : {}),
    ...(attributes?.strike ? { strike: true as const } : {}),
  };
}

/** The marks every span of a token shares, so a token inside bold text stays inside the bold run. */
function sharedMarks(group: DeltaSpan[]): Marks {
  const [first, ...rest] = group.map(marksOf);
  return Object.fromEntries(Object.entries(first ?? {}).filter(([mark]) => rest.every((marks) => mark in marks))) as Marks;
}

function sameMarks(a: Marks, b: Marks): boolean {
  return Boolean(a.bold) === Boolean(b.bold) && Boolean(a.italic) === Boolean(b.italic) && Boolean(a.strike) === Boolean(b.strike);
}

function preview(group: DeltaSpan[]): string {
  const text = group
    .map((span) => span.insert || span.attributes?.reference?.label || span.attributes?.reference?.path || "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT - 1)}…` : text;
}

/** Order-independent JSON, so two equal references or attribute sets compare equal. Empty counts as absent. */
function canonical(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value ?? null);
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "null";
  return `{${entries
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
    .join(",")}}`;
}
