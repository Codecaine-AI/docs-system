import { expect, test } from "bun:test";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { nounClusterRule } from "./index";

function detect(...blocks: DocBlock[]) {
  const root: DocBlock = { id: "root", type: "paragraph", props: {}, children: blocks.map((b) => b.id) };
  const document: DocDocument = { schemaVersion: 1, id: "test", root: "root", blocks: Object.fromEntries([root, ...blocks].map((b) => [b.id, b])) };
  return nounClusterRule.detect!({ document, blocks: orderedBlocks(document) });
}

const paragraph = (text: string): DocBlock => ({ id: "p", type: "paragraph", props: {}, text: [{ insert: text }], children: [] });
const evidence = (text: string) => detect(paragraph(text)).map((match) => match.evidence);

test("flags four nouns in a row, with the cluster as evidence", () => {
  expect(detect(paragraph("The docs service state directory keeps the theme."))).toMatchObject([
    {
      field: "text",
      message: "4 nouns in a row.",
      evidence: "docs service state directory",
      sentence: "The docs service state directory keeps the theme.",
    },
  ]);
});

test("a registered multi-word technical noun counts as one noun", () => {
  expect(evidence("The theme color cache entry keeps the value.")).toEqual(["theme color cache entry"]);
  // "state schema" is a technical noun on the Vocabulary page.
  expect(evidence("The state schema cache entry keeps the value.")).toEqual([]);
});

test("a verb that the tagger reads as a noun ends the cluster", () => {
  // wink tags "stores" and "use" as nouns in these sentences.
  expect(evidence("The docs service state directory stores theme files.")).toEqual(["docs service state directory"]);
  expect(evidence("Codex and Claude use stdio MCP bridges.")).toEqual([]);
});

test("table cells, verbless labels, and quoted examples are not prose", () => {
  const cell: DocBlock = { id: "t", type: "structured-table", props: { columns: ["Path"], rows: [["The docs service state directory keeps the theme."]] }, children: [] };
  expect(detect(cell)).toEqual([]);
  expect(evidence("Docs service state directory")).toEqual([]);
  expect(evidence('Avoid "the docs service state directory keeps the theme" in prose.')).toEqual([]);
});
