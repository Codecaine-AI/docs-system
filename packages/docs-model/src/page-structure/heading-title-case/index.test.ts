import { expect, test } from "bun:test";
import { headingTitleCaseRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocBlock, DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  headingTitleCaseRule.check({ document: doc, blocks: orderedBlocks(doc) });
const heading = (text: string): DocBlock => ({
  ...paragraph("h", text),
  type: "heading",
  props: { level: 2 },
});
test("heading-title-case detects its condition and accepts the corrected form", () => {
  const found = check(document(heading("Separate the lead from its gloss")));
  expect(found).toHaveLength(1);
  expect(found[0]!.message).toContain("lead, from, its, gloss");
  expect(check(document(heading("What It Runs on")))).toHaveLength(1);
  expect(
    check(document(heading("Separate the Lead From Its Gloss"))),
  ).toEqual([]);
});
test("code-marked identifiers are skipped and unmarked ones are flagged", () => {
  expect(
    check(document(heading("Call `spawnAgent` in the 2nd Built-in Host"))),
  ).toEqual([]);
  expect(check(document(heading("Call spawnAgent in the Host")))).toHaveLength(
    1,
  );
});
