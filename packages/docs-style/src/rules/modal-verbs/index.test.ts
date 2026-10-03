import { expect, test } from "bun:test";
import { detect, paragraph } from "../replacement/fixtures";
import { modalVerbsRuleFor } from "./index";

test("flags modal verbs with the word to write, skips mentions and names, and never autofixes", () => {
  const rule = modalVerbsRuleFor([
    { word: "should", use: "must", note: "Or rewrite the sentence as a command." },
    { word: "may", use: "can" },
  ]);
  const found = detect(rule, paragraph("p", 'You should run it. It may fail. In May we ship. The word "should" is a modal.'));
  expect(found.map((m) => [m.evidence, m.message, m.sentence])).toEqual([
    ["should", 'Write "must" instead of "should". Or rewrite the sentence as a command.', "You should run it."],
    ["may", 'Write "can" instead of "may".', "It may fail."],
  ]);
  expect(rule.autofix).toBeUndefined();
});
