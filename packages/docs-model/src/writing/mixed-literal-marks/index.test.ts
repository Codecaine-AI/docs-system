import { expect, test } from "bun:test";
import { mixedLiteralMarksRule } from "./index";
import { document } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocBlock, DocDocument } from "../../doc-schema";

const check = (doc: DocDocument) => mixedLiteralMarksRule.check({ document: doc, blocks: orderedBlocks(doc) });
const para = (id: string, text: DocBlock["text"]): DocBlock => ({ id, type: "paragraph", props: {}, text, children: [] });

test("flags a sentence that codes one literal and quotes another", () => {
  const doc = document(para("p", [{ insert: "Autofix swaps words, such as " }, { insert: "in order to", attributes: { code: true } }, { insert: ' to "to".' }]));
  expect(check(doc).map((m) => m.message)).toEqual(['The sentence marks a literal as code but quotes "to". Give both literals the code mark.']);
});

test("accepts quotes with no code in the sentence, long quotations, and code-only sentences", () => {
  expect(check(document(para("p", [{ insert: 'Write "must" or "can".' }])))).toEqual([]);
  expect(check(document(para("p", [{ insert: "The " }, { insert: "lint", attributes: { code: true } }, { insert: ' rule reports "Prose contains a semicolon here."' }])))).toEqual([]);
  expect(check(document(para("p", [{ insert: "Replace " }, { insert: "in order to", attributes: { code: true } }, { insert: " with " }, { insert: "to", attributes: { code: true } }, { insert: "." }])))).toEqual([]);
});
