import { describe, expect, test } from "bun:test";
import type { DocDocument } from "@codecaine-ai/docs-model";
import type { LintFinding, LintReport } from "@codecaine-ai/docs-model/lint";
import {
  summarizeStyleFindings, writeStyleFeedback,
  type JudgedFinding, type JudgmentEngine, type JudgmentRule,
} from "./lint-feedback";

const finding = (blockId: string, ruleId: string, overrides: Partial<LintFinding> = {}): LintFinding => ({
  blockId, ruleId, field: "text", message: "Problem.", evidence: "Text.", severity: "warning",
  suggestion: "Fix.", docsPath: "99-appendix/10-style-guide", introduced: true, ...overrides,
});
const report = (...findings: LintFinding[]): LintReport => ({ phase: "complete", findings, blocking: [] });

describe("summarizeStyleFindings", () => {
  test("reports introduced findings and findings on touched blocks, never untouched legacy ones", () => {
    const legacy = finding("old", "writing.filler", { introduced: false });
    const touchedLegacy = finding("edited", "writing.filler", { introduced: false });
    const introduced = finding("fresh", "writing.filler");
    expect(summarizeStyleFindings(report(legacy, touchedLegacy, introduced), ["edited"])?.shown.map((f) => f.block))
      .toEqual(["edited", "fresh"]);
    expect(summarizeStyleFindings(report(legacy), [])).toBeUndefined();
  });

  test("ranks errors, then gated rules, then the rest in report order, and caps at five", () => {
    const result = summarizeStyleFindings(report(
      finding("w1", "writing.filler"),
      finding("u1", "future.unlisted-rule"),
      finding("g1", "structure.heading-order"),
      finding("e1", "writing.no-em-dash", { severity: "error" }),
      finding("w2", "writing.sentence-length"),
      finding("g2", "writing.dense-paragraph"),
      finding("e2", "writing.no-em-dash", { severity: "error" }),
      finding("g3", "structure.image-alt"),
    ), []);
    expect(result?.shown.map((f) => f.block)).toEqual(["e1", "e2", "g1", "g2", "g3"]);
    expect(result?.omitted).toBe(3);
  });

  test("within a rank, each rule's first finding precedes any rule's second", () => {
    const result = summarizeStyleFindings(report(
      finding("a1", "structure.list-item-sentences"),
      finding("a2", "structure.list-item-sentences"),
      finding("a3", "structure.list-item-sentences"),
      finding("b1", "structure.heading-order"),
    ), []);
    expect(result?.shown.map((f) => f.block)).toEqual(["a1", "b1", "a2", "a3"]);
  });
});

describe("judgment seam", () => {
  const page = (text: string): DocDocument => ({
    schemaVersion: 1, id: "judged", title: "Judged", root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: ["intro", "p", "h"] },
      intro: { id: "intro", type: "paragraph", props: {}, children: [], text: [{ insert: "This page explains the release." }] },
      p: { id: "p", type: "paragraph", props: {}, children: [], text: [{ insert: text }] },
      h: { id: "h", type: "heading", props: { level: 2 }, children: [], text: [{ insert: "Details" }] },
    },
  });
  const before = page("We ship on Tuesday.");
  const after = page("We ship on Tuesday — then we rest.");
  const base = { appliesTo: ["paragraph"] as const, threshold: 0.7 };
  const rules: JudgmentRule[] = [
    { ...base, id: "judged.buried-point", kind: "noul", question: "Does `block.text` bury its main point?", gate: true, fix: "Lead with the main point." },
    { ...base, id: "judged.tone", kind: "choice", question: "Which best describes the tone of `block.text`?", gate: false, threshold: 0.6,
      options: [{ label: "neutral" }, { label: "promotional", fix: "State the fact without promotion." }] },
    { ...base, id: "judged.jargon", kind: "noul", question: "Does `block.text` use unexplained jargon?", gate: true, fix: "Define the term." },
    { ...base, id: "judged.heading-scope", kind: "score", question: "How poorly does `block.text` name its section?", appliesTo: ["heading"], gate: true, fix: "Name the subject." },
  ];
  const judged = (blockId: string, ruleId: string, probability: number, fix: string): JudgedFinding =>
    ({ blockId, ruleId, probability, fix, field: "text", message: `${ruleId} applies.`, evidence: "" });

  test("one judge call over touched blocks merges threshold-clearing answers by gate", async () => {
    const calls: Parameters<JudgmentEngine["judge"]>[0][] = [];
    const engine: JudgmentEngine = { judge: async (input) => {
      calls.push(input);
      return [
        judged("p", "judged.tone", 0.65, "State the fact without promotion."),
        judged("p", "judged.buried-point", 0.9, "Lead with the main point."),
        judged("p", "judged.jargon", 0.5, "Define the term."),
        judged("intro", "judged.buried-point", 0.95, "Lead with the main point."),
      ];
    } };
    const result = await writeStyleFeedback({ before, after, engine, rules });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.blockIds).toEqual(["p"]);
    expect(calls[0]!.rules.map((rule) => rule.id)).toEqual(["judged.buried-point", "judged.tone", "judged.jargon"]);
    expect(result?.shown.map((f) => f.rule)).toEqual(["writing.no-em-dash", "judged.buried-point", "judged.tone"]);
    expect(result?.shown.slice(1)).toEqual([
      { block: "p", rule: "judged.buried-point", problem: "judged.buried-point applies.", fix: "Lead with the main point." },
      { block: "p", rule: "judged.tone", problem: "judged.tone applies.", fix: "State the fact without promotion." },
    ]);
  });

  test("a failing engine leaves deterministic findings, and no rule applying skips the call", async () => {
    const failing: JudgmentEngine = { judge: async () => { throw new Error("engine offline"); } };
    expect((await writeStyleFeedback({ before, after, engine: failing, rules }))?.shown.map((f) => f.rule))
      .toEqual(["writing.no-em-dash"]);
    let called = false;
    const idle: JudgmentEngine = { judge: async () => { called = true; return []; } };
    await writeStyleFeedback({ before, after, engine: idle, rules: rules.filter((rule) => rule.appliesTo.includes("heading")) });
    expect(called).toBe(false);
  });
});
