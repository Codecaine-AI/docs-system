/**
 * Test support for judge rules: tiny pages built from blocks, and the blocks a rule asks Jev
 * about, found through judgeBlocks with a fake judge. Not exported from the package.
 */
import type { DeltaSpan, DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import type { StyleRule } from "../types";
import { createFakeJudge } from "./fake";
import { judgeBlocks } from "./judge-blocks";

const spans = (text: string | DeltaSpan[]): DeltaSpan[] => (typeof text === "string" ? [{ insert: text }] : text);

export const heading = (id: string, text: string): DocBlock => ({ id, type: "heading", props: { level: 2 }, text: spans(text), children: [] });
export const paragraph = (id: string, text: string | DeltaSpan[]): DocBlock => ({ id, type: "paragraph", props: {}, text: spans(text), children: [] });
export const item = (id: string, text: string | DeltaSpan[], props: Record<string, unknown> = {}): DocBlock => ({
  id,
  type: "list-item",
  props,
  text: spans(text),
  children: [],
});

/** A page whose blocks all sit directly under the root, in order. */
export function page(...blocks: DocBlock[]): DocDocument {
  return {
    schemaVersion: 1,
    id: "test",
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: blocks.map((block) => block.id) },
      ...Object.fromEntries(blocks.map((block) => [block.id, block])),
    },
  };
}

/** The blocks a rule asks Jev about, in page order. */
export async function judgedBlocks(rule: StyleRule, doc: DocDocument): Promise<string[]> {
  const judged = await judgeBlocks({ doc, targets: [{ rule, blockIds: Object.keys(doc.blocks) }], judge: createFakeJudge(() => 1) });
  return judged.map((answer) => answer.blockId);
}

/** The state fields a question names in backticks. Jev reads each one from the state. */
export const fieldsNamed = (question: string) => [...question.matchAll(/`([A-Za-z_]\w*)`/g)].map((match) => match[1]!);
