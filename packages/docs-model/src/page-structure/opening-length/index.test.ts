import { expect, test } from "bun:test";
import { openingLengthRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  openingLengthRule.check({ document: doc, blocks: orderedBlocks(doc) });
test("opening-length detects its condition and accepts the corrected form", () => {
  const found = check(
    document(paragraph("p", "One. Two. Three. Four. Five."), paragraph("q", "Body.")),
  );
  expect(found).toHaveLength(1);
  expect(found[0]!.message).toContain("5");
  expect(
    check(document(paragraph("p", "One. Two. Three. Four."), paragraph("q", "Body."))),
  ).toEqual([]);
});
