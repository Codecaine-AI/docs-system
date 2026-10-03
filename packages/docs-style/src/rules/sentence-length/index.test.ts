import { expect, test } from "bun:test";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { thresholds } from "../../profile";
import { sentenceLengthRule } from "./index";

const { proceduralSentenceWords, descriptiveSentenceWords } = thresholds;

function block(id: string, type: DocBlock["type"], text: string, props: Record<string, unknown> = {}): DocBlock {
  return { id, type, props, text: [{ insert: text }], children: [] };
}

function detect(...blocks: DocBlock[]) {
  const root: DocBlock = { id: "root", type: "paragraph", props: {}, children: blocks.map((b) => b.id) };
  const document: DocDocument = { schemaVersion: 1, id: "test", root: "root", blocks: Object.fromEntries([root, ...blocks].map((b) => [b.id, b])) };
  return sentenceLengthRule.detect!({ document, blocks: orderedBlocks(document) });
}

/** One sentence of exactly `words` words: `opening`, then filler. */
const sentence = (opening: string, words: number) =>
  `${opening} ${Array(words - opening.split(" ").length).fill("item").join(" ")}.`;

/** Over the instruction limit, within the description limit. */
const between = proceduralSentenceWords + 1;

test("an instruction gets the procedural limit and a description the descriptive limit", () => {
  const instruction = sentence("Run the check on", between);
  expect(detect(block("a", "paragraph", instruction))).toEqual([
    {
      blockId: "a",
      field: "text",
      message: `Instruction has ${between} words. The limit is ${proceduralSentenceWords}.`,
      evidence: instruction,
      sentence: instruction,
    },
  ]);
  expect(detect(block("a", "paragraph", sentence("If the hash is stale, reload the page with", between)))).toHaveLength(1);
  // "Code" can be a verb, but here it opens a noun subject, so the sentence describes.
  expect(detect(block("a", "paragraph", sentence("Code blocks hold the text of", between)))).toEqual([]);
  // Reference text describes even when it opens with a verb.
  const cell: DocBlock = { id: "t", type: "structured-table", props: { columns: ["Step"], rows: [[sentence("Run the check on", between)]] }, children: [] };
  expect(detect(cell)).toEqual([]);

  const long = sentence("The check runs on", descriptiveSentenceWords + 1);
  expect(detect(block("a", "paragraph", long))).toMatchObject([
    { message: `Sentence has ${descriptiveSentenceWords + 1} words. The limit is ${descriptiveSentenceWords}.` },
  ]);
});

test("a numbered step that opens with a verb is an instruction, even where prose reads a noun subject", () => {
  const text = sentence("Run doctor, preview reinstall, restart client or reload", between);
  expect(detect(block("p", "paragraph", text))).toEqual([]);
  expect(detect(block("s", "list-item", text, { ordered: true }))).toHaveLength(1);
});

test("titles and labels are not sentences", () => {
  const long = sentence("The check runs on", descriptiveSentenceWords + 1);
  const label: DocBlock = { id: "b", type: "list-item", props: {}, text: [{ insert: long, attributes: { bold: true } }], children: [] };
  expect(detect(block("h", "heading", long, { level: 2 }), label)).toEqual([]);
});
