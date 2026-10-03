import { expect, test } from "bun:test";
import { detect, fix, paragraph, row } from "../replacement/fixtures";
import { fillerRuleFor } from "./index";

// The profile flags every filler deletion. These rows autofix, to test the deletion mechanics.
const filler = { category: "filler", origin: "filler" } as const;
const rule = fillerRuleFor([
  row("simply", "", filler),
  row("basically", "", filler),
  row("actually", "", filler),
  row("really", "", filler),
  row("just", "(delete) | only", { ...filler, tier: "flag", note: '"Just" can mean only or recently.' }),
  row("whatnot", "", { ...filler, tier: "flag", note: "Name the list in full." }),
  // A style-guide row: ste.replacement reports it, so this rule must not.
  row("in order to", "to"),
]);

test.each([
  ["Simply run the check. You can simply run it.", "Run the check. You can run it."],
  ["Basically, it works. It is, basically, a wrapper.", "It works. It is a wrapper."],
  // Neighbors share a comma, so their deletions merge, and every sentence boundary survives.
  ["It works, basically, actually. Retry if needed.", "It works. Retry if needed."],
  ["It is, basically, actually, a wrapper. Use it.", "It is a wrapper. Use it."],
  ["Basically, simply run it. It works, really.", "Run it. It works."],
])("deletes filler with its punctuation and capitalizes the sentence it opened: %p", (text, expected) => {
  expect(fix(rule, text)).toBe(expected);
});

test("keeps filler that carries meaning, and flags filler that a person must resolve", () => {
  expect(detect(rule, paragraph("p", "This is not simply a wrapper, in order to ship."))).toEqual([]);
  expect(detect(rule, paragraph("p", "Just add tests and whatnot.")).map((m) => [m.message, m.autofixable])).toEqual([
    ['Write "only" instead of "Just", or delete it. "Just" can mean only or recently.', false],
    ['Avoid "whatnot". Name the list in full.', false],
  ]);
});
