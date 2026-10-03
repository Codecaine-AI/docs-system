import { describe, expect, test } from "bun:test";
import { rewrite } from "./fixtures";
import { checkMeaningWords } from "./meaning-words";

const meaning = (before: string, after: string | string[]) => checkMeaningWords(rewrite(before, after));

describe("meaning-words rejects a rewrite that breaks a category's rule", () => {
  test.each([
    // Negations keep their exact count.
    ["an added negation", "Repository themes enter the chain.", "Repository themes do not enter the chain.", 'negation "not" 0 -> 1'],
    ["an added contracted negation", "Repository themes enter the chain.", "Repository themes don't enter the chain.", 'negation "not" 0 -> 1'],
    ["a negation swapped for another", "A sweep never writes a page.", "A sweep writes no page.", 'negation "never" 1 -> 0, negation "no" 0 -> 1'],
    ["an added without", "The sweep runs with a judge.", "The sweep runs without a judge.", 'negation "without" 0 -> 1'],
    // Limiters and quantifiers never drop, and no new kind appears.
    ["a dropped limit", "A finding blocks completion only when it is introduced.", "A finding blocks completion when it is introduced.", 'limiter "only" 1 -> 0'],
    ["an added limit", "The profile bans the progressive tense.", "The profile bans only the progressive tense.", 'limiter "only" 0 -> 1'],
    ["a dropped limit phrase", "Each column targets at least 220 pixels.", "Each column targets 220 pixels.", 'limiter "at least" 1 -> 0'],
    ["a quantifier swapped", "Every page gets a review.", "Some pages get a review.", 'limiter "every" 1 -> 0, limiter "some" 0 -> 1'],
    ["a condition word swapped", "Give a view when the purpose calls for judgment.", "If the purpose calls for judgment, give a view.", 'limiter "if" 0 -> 1, limiter "when" 1 -> 0'],
    // Modals never drop, and no new kind appears.
    ["advice turned into a rule", "Each page should have one opening paragraph.", "Each page must have one opening paragraph.", 'modal "must" 0 -> 1, modal "should" 1 -> 0'],
    ["a modal inside a contraction", "The model can't see a code span.", "The model does not see a code span.", 'modal "can" 1 -> 0'],
    // Connectors never drop, and "including", "such as", and "for example" never grow.
    ["a dropped reason", "The sweep stops because Jev is down.", "The sweep stops. Jev is down.", 'connector "because" 1 -> 0'],
    ["an added including", "The package derives lookup, storage, and fixup.", "The package derives lookup, including storage and fixup.", 'connector "including" 0 -> 1'],
    ["an added includes, which makes a list partial", "The CLI covers reading, discovery, and export.", "The CLI includes reading, discovery, and export.", 'connector "including" 0 -> 1'],
    ["an example written as e.g.", "Name a technical noun.", "Name a technical noun, e.g. change set.", 'connector "for example" 0 -> 1'],
  ])("%s", (_, before, after, detail) => {
    expect(meaning(before, after)).toEqual({ id: "meaning-words", ok: false, detail });
  });
});

describe("meaning-words accepts a rewrite that keeps the logic", () => {
  test.each([
    ["a contraction of not", "Do not edit the file.", "Don't edit the file."],
    ["cannot written as two words", "The model cannot see a code span.", "The model can not see a code span."],
    ["can't for cannot", "The model cannot see a code span.", "The model can't see a code span."],
    [
      "a limiter, a modal, and a connector repeated across bullets",
      "If a check fails, the sweep must reject the rewrite and report it, because a person reviews it.",
      [
        "The sweep handles a failed check in two steps.",
        "If a check fails, the sweep must reject the rewrite, because a person reviews it.",
        "If a check fails, the sweep must report the rewrite, because a person reviews it.",
      ],
    ],
    ["a meaning word inside a longer word", "The allowance is small.", "The budget is small."],
    ["at most counted once, not again as most", "Keep at most 5 bullets.", "Use at most 5 bullets."],
  ])("%s", (_, before, after) => {
    expect(meaning(before, after)).toMatchObject({ id: "meaning-words", ok: true });
  });
});
