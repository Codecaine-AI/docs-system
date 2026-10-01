import { expect, test } from "bun:test";
import { semicolonRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  semicolonRule.check({ document: doc, blocks: orderedBlocks(doc) });
test("semicolon detects its condition and accepts the corrected form", () => {
  expect(
    check(document(paragraph("p", "The build runs; the tests follow."))),
  ).toHaveLength(1);
  expect(
    check(document(paragraph("p", "The build runs. The tests follow."))),
  ).toEqual([]);
});
test("semicolons in code, URLs and HTML entities are literal", () => {
  expect(
    check(
      document(
        paragraph(
          "p",
          "Run `a; b` and open https://example.com/a;b with &amp; intact.",
        ),
      ),
    ),
  ).toEqual([]);
});
