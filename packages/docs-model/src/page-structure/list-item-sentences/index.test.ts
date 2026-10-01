import { expect, test } from "bun:test";
import { listItemSentencesRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocBlock, DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  listItemSentencesRule.check({ document: doc, blocks: orderedBlocks(doc) });
const item = (id: string, text: string): DocBlock => ({
  ...paragraph(id, text),
  type: "list-item",
});
test("list-item-sentences detects its condition and accepts the corrected form", () => {
  expect(
    check(document(item("i", "The build runs. Tests follow. Docs ship."))),
  ).toHaveLength(1);
  const parent = item("i", "The build runs. Tests follow.");
  parent.children = ["c"];
  const doc = document(parent);
  doc.blocks.c = item("c", "Docs ship. Tags follow.");
  expect(check(doc)).toEqual([]);
});
test("periods inside code spans do not end a sentence", () => {
  expect(
    check(document(item("i", "Run `a. B. C.` first. Then publish."))),
  ).toEqual([]);
});
