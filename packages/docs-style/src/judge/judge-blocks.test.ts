import { expect, test } from "bun:test";
import { JudgeUnavailable, type Judge, type JudgeQuestion, type StyleRule } from "../types";
import { heading, page, paragraph } from "./fixtures";
import { judgeBlocks } from "./judge-blocks";

const doc = page(heading("h", "Setup"), paragraph("p1", "First."), paragraph("p2", "Second."));
const base = { layer: "structure", docsPath: "x", summary: "s", hint: "h" } as const;
const judged: StyleRule = {
  ...base,
  id: "ste.judged",
  judge: {
    appliesTo: ["paragraph"],
    select: (_doc, id) => id !== "p2",
    state: (_doc, id) => ({ block: id }),
    question: "Is `block` bad?",
    threshold: 0.5,
    message: "Bad.",
  },
};
const detectOnly: StyleRule = { ...base, id: "ste.detect-only", detect: () => [] };

test("asks each rule about the target blocks it applies to, in one call, and returns P(true) per rule and block", async () => {
  const calls: JudgeQuestion[][] = [];
  const judge: Judge = {
    async ask(questions) {
      calls.push([...questions]);
      return new Map(questions.map((question) => [question.key, 0.9]));
    },
  };
  const answers = await judgeBlocks({
    doc,
    targets: [
      { rule: judged, blockIds: ["h", "p1", "p2"] },
      { rule: detectOnly, blockIds: ["p1"] },
    ],
    judge,
  });
  expect(answers).toEqual([{ ruleId: "ste.judged", blockId: "p1", probability: 0.9 }]);
  expect(calls.map((questions) => questions.map((question) => question.state))).toEqual([[{ block: "p1" }]]);
});

test("does not call the judge when no target block applies", async () => {
  const judge: Judge = {
    async ask() {
      throw new JudgeUnavailable("TYPESAFE_API_KEY is not set.");
    },
  };
  expect(await judgeBlocks({ doc, targets: [{ rule: judged, blockIds: ["h", "p2"] }], judge })).toEqual([]);
});
