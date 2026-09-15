import { expect, test } from "bun:test";
import { fillerRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  fillerRule.check({ document: doc, blocks: orderedBlocks(doc) });
test("filler detects its condition and accepts the corrected form", () => {
  expect(
    check(document(paragraph("p", "In order to save, press Save."))),
  ).toHaveLength(1);
  expect(check(document(paragraph("p", "Press Save.")))).toEqual([]);
});
