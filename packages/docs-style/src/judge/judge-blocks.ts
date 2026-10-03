import type { DocDocument } from "@codecaine-ai/docs-model";
import type { Judge, JudgeQuestion, JudgeSpec, StyleRule } from "../types";

export interface JudgedBlock {
  ruleId: string;
  blockId: string;
  /** Jev's P(true). True always means the block has the problem. */
  probability: number;
}

/** True when the spec judges this block: its type is listed and select, when present, accepts it. */
function applies(spec: JudgeSpec, doc: DocDocument, blockId: string): boolean {
  const type = doc.blocks[blockId]?.type;
  return type !== undefined && spec.appliesTo.includes(type) && (spec.select?.(doc, blockId) ?? true);
}

/**
 * Tier 2 for one page: ask each rule's question about each target block it applies to, all in
 * one judge.ask() call, and return P(true) per (rule, block). Rules without a judge spec are
 * skipped. Thresholds are the caller's: this returns every answer the judge gave. A block the
 * judge could not answer is missing from the result. Throws when the judge does.
 */
export async function judgeBlocks(input: {
  doc: DocDocument;
  targets: readonly { rule: StyleRule; blockIds: readonly string[] }[];
  judge: Judge;
}): Promise<JudgedBlock[]> {
  const asked: { ruleId: string; blockId: string; key: string }[] = [];
  const seen = new Set<string>();
  const questions: JudgeQuestion[] = [];
  for (const { rule, blockIds } of input.targets) {
    const spec = rule.judge;
    if (!spec) continue;
    for (const blockId of blockIds) {
      const key = `${rule.id}\u0000${blockId}`;
      if (seen.has(key) || !applies(spec, input.doc, blockId)) continue;
      seen.add(key);
      asked.push({ ruleId: rule.id, blockId, key });
      questions.push({ key, question: spec.question, state: spec.state(input.doc, blockId) });
    }
  }
  if (!questions.length) return [];
  const answers = await input.judge.ask(questions);
  return asked.flatMap(({ ruleId, blockId, key }) => {
    const probability = answers.get(key);
    return probability === undefined ? [] : [{ ruleId, blockId, probability }];
  });
}
