import { expect, test } from "bun:test";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { verbFormsRule } from "./index";

function detect(text: string) {
  const blocks: DocBlock[] = [
    { id: "root", type: "paragraph", props: {}, children: ["p"] },
    { id: "p", type: "paragraph", props: {}, text: [{ insert: text }], children: [] },
  ];
  const document: DocDocument = { schemaVersion: 1, id: "test", root: "root", blocks: Object.fromEntries(blocks.map((b) => [b.id, b])) };
  return verbFormsRule.detect!({ document, blocks: orderedBlocks(document) });
}

const evidence = (text: string) => detect(text).map((match) => match.evidence);

test("flags progressive and perfect tenses, with the verb phrase as evidence", () => {
  expect(detect("The tool is closing the file.")).toMatchObject([
    { field: "text", message: 'Progressive tense: "is closing".', evidence: "is closing", sentence: "The tool is closing the file." },
  ]);
  expect(evidence("The rule has already closed the page.")).toEqual(["has already closed"]);
  expect(evidence("Each block is being edited.")).toEqual(["is being edited"]);
  // One phrase, one finding: not a perfect "has been" plus a progressive "been running".
  expect(evidence("The server has been running for an hour.")).toEqual(["has been running"]);
});

test.each([
  ["a gerund", "Before saving, run the check."],
  ["an -ing adjective", "The title is missing."],
  ["an -ing word before a noun", "It is working guidance for every writer."],
  ['"have to"', "You have to run it."],
  ["the main verb have", "The page has a title."],
  ["an -ed adjective after have", "The block has nested children."],
  ["a quoted example", 'The profile bans only the progressive tense, such as "is running".'],
])("keeps %s", (_, text) => {
  expect(detect(text)).toEqual([]);
});
