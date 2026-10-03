import type { Judge, JudgeQuestion } from "../types";

/** A Judge for tests: `answer` gives P(true) for each question, with no network and no cache. */
export function createFakeJudge(answer: (question: JudgeQuestion) => number): Judge {
  return {
    async ask(questions) {
      return new Map(questions.map((question) => [question.key, answer(question)]));
    },
  };
}
