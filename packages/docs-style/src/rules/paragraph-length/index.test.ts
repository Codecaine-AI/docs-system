import { expect, test } from "bun:test";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { thresholds } from "../../profile";
import { paragraphLengthRule } from "./index";

function block(id: string, type: DocBlock["type"], text: string): DocBlock {
  return { id, type, props: {}, text: [{ insert: text }], children: [] };
}

function detect(...blocks: DocBlock[]) {
  const root: DocBlock = { id: "root", type: "paragraph", props: {}, children: blocks.map((b) => b.id) };
  const document: DocDocument = { schemaVersion: 1, id: "test", root: "root", blocks: Object.fromEntries([root, ...blocks].map((b) => [b.id, b])) };
  return paragraphLengthRule.detect!({ document, blocks: orderedBlocks(document) });
}

const sentences = (count: number) => Array.from({ length: count }, (_, i) => `Step ${i + 1} runs the check.`).join(" ");

test("flags a paragraph with more sentences than the limit as a whole block", () => {
  const limit = thresholds.paragraphSentences;
  const found = detect(block("long", "paragraph", sentences(limit + 1)), block("ok", "paragraph", sentences(limit)));
  expect(found).toMatchObject([{ blockId: "long", field: "text", message: `Paragraph has ${limit + 1} sentences. The limit is ${limit}.` }]);
  // The whole block is the finding, so a rewrite may change every sentence in it.
  expect(found[0]).not.toHaveProperty("sentence");
});

test("only paragraph blocks are paragraphs", () => {
  const many = sentences(thresholds.paragraphSentences + 1);
  expect(detect(block("li", "list-item", many), block("c", "callout", many))).toEqual([]);
});
