import { expect, test } from "bun:test";
import { singleH1Rule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocDocument } from "../../doc-schema";
const heading = (id: string, level: number) => ({
  ...paragraph(id, id),
  type: "heading" as const,
  props: { level },
});
const check = (doc: DocDocument) =>
  singleH1Rule.check({ document: doc, blocks: orderedBlocks(doc) });
test("single-h1 detects its condition and accepts the corrected form", () => {
  expect(check(document(heading("a", 1), heading("b", 1)))).toHaveLength(1);
  expect(check(document(heading("a", 1), heading("b", 2)))).toEqual([]);
});
