import { expect, test } from "bun:test";
import { detect, paragraph, row } from "../replacement/fixtures";
import { oneNameRuleFor } from "./index";

test("flags an avoided name, but not a plural, compound, file name, or phrase the note keeps", () => {
  const rule = oneNameRuleFor([
    { concept: "The unit a reader opens", use: "page", avoid: ["doc", "article"] },
    {
      concept: "A stored agent conversation",
      use: "session",
      avoid: ["thread"],
      note: '"New thread" stays as the name of the UI action.',
    },
  ]);
  const found = detect(
    rule,
    paragraph("a", "Open the doc. Each page has a doc.json in the docs folder, and the doc renderer reads it."),
    paragraph("b", "Click New thread. The thread is saved."),
  );
  expect(found.map((m) => [m.blockId, m.evidence, m.message, m.sentence])).toEqual([
    ["a", "doc", 'Use "page" for the unit a reader opens. This page uses both.', "Open the doc."],
    ["b", "thread", 'Use "session" for a stored agent conversation.', "The thread is saved."],
  ]);
});

test("still flags an all-caps name the canon avoids, but never an identifier", () => {
  const rule = oneNameRuleFor([{ concept: "An AI actor", use: "agent", avoid: ["ai"] }]);
  const found = detect(rule, paragraph("p", "The AI reads aiConfig and ai_mode."));
  expect(found.map((m) => m.evidence)).toEqual(["AI"]);
});

test("leaves a name that a replacement row lists to ste.replacement, so one word gets one finding", () => {
  const groups = [{ concept: "A spawned helper agent", use: "sub-agent", avoid: ["subagent", "child agent"] }];
  const page = paragraph("p", "Spawn a subagent or a child agent.");
  const rows = [row("subagent", "sub-agent", { category: "naming", origin: "habit" })];
  expect(detect(oneNameRuleFor(groups, rows), page).map((m) => m.evidence)).toEqual(["child agent"]);
});
