import { expect, test } from "bun:test";
import { openingParagraphRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  openingParagraphRule.check({ document: doc, blocks: orderedBlocks(doc) });
test("opening-paragraph detects its condition and accepts the corrected form", () => {
  expect(check(document())).toHaveLength(1);
  expect(check(document(paragraph("p", "Introduction.")))).toEqual([]);
});
