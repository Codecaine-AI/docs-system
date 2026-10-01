import { expect, test } from "bun:test";
import { labelColonOpenerRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocBlock, DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  labelColonOpenerRule.check({ document: doc, blocks: orderedBlocks(doc) });
const item = (text: string): DocBlock => ({
  ...paragraph("i", text),
  type: "list-item",
});
test("label-colon-opener detects its condition and accepts the corrected form", () => {
  const bold = paragraph("p", "");
  bold.text = [
    { insert: "Lock files keep builds:", attributes: { bold: true } },
    { insert: " the build fails without a lock." },
  ];
  expect(check(document(bold))).toHaveLength(1);
  expect(check(document(item("Key files:")))).toHaveLength(1);
  expect(
    check(document(item("Run 1 (agent run, 4m12s): 14 turns and 31 calls."))),
  ).toHaveLength(1);
  expect(
    check(document(paragraph("p", "The build fails without a lock."))),
  ).toEqual([]);
  expect(
    check(
      document(
        paragraph("p", "The build has three stages: compile, test, and ship."),
      ),
    ),
  ).toEqual([]);
});
test("colons in code spans, URLs and times are not labels", () => {
  expect(
    check(
      document(
        item("`--write`: lowers the budget."),
        paragraph("p", "Open https://example.com/a at 10:30 today."),
      ),
    ),
  ).toEqual([]);
});
