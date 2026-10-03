import { expect, test } from "bun:test";
import { fieldsNamed, heading, item, judgedBlocks, page, paragraph } from "../../judge/fixtures";
import { conditionFirstRule } from "./index";

// Each row is a block's text. The negatives include the shapes wave 1 reviewers rejected.
const asked = [
  "Run the tests if the build passes.",
  // The tagger reads a capitalized "Use" as a proper noun. It is still a command.
  "Use a cache when the page is large.",
  "Restart the service first when imported TypeScript changed.",
  "Use recursive:true only when the intended deletion includes all children.",
  "Merge the branch after the review passes.",
  "Keep the dialog open until the downloads are ready.",
  "Run commands from the repository unless a step names another directory.",
];
const skipped = [
  "If the build passes, run the tests.", // the condition already comes first
  "The build runs when you push.", // no command
  "Run this once per repository.", // a frequency, not a condition
  "Call the service before editing.", // no subject
  "Restart the clients after each release of the docs tool.", // no verb
  "Use a cache when needed.", // no subject and verb
  "Perform those actions only when they are part of the release scope.", // "they" would come before its noun
  "Write \"base\" when that is the meaning.", // so would "that"
  "Split and link when a secondary purpose interrupts the main task.", // two commands share the condition
  "Read the guide next, because the service refuses writes until the task reads the guide.", // the condition guards "refuses"
  "Check if the file exists.", // a question, not a condition
];

test("asks only about a command followed by an if, unless, when, before, after, or until clause with a subject and verb", async () => {
  const blocks = [...asked, ...skipped].map((text, i) => paragraph(`b${i}`, text));
  const label = item("label", [{ insert: "Review Before Anything Lands", attributes: { bold: true } }]);
  const doc = page(heading("h", "Testing"), ...blocks, label);
  expect(await judgedBlocks(conditionFirstRule, doc)).toEqual(asked.map((_, i) => `b${i}`));
});

test("gives Jev the block and the clause it found, with code spans as written", () => {
  const doc = page(heading("h", "Testing"), paragraph("p", [{ insert: "Rebuild the index if " }, { insert: "docs.json", attributes: { code: true } }, { insert: " changes." }]));
  const state = conditionFirstRule.judge!.state(doc, "p");
  expect(state).toEqual({ heading: "Testing", block: "Rebuild the index if `docs.json` changes.", clause: "if `docs.json` changes" });
  expect(Object.keys(state)).toEqual(expect.arrayContaining(fieldsNamed(conditionFirstRule.judge!.question)));
});
