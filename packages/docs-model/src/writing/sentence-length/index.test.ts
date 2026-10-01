import { expect, test } from "bun:test";
import { sentenceLengthRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  sentenceLengthRule.check({ document: doc, blocks: orderedBlocks(doc) });
const words = (n: number) => Array(n).fill("word").join(" ");
test("sentence-length detects its condition and accepts the corrected form", () => {
  const found = check(document(paragraph("p", `Long ${words(30)}.`)));
  expect(found).toHaveLength(1);
  expect(found[0]!.message).toContain("31");
  expect(
    check(document(paragraph("p", `Long ${words(15)}. Next ${words(15)}.`))),
  ).toEqual([]);
});
test("file names, decimals and versions do not end a sentence", () => {
  expect(
    check(
      document(
        paragraph(
          "p",
          `Read budget.json at 1.5 with v1.2.3 ${words(28)}.`,
        ),
      ),
    ),
  ).toHaveLength(1);
});
