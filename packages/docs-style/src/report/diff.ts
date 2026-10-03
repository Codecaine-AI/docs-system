/**
 * The word-level diff behind every before-and-after card. It runs an LCS over tokens (words,
 * punctuation, whitespace) after it trims the common prefix and suffix. Then it merges each
 * change region into one deletion and one insertion, so the reader sees phrases, not scattered
 * single words. Plain data out; diff-html.ts turns it into markup.
 */

export type DiffOp = "eq" | "del" | "ins";

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

/**
 * One token is a code span, a link target "](url)", a rewrite placeholder, a whitespace run, a
 * word, or any other single character. A word joins letters and digits across . - ' ’ / so
 * "doc.json", "sub-agent", and "src/report" each stay one token.
 */
const TOKEN = /`[^`\n]*`|\]\([^)\s]*\)|⟦\d+⟧|\s+|[\p{L}\p{N}_]+(?:['’.\-/][\p{L}\p{N}_]+)*|[^\s]/gu;
const WORD_START = /^[\p{L}\p{N}_`]/u;

/** Above this many LCS cells (about 1200 × 1200 tokens) a block diffs as one replacement. */
const MAX_CELLS = 1_500_000;

function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/** Words in the diff's sense: each word token, and each code span as one word. */
export function countWords(text: string): number {
  return tokenize(text).filter((token) => WORD_START.test(token)).length;
}

export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokenize(before);
  const b = tokenize(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops: DiffSegment[] = [
    ...a.slice(0, start).map((text): DiffSegment => ({ op: "eq", text })),
    ...lcsOps(a.slice(start, endA), b.slice(start, endB)),
    ...a.slice(endA).map((text): DiffSegment => ({ op: "eq", text })),
  ];
  return flatten(absorbWhitespace(regions(ops)));
}

/** Token-level ops from a suffix LCS table. On a tie it deletes first, so deletions lead. */
function lcsOps(a: string[], b: string[]): DiffSegment[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0 || (n + 1) * (m + 1) > MAX_CELLS) {
    const out: DiffSegment[] = [];
    if (n) out.push({ op: "del", text: a.join("") });
    if (m) out.push({ op: "ins", text: b.join("") });
    return out;
  }
  const w = m + 1;
  const table = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * w + j] =
        a[i] === b[j] ? table[(i + 1) * w + j + 1]! + 1 : Math.max(table[(i + 1) * w + j]!, table[i * w + j + 1]!);
    }
  }
  const out: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "eq", text: a[i++]! });
      j++;
    } else if (table[(i + 1) * w + j]! >= table[i * w + j + 1]!) {
      out.push({ op: "del", text: a[i++]! });
    } else {
      out.push({ op: "ins", text: b[j++]! });
    }
  }
  while (i < n) out.push({ op: "del", text: a[i++]! });
  while (j < m) out.push({ op: "ins", text: b[j++]! });
  return out;
}

type Region = { eq: string } | { del: string; ins: string };

function isChange(region: Region | undefined): region is { del: string; ins: string } {
  return !!region && "del" in region;
}

/** Groups token ops into kept runs and change regions. A region holds its deletions, then its insertions. */
function regions(ops: DiffSegment[]): Region[] {
  const out: Region[] = [];
  for (const { op, text } of ops) {
    const last = out[out.length - 1];
    if (op === "eq") {
      if (last && !isChange(last)) last.eq += text;
      else out.push({ eq: text });
    } else {
      const region = isChange(last) ? last : { del: "", ins: "" };
      if (region !== last) out.push(region);
      if (op === "del") region.del += text;
      else region.ins += text;
    }
  }
  return out;
}

/**
 * A space kept between two replacements reads as noise ("~~A~~ The ~~B~~ C"), so it joins
 * both regions ("~~A B~~ The C"). Only a whitespace-only run between two regions that both
 * delete and insert text is absorbed, so a kept word always stays visible as kept.
 */
function absorbWhitespace(items: Region[]): Region[] {
  const out: Region[] = [];
  for (const item of items) {
    out.push(item);
    while (out.length >= 3) {
      const x = out[out.length - 3];
      const y = out[out.length - 2];
      const z = out[out.length - 1];
      if (!isChange(x) || isChange(y) || !isChange(z) || !y || !/^\s+$/.test(y.eq)) break;
      if (!(x.del || z.del) || !(x.ins || z.ins)) break;
      out.splice(-3, 3, { del: x.del + y.eq + z.del, ins: x.ins + y.eq + z.ins });
    }
  }
  return out;
}

function flatten(items: Region[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const item of items) {
    if (!isChange(item)) {
      if (item.eq) out.push({ op: "eq", text: item.eq });
      continue;
    }
    if (item.del) out.push({ op: "del", text: item.del });
    if (item.ins) out.push({ op: "ins", text: item.ins });
  }
  return out;
}
