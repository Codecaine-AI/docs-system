import type { Judge, JudgeQuestion } from "../types";

interface Waiting {
  questions: readonly JudgeQuestion[];
  resolve(answers: Map<string, number>): void;
  reject(error: unknown): void;
}

/**
 * Funnels every ask() in a sweep into one call at a time. A Judge already runs the requests of one
 * call in parallel, so Tier 2 pages and Tier 3 fact checks asking at once would multiply that and
 * overrun Jev's rate limit. Questions that arrive while a call runs go out together in the next one.
 */
export function queueJudge(judge: Judge): Judge {
  let waiting: Waiting[] = [];
  let running = false;
  async function drain(): Promise<void> {
    running = true;
    while (waiting.length) {
      const batch = waiting;
      waiting = [];
      // A key is unique only within its own ask() call, so each caller gets a prefix.
      const questions = batch.flatMap((entry, i) => entry.questions.map((question) => ({ ...question, key: `${i}:${question.key}` })));
      try {
        const answers = await judge.ask(questions);
        batch.forEach((entry, i) => {
          const own = new Map<string, number>();
          for (const question of entry.questions) {
            const probability = answers.get(`${i}:${question.key}`);
            if (probability !== undefined) own.set(question.key, probability);
          }
          entry.resolve(own);
        });
      } catch (error) {
        for (const entry of batch) entry.reject(error);
      }
    }
    running = false;
  }
  return {
    ask(questions) {
      return new Promise((resolve, reject) => {
        waiting.push({ questions, resolve, reject });
        if (!running) void drain();
      });
    },
  };
}
