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

test("flags label groups that open a list with no lead sentence, as headings would", () => {
  const more = [item("r3", "Target the attribute pair."), item("r4", "Write the class literally.")];
  const table = { ...paragraph("lanes", ""), type: "structured-table" as const };
  const doc = withBlocks(
    document(table, item("classes", "Lane Classes", ["r1", "r2"]), item("changing", "Changing a Lane", ["r3", "r4"])),
    ...rules, ...more,
  );
  expect(check(doc).map((m) => m.blockId)).toEqual(["classes", "changing"]);
  // The same groups after a lead sentence read as one paragraph, and pass.
  const led = withBlocks(
    document(paragraph("lead", "Lanes follow two sets of rules."), item("classes", "Lane Classes", ["r1", "r2"]), item("changing", "Changing a Lane", ["r3", "r4"])),
    ...rules, ...more,
  );
  expect(check(led)).toEqual([]);
});
