/**
 * The Tier 1 safe fixes. Each rule's autofix runs in registry order on the text the previous rule
 * returned, so one block gets one change no matter how many rules touched it. A fix lands only when
 * it adds no finding to its block, and, when a Verifier runs, only when it keeps the block's meaning
 * (the sweep checks that between the two passes of applyAutofixes).
 */
import { applyOp, type DeltaSpan, type DocBlock, type DocDocument, type DocOp } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { blockMarkdown, excludedBlockIds } from "../text";
import type { BlockChange, StyleFinding, StyleRule } from "../types";
import { blockContext } from "./context";
import { lintStyle } from "./tier1";

/** StyleRule.autofix only ever sees the text of these blocks. */
const AUTOFIX_TYPES: ReadonlySet<string> = new Set(["paragraph", "list-item", "callout", "heading"]);

/** The fixed text of one block, before any check decides whether it lands. */
export interface AutofixCandidate {
  block: DocBlock;
  text: DeltaSpan[];
  /** The rules whose autofix changed the text. */
  fixedBy: string[];
}

/** One candidate per block that the autofix chain changes, in document order. Exempt blocks get none. */
export function autofixCandidates(doc: DocDocument, rules: readonly StyleRule[], exempt: ReadonlySet<string>): AutofixCandidate[] {
  const context = { document: doc, blocks: orderedBlocks(doc) };
  const excluded = excludedBlockIds(context);
  return context.blocks.flatMap((block) => {
    if (!AUTOFIX_TYPES.has(block.type) || !block.text?.length || excluded.has(block.id) || exempt.has(block.id)) return [];
    let text: DeltaSpan[] = block.text;
    const fixedBy: string[] = [];
    for (const rule of rules) {
      // A copy, so a careless rule cannot edit the page the findings describe. The page is the
      // one detect read, so a fix and its "autofixable" finding agree.
      const input = copySpans(text);
      const next = rule.autofix?.(input, { ...block, text: input }, doc);
      if (next && !sameSpans(next, text)) {
        text = next;
        fixedBy.push(rule.id);
      }
    }
    return fixedBy.length ? [{ block, text, fixedBy }] : [];
  });
}

/**
 * Applies the candidates in order and returns the fixed page with one change per candidate. A fix
 * that makes any rule fire more often on its block is rejected: a swap that is safe in prose can
 * still break a heading's Title Case. A candidate in `decided` is not applied: it is recorded as
 * the change given there, such as one the meaning check rejected.
 */
export function applyAutofixes(
  doc: DocDocument,
  findings: readonly StyleFinding[],
  candidates: readonly AutofixCandidate[],
  rules: readonly StyleRule[],
  decided: ReadonlyMap<string, BlockChange> = new Map(),
): { doc: DocDocument; changes: BlockChange[] } {
  const changes: BlockChange[] = [];
  let working = doc;
  // The findings on the page as it stands, so each fix is compared with the text it replaces.
  let current: readonly StyleFinding[] = findings;
  for (const { block, text, fixedBy } of candidates) {
    const given = decided.get(block.id);
    if (given) {
      changes.push(given);
      continue;
    }
    const flagged = findings.filter((f) => f.blockId === block.id && f.autofixable).map((f) => f.ruleId);
    const change = {
      blockId: block.id,
      blockType: block.type,
      kind: "autofix" as const,
      before: blockMarkdown(block),
      after: blockMarkdown({ ...block, text }),
      ruleIds: [...new Set([...flagged, ...fixedBy])],
      beforeSpans: block.text,
      context: blockContext(doc, block.id),
    };
    const op: DocOp = { type: "updateBlock", blockId: block.id, text };
    const applied = applyOp(working, op);
    if (!applied.ok) {
      changes.push({ ...change, status: "error", reason: applied.issues.map((issue) => issue.message).join(" "), ops: [] });
      continue;
    }
    const relinted = lintStyle(applied.doc, rules);
    const added = addedRules(current, relinted, block.id);
    if (added.length) {
      changes.push({ ...change, status: "rejected", reason: `autofix added a finding: ${added.join(", ")}`, ops: [] });
      continue;
    }
    working = applied.doc;
    current = relinted;
    changes.push({ ...change, status: "accepted", produced: [{ spans: text, depth: 0 }], ops: [op] });
  }
  return { doc: working, changes };
}

/** The Tier 1 rules that fire more often on one block in `after` than in `before`. */
function addedRules(before: readonly StyleFinding[], after: readonly StyleFinding[], blockId: string): string[] {
  const counts = (findings: readonly StyleFinding[]) => {
    const byRule = new Map<string, number>();
    for (const finding of findings)
      if (finding.blockId === blockId && finding.tier === 1) byRule.set(finding.ruleId, (byRule.get(finding.ruleId) ?? 0) + 1);
    return byRule;
  };
  const was = counts(before);
  return [...counts(after)].filter(([ruleId, count]) => count > (was.get(ruleId) ?? 0)).map(([ruleId]) => ruleId);
}

function copySpans(spans: readonly DeltaSpan[]): DeltaSpan[] {
  return spans.map((span) => (span.attributes ? { insert: span.insert, attributes: { ...span.attributes } } : { insert: span.insert }));
}

function sameSpans(a: readonly DeltaSpan[], b: readonly DeltaSpan[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
