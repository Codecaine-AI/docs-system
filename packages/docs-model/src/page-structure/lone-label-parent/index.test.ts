import { expect, test } from "bun:test";
import { loneLabelParentRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocBlock, DocDocument } from "../../doc-schema";

const check = (doc: DocDocument) => loneLabelParentRule.check({ document: doc, blocks: orderedBlocks(doc) });
const item = (id: string, text: string, children: string[] = []): DocBlock => ({ ...paragraph(id, text), type: "list-item", children });
const withBlocks = (doc: DocDocument, ...blocks: DocBlock[]) => ({ ...doc, blocks: { ...doc.blocks, ...Object.fromEntries(blocks.map((b) => [b.id, b])) } });

const rules = [item("r1", "Set the lane in the descriptor."), item("r2", "Keep the default lane.")];

test("flags one label bullet that holds the whole list", () => {
  const doc = withBlocks(document(paragraph("lead", "Three rules apply."), item("label", "Lane Rules", ["r1", "r2"])), ...rules);
  expect(check(doc).map((m) => m.blockId)).toEqual(["label"]);
});

test("accepts two label groups, a sentence parent, and flat items", () => {
  const groups = withBlocks(
    document(paragraph("lead", "The ops follow these rules."), item("a", "Op fields", ["r1"]), item("b", "Applying ops", ["r2"])),
    ...rules,
  );
  expect(check(groups)).toEqual([]);
  const sentence = withBlocks(document(item("s", "Each lane rule holds for every block type.", ["r1", "r2"])), ...rules);
  expect(check(sentence)).toEqual([]);
  expect(check(document(paragraph("lead", "Two rules apply."), ...rules))).toEqual([]);
});
