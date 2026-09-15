import { expect, test } from "bun:test";
import { headingOrderRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocDocument } from "../../doc-schema";
const heading = (id: string, level: number) => ({
  ...paragraph(id, id),
  type: "heading" as const,
  props: { level },
});
const check = (doc: DocDocument) =>
  headingOrderRule.check({ document: doc, blocks: orderedBlocks(doc) });
test("heading-order detects its condition and accepts the corrected form", () => {
  expect(check(document(heading("a", 2), heading("b", 4)))).toHaveLength(1);
  expect(check(document(heading("a", 2), heading("b", 3)))).toEqual([]);
});
