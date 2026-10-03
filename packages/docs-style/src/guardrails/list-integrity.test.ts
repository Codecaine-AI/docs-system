import { describe, expect, test } from "bun:test";
import { rewrite } from "./fixtures";
import { checkListIntegrity } from "./list-integrity";

const lists = (before: string, after: string | string[]) => checkListIntegrity(rewrite(before, after));

describe("list-integrity rejects a rewrite that changes what a sentence lists", () => {
  test.each([
    [
      "a semicolon that became a comma and an and",
      "Clicks stay live only while the reader picks a target; the maximize action stays available.",
      "Clicks stay live only while the reader picks a target, and the maximize action stays available.",
      'a semicolon became ", and" (semicolons 1 -> 0, ", and" 0 -> 1)',
    ],
    [
      "a dash clause pulled into a series",
      "The block contract: every type owns its state schema, typed actions, and theme — and the path for adding a custom component.",
      "The block contract: every type owns its state schema, typed actions, and theme, and the path for adding a custom component.",
      'series "every type owns its state schema, typed actions,…" took in "the path for adding a custom…"',
    ],
    [
      "an and added to a series that had none",
      "The workbench supplies the callbacks, data, persistence, locks, without defining block rendering.",
      "The workbench supplies the callbacks, data, persistence, and locks, without defining block rendering.",
      'series "The workbench supplies the callbacks, data, persi…" gained an "and" or "or" before an item',
    ],
  ])("%s", (_, before, after, detail) => {
    expect(lists(before, after)).toEqual({ id: "list-integrity", ok: false, detail });
  });
});

describe("list-integrity accepts a rewrite that keeps every series", () => {
  test.each([
    ["a semicolon that became a period", "The build runs; the tests follow, and retries wait.", ["The build runs.", "The tests follow, and retries wait."]],
    ["a condition moved before its instruction", "Use this runbook when code, standards, or skills change.", "When code, standards, or skills change, use this runbook."],
    ["a series kept word for word in a bullet", "The rail sets fonts, sizes, and colors; it saves each one.", ["The rail sets fonts, sizes, and colors.", "It saves each one."]],
  ])("%s", (_, before, after) => {
    expect(lists(before, after).ok).toBe(true);
  });
});
