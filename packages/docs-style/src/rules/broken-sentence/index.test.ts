import { expect, test } from "bun:test";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { brokenSentenceRule } from "./index";

function detect(...blocks: DocBlock[]) {
  const root: DocBlock = { id: "root", type: "paragraph", props: {}, children: blocks.map((b) => b.id) };
  const document: DocDocument = { schemaVersion: 1, id: "test", root: "root", blocks: Object.fromEntries([root, ...blocks].map((b) => [b.id, b])) };
  return brokenSentenceRule.detect!({ document, blocks: orderedBlocks(document) });
}

const block = (text: string, type: DocBlock["type"] = "paragraph"): DocBlock => ({ id: "b", type, props: {}, text: [{ insert: text }], children: [] });
const evidence = (text: string, type?: DocBlock["type"]) => detect(block(text, type)).map((match) => match.evidence);

test("flags a period followed by a lowercase word, where an em dash was", () => {
  expect(detect(block("The viewer hands the text to the editor. the save loop writes it."))).toEqual([
    {
      blockId: "b",
      field: "text",
      message: "Broken sentence: a period is followed by a lowercase word. A person must repair it.",
      evidence: "editor. the",
    },
  ]);
  // After a code span, too: "Applies to: `x`. every future surface".
  expect(evidence("Applies to: `docs-viewer`. every future surface.", "list-item")).toEqual(["\u0000. every"]);
});

test.each([
  ["an abbreviation", "Use a short word, e.g. the plain one."],
  ["an ellipsis", 'Write "both ... and" in full.'],
  ["a snake_case name", "Run the check. docs_check reports the findings."],
  ["a file name", "Open the bundle. doc.json holds the page."],
  ["a camelCase name", "Ops refuse bad input. splitBlock is not revalidated."],
  ["a hyphenated package name", "No package imports it. docs-model stays pure."],
  ["a period that is not a sentence end", "Type a number plus . plus a space."],
  ["text inside a code span", "Run `git log. then` first."],
])("keeps %s", (_, text) => {
  expect(evidence(text)).toEqual([]);
});

test("a list item may open with a short label and a fragment", () => {
  expect(evidence("B. screen object kind on canvas boards", "list-item")).toEqual([]);
});
