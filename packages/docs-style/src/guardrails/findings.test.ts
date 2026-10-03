import { describe, expect, test } from "bun:test";
import { checkFixesTarget, checkNoNewFindings } from "./findings";
import { finding, rewrite } from "./fixtures";

const LENGTH = "ste.sentence-length";
const PASSIVE = "ste.passive-voice";
const SEMICOLON = "writing.semicolon";
const ONE_TOPIC = "ste.one-topic";

describe("fixes-target", () => {
  test("passes when every Tier 1 target finding is gone", () => {
    const result = checkFixesTarget({ targetRuleIds: [LENGTH, SEMICOLON], findingsBefore: [finding(LENGTH), finding(LENGTH), finding(SEMICOLON)], findingsAfter: [finding(PASSIVE)] });
    expect(result).toEqual({ id: "fixes-target", ok: true, detail: "Tier 1 targets 3 -> 0" });
  });

  test.each([
    ["sentence length", LENGTH],
    ["passive voice", PASSIVE],
  ])("passes when a rule that is not a presence rule fires less often: %s 2 -> 1", (_, rule) => {
    expect(checkFixesTarget({ targetRuleIds: [rule], findingsBefore: [finding(rule), finding(rule)], findingsAfter: [finding(rule)] })).toEqual({
      id: "fixes-target",
      ok: true,
      detail: "Tier 1 targets 2 -> 1",
    });
  });

  test("passes when a rule that is not a presence rule stays as it was while another target is fixed", () => {
    const result = checkFixesTarget({ targetRuleIds: [SEMICOLON, LENGTH], findingsBefore: [finding(SEMICOLON), finding(LENGTH)], findingsAfter: [finding(LENGTH)] });
    expect(result).toEqual({ id: "fixes-target", ok: true, detail: "Tier 1 targets 2 -> 1" });
  });

  test("fails when a rule that is not a presence rule fires more often", () => {
    const result = checkFixesTarget({ targetRuleIds: [SEMICOLON, LENGTH], findingsBefore: [finding(SEMICOLON), finding(LENGTH)], findingsAfter: [finding(LENGTH), finding(LENGTH)] });
    expect(result).toEqual({ id: "fixes-target", ok: false, detail: `Tier 1 targets not fixed: ${LENGTH} 1 -> 2 (must not grow)` });
  });

  test("fails when no target improved", () => {
    const result = checkFixesTarget({ targetRuleIds: [LENGTH], findingsBefore: [finding(LENGTH)], findingsAfter: [finding(LENGTH)] });
    expect(result).toEqual({ id: "fixes-target", ok: false, detail: "no target improved: Tier 1 targets 1 -> 1" });
  });

  // Wave 1, 50-canvas b-24-canvas-fullscreen-a: the rewrite moved the semicolon instead of removing
  // it. Slop saw 1 -> 1 semicolons, and the old combined count passed at 2 -> 1 because Jev no
  // longer found two topics.
  test("fails when a rewrite moves a semicolon into the next sentence", () => {
    const moved = rewrite(
      "Clicking the inline surface or the button opens a same-window dialog with an interactive viewer; pan and zoom live here, canvas mutation does not.",
      "Clicking the inline surface or the button opens a same-window dialog with an interactive viewer. Pan and zoom live here; canvas mutation does not.",
      { targetRuleIds: [SEMICOLON, ONE_TOPIC], findingsBefore: [finding(SEMICOLON), finding(ONE_TOPIC, 2)], findingsAfter: [finding(SEMICOLON)] },
    );
    expect(checkFixesTarget(moved)).toEqual({ id: "fixes-target", ok: false, detail: `Tier 1 targets not fixed: ${SEMICOLON} 1 -> 1 (must be 0)` });
  });

  test("a vocabulary finding marks a forbidden word, so its rule must be gone too", () => {
    const word = { ...finding("ste.replacement"), layer: "vocabulary" as const };
    const result = checkFixesTarget({ targetRuleIds: ["ste.replacement"], findingsBefore: [word, word], findingsAfter: [word] });
    expect(result).toEqual({ id: "fixes-target", ok: false, detail: "Tier 1 targets not fixed: ste.replacement 2 -> 1 (must be 0)" });
  });

  test.each([
    ["passes when Jev no longer finds it", [], true, "Tier 2 targets 1 -> 0"],
    ["fails when Jev still finds it", [finding(ONE_TOPIC, 2)], false, "Tier 2 targets did not improve: Tier 2 targets 1 -> 1"],
  ])("a Tier 2 target %s on the produced blocks", (_, findingsAfter, ok, detail) => {
    const result = checkFixesTarget({ targetRuleIds: [ONE_TOPIC], findingsBefore: [finding(ONE_TOPIC, 2)], findingsAfter });
    expect(result).toEqual({ id: "fixes-target", ok, detail });
  });

  test.each([
    ["no target rule", [], [finding(LENGTH)]],
    ["no finding of a target rule before the rewrite", [ONE_TOPIC], [finding(LENGTH)]],
  ])("is skipped with %s", (_, targetRuleIds, findingsBefore) => {
    expect(checkFixesTarget({ targetRuleIds, findingsBefore, findingsAfter: [] })).toMatchObject({ ok: true, skipped: true });
  });
});

describe("no-new-findings", () => {
  test("names each rule that fires more often", () => {
    const result = checkNoNewFindings({ findingsBefore: [finding(LENGTH)], findingsAfter: [finding(LENGTH), finding(PASSIVE), finding("writing.semicolon")] });
    expect(result).toEqual({ id: "no-new-findings", ok: false, detail: `${PASSIVE} 0 -> 1, writing.semicolon 0 -> 1` });
  });

  test("passes when every rule fires as often or less", () => {
    const result = checkNoNewFindings({ findingsBefore: [finding(LENGTH), finding(PASSIVE)], findingsAfter: [finding(PASSIVE)] });
    expect(result.ok).toBe(true);
  });
});
