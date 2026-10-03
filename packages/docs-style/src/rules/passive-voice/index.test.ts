import { expect, test } from "bun:test";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { passiveVoiceRule } from "./index";

function page(...blocks: DocBlock[]): DocDocument {
  const root: DocBlock = { id: "root", type: "paragraph", props: {}, children: blocks.map((b) => b.id) };
  return { schemaVersion: 1, id: "test", root: "root", blocks: Object.fromEntries([root, ...blocks].map((b) => [b.id, b])) };
}

function detect(text: string) {
  const document = page({ id: "p", type: "paragraph", props: {}, text: [{ insert: text }], children: [] });
  return passiveVoiceRule.detect!({ document, blocks: orderedBlocks(document) });
}

const evidence = (text: string) => detect(text).map((match) => match.evidence);

test("flags a passive whose actor a by phrase names", () => {
  expect(detect("The block is validated by the engine.")).toMatchObject([
    { field: "text", message: 'Passive voice: "is validated".', evidence: "is validated", sentence: "The block is validated by the engine." },
  ]);
  // An irregular participle, modifiers between, and the progressive passive.
  expect(evidence("The value is set by the loader.")).toEqual(["is set"]);
  expect(evidence("Drafts are not always stored by the server.")).toEqual(["are not always stored"]);
  expect(evidence("The output is being written by `worker`.")).toEqual(["is being written"]);
  // The by phrase belongs to the passive in its own clause.
  expect(evidence("The block is validated, and the page is rendered by the server.")).toEqual(["is rendered"]);
});

test("flags a passive in an instruction, whose actor is the reader", () => {
  expect(evidence("Run the check after the file is saved.")).toEqual(["is saved"]);
});

test.each([
  ["an agentless passive in a description", "The block is validated before it lands."],
  ['"by" with a means, not an actor', "Rows are sorted by name."],
  ['"by default"', "The value is set by default."],
  ["a plain state", "Run the check when the file is empty."],
  ["a finished state", "Run the check when the sweep is done."],
  ["an un- state", "Run the check when the text is unchanged."],
  ["a compound adjective", "Run the check when the page is read-only."],
  ["a participle before a noun", "Run the check when document order is curated order."],
  ["a quoted example", 'Write "the compiler checks the schema" instead of "the schema is checked".'],
])("keeps %s", (_, text) => {
  expect(detect(text)).toEqual([]);
});

test("the judge reads the block as markdown under its nearest heading", () => {
  const document = page(
    { id: "h", type: "heading", props: { level: 2 }, text: [{ insert: "Writes" }], children: [] },
    { id: "p", type: "paragraph", props: {}, text: [{ insert: "The " }, { insert: "hash", attributes: { code: true } }, { insert: " is checked." }], children: [] },
  );
  expect(passiveVoiceRule.judge!.state(document, "p")).toEqual({ heading: "Writes", block: "The `hash` is checked." });
});
