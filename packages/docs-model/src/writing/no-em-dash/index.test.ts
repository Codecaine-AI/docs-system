import { expect, test } from "bun:test";
import { noEmDashRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  noEmDashRule.check({ document: doc, blocks: orderedBlocks(doc) });
test("no-em-dash detects its condition and accepts the corrected form", () => {
  expect(check(document(paragraph("p", "New — prose.")))).toHaveLength(1);
  expect(check(document(paragraph("p", "Clear prose.")))).toEqual([]);
});
