import { expect, test } from "bun:test";
import { denseParagraphRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  denseParagraphRule.check({ document: doc, blocks: orderedBlocks(doc) });
test("dense-paragraph detects its condition and accepts the corrected form", () => {
  expect(
    check(document(paragraph("p", Array(121).fill("word").join(" ")))),
  ).toHaveLength(1);
  expect(check(document(paragraph("p", "Short paragraph.")))).toEqual([]);
});
