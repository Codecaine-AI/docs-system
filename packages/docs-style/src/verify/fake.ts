import type { MeaningDifference, Verifier } from "../types";

type CompareInput = Parameters<Verifier["compare"]>[0];

/**
 * A Verifier for tests: `fn` plays the model and returns the differences it finds. The verdict is
 * "same" only when it returns none, the same rule the BAML verifier applies.
 */
export function createFakeVerifier(fn: (input: CompareInput) => MeaningDifference[] | Promise<MeaningDifference[]>): Verifier {
  return {
    async compare(input) {
      const started = performance.now();
      const differences = await fn(input);
      return { same: differences.length === 0, differences, model: "fake-verifier", ms: Math.round(performance.now() - started) };
    },
  };
}
