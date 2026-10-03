/**
 * List integrity: punctuation decides what belongs to a list, and a rewrite that moves it can
 * change what a sentence lists without changing a word.
 * - "Clicks stay live only while choosing a target; the maximize action stays available." keeps
 *   two claims apart. With ", and" in place of the semicolon, "only while" can reach the second one.
 * - "owns its schema, actions, and theme — and the path for a custom component" names one extra
 *   topic. With a comma in place of the dash, the path becomes a fourth thing every type owns.
 * - "supplies the callbacks, data, persistence, locks" can name what the callbacks carry. With an
 *   "and" before the last item it lists four separate things.
 */
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import type { GuardrailResult } from "../types";
import { afterProse, beforeProse, excerpt, literalSentences, semicolonsIn, type RewriteText } from "./prose";

const COMMA_AND = /,\s+and(?![\p{L}\p{N}_])/giu;

/** A run of three or more comma-separated segments in one clause: a series, or clauses joined by commas. */
interface Run {
  /** Each segment without a leading "and" or "or", lowercase, for matching across texts. */
  items: string[];
  /** How many segments start with "and" or "or". */
  conjunctions: number;
  /** The clause, lowercase, to tell words that were in it from words that stood apart. */
  clause: string;
  /** The clause as written, for the report. */
  text: string;
}

/** A clause ends at a semicolon, a label colon, a dash, or a parenthesis. A comma never ends one. */
const CLAUSE_BREAK = /;|:(?=\s|$)|[—–]|\s-\s|[()[\]]/gu;
const CONJUNCTION = /^(?:and|or)\s+/i;
const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * One block's sentences with each code span and reference as a token that stands for its
 * identity, shared through `tokens` by every block of one check, so "`a`, `b`, `c`" lists three
 * different items and a comma inside a literal never splits one.
 */
function maskedSentences(spans: readonly DeltaSpan[], tokens: Map<string, string>): string[] {
  return literalSentences(spans).map(({ literal }) =>
    literal.replace(/\u0000([^\u0000]*)\u0000/g, (_, identity: string) => {
      if (!tokens.has(identity)) tokens.set(identity, `\u0001${tokens.size}\u0001`);
      return tokens.get(identity)!;
    }),
  );
}

/** The comma runs of one block's masked sentences. */
function runsIn(masked: readonly string[]): Run[] {
  const runs: Run[] = [];
  for (const sentence of masked)
    for (const clause of sentence.split(CLAUSE_BREAK)) {
      const segments = clause.split(/,\s+/).map((segment) => segment.trim()).filter(Boolean);
      if (segments.length < 3) continue;
      runs.push({
        items: segments.map((segment) => normalize(segment.replace(CONJUNCTION, "").replace(/[.!?]+$/, ""))),
        conjunctions: segments.filter((segment) => CONJUNCTION.test(segment)).length,
        clause: normalize(clause),
        text: clause.replace(/\u0001\d+\u0001/g, "…").trim(),
      });
    }
  return runs;
}

/**
 * The run in `after` that is the same series as `run`: the one that shares the most items after
 * the first, which carries the words that lead into the series. It must share at least two, and at
 * least half of them, or the series was rewritten into another shape and other checks judge it.
 */
function matchOf(run: Run, after: readonly Run[]): Run | undefined {
  const wanted = run.items.slice(1);
  let best: Run | undefined;
  let bestShared = 0;
  for (const candidate of after) {
    const have = new Set(candidate.items.slice(1));
    const shared = wanted.filter((item) => have.has(item)).length;
    if (shared > bestShared) [best, bestShared] = [candidate, shared];
  }
  return bestShared >= Math.max(2, Math.ceil(wanted.length / 2)) ? best : undefined;
}

/** What changed in one series, or undefined when it kept its shape. */
function seriesProblem(run: Run, match: Run): string | undefined {
  const series = `series "${excerpt(run.text, 50)}"`;
  // A segment from the series' own clause is a reorder ("Use X when A, B, or C" to "When A, B, or
  // C, use X"). A segment from outside the clause, or new words, joined the series.
  const joined = match.items.filter((item) => !run.items.includes(item) && !run.clause.includes(item));
  if (match.items.length > run.items.length && joined.length) return `${series} took in "${excerpt(joined[0]!, 30)}"`;
  // Fewer segments is a split: an item left for a sentence or bullet of its own. Content-coverage
  // and the meaning checks judge what moved.
  if (match.items.length === run.items.length && match.conjunctions !== run.conjunctions)
    return `${series} ${match.conjunctions > run.conjunctions ? "gained" : "lost"} an "and" or "or" before an item`;
  return undefined;
}

/**
 * "list-integrity": no semicolon became ", and", no series took in a segment that stood apart,
 * and no series gained or lost an "and" or "or".
 */
export function checkListIntegrity(input: RewriteText): GuardrailResult {
  const problems: string[] = [];
  const before = beforeProse(input);
  const after = afterProse(input);
  const semicolons = [semicolonsIn(before), after.reduce((sum, text) => sum + semicolonsIn(text), 0)] as const;
  const commaAnds = [before.match(COMMA_AND)?.length ?? 0, after.reduce((sum, text) => sum + (text.match(COMMA_AND)?.length ?? 0), 0)] as const;
  if (semicolons[1] < semicolons[0] && commaAnds[1] > commaAnds[0])
    problems.push(`a semicolon became ", and" (semicolons ${semicolons[0]} -> ${semicolons[1]}, ", and" ${commaAnds[0]} -> ${commaAnds[1]})`);

  const tokens = new Map<string, string>();
  const runsBefore = runsIn(maskedSentences(input.beforeSpans, tokens));
  const runsAfter = runsIn(input.afterBlocks.flatMap((spans) => maskedSentences(spans, tokens)));
  for (const run of runsBefore) {
    const match = matchOf(run, runsAfter);
    const problem = match && seriesProblem(run, match);
    if (problem) problems.push(problem);
  }
  if (!problems.length) return { id: "list-integrity", ok: true, detail: runsBefore.length ? `kept ${runsBefore.length} series` : "no series or semicolon changes" };
  return { id: "list-integrity", ok: false, detail: problems.slice(0, 2).join("; ") + (problems.length > 2 ? `, and ${problems.length - 2} more` : "") };
}
