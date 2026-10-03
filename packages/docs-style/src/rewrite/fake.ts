import type { RewriteRequest, RewriteStrength, Rewriter } from "../types";
import { checkAnswer } from "./answer";

/**
 * A Rewriter for tests: `fn` plays the model and returns the masked markdown answer. It runs the
 * same answer check as the BAML adapter, so a malformed answer throws RewriteAnswerError here too.
 */
export function createFakeRewriter(
  fn: (request: RewriteRequest, strength: RewriteStrength) => string | Promise<string>,
): Rewriter {
  return {
    async rewrite(request, strength) {
      const started = performance.now();
      const markdown = await fn(request, strength);
      const model = `fake-${strength}`;
      checkAnswer(request, markdown, model);
      return { markdown, model, ms: Math.round(performance.now() - started) };
    },
  };
}
