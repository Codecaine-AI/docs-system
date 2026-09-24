import { describe, expect, test } from "bun:test";
import {
  lintDocument,
  lintRules,
  validateLintRules,
  formatLintReport,
} from "./index";
import { document, paragraph } from "./fixtures";
import type { DocBlock, DocBlockType } from "../doc-schema";

function srcBlock(type: DocBlockType, src: string): DocBlock {
  return {
    id: `${type}-block`,
    type,
    props: { src },
    children: [],
  };
}

describe("authoring lint engine", () => {
  test("draft findings are advisory; complete new errors block", () => {
    const doc = document(paragraph("p", "New — prose."));
    expect(lintDocument(doc, { phase: "draft" }).blocking).toEqual([]);
    const report = lintDocument(doc, { phase: "complete" });
    expect(report.blocking.map((f) => f.ruleId)).toEqual([
      "writing.no-em-dash",
    ]);
    expect(formatLintReport(report)).toContain("p.text");
    expect(formatLintReport(report)).toContain(
      "99-appendix/10-style-guide/10-writing-style",
    );
  });
  test("unchanged errors survive regenerated IDs and duplicate additions still block", () => {
    const baseline = document(paragraph("old", "Old — prose."));
    const same = document(paragraph("new", "Old — prose."));
    expect(
      lintDocument(same, { phase: "complete", baseline }).blocking,
    ).toEqual([]);
    const duplicate = document(
      paragraph("new", "Old — prose."),
      paragraph("extra", "Old — prose."),
    );
    const report = lintDocument(duplicate, { phase: "complete", baseline });
    expect(report.blocking).toHaveLength(1);
    expect(report.findings.filter((f) => !f.introduced)).toHaveLength(1);
  });
  test("changed content does not inherit old errors", () => {
    const baseline = document(paragraph("p", "Old — prose."));
    expect(
      lintDocument(document(paragraph("p", "Different — prose.")), {
        phase: "complete",
        baseline,
      }).blocking,
    ).toHaveLength(1);
  });
  test("warning-only prose never blocks and retains baseline classification", () => {
    const doc = document(paragraph("p", "In order to save, press Save."));
    const report = lintDocument(doc, { phase: "complete", baseline: doc });
    expect(report.blocking).toEqual([]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.introduced).toBe(false);
  });
  test("catalog rejects duplicate IDs and missing corpus references", () => {
    expect(() => validateLintRules([...lintRules, lintRules[0]!])).toThrow(
      "Duplicate",
    );
    expect(() =>
      validateLintRules([{ ...lintRules[0]!, docsPath: "" }]),
    ).toThrow("Missing corpus");
    expect(new Set(lintRules.map((r) => r.id)).size).toBe(lintRules.length);
    for (const rule of lintRules) {
      expect(rule.docsPath).toMatch(/^(99-appendix|10-system-design)\//);
      expect(rule.suggestion.length).toBeGreaterThan(0);
      expect(rule.applicability.length).toBeGreaterThan(0);
    }
  });
  test("bare canvas asset src blocks completion and includes the block ID", () => {
    const report = lintDocument(
      document(srcBlock("canvas", "assets/canvases/x.canvas.json")),
      { phase: "complete" },
    );
    const finding = report.blocking.find(
      (item) => item.ruleId === "bundle-relative-src",
    );
    expect(finding?.blockId).toBe("canvas-block");
    expect(finding?.message).toBe(
      "src must be bundle-relative (`./assets/...`) or root-relative; the viewer will not resolve it.",
    );
  });
  test.each(["sequence", "image", "video"] as const)(
    "bare %s asset src blocks completion",
    (type) => {
      const report = lintDocument(
        document(srcBlock(type, `assets/${type}/x`)),
        { phase: "complete" },
      );
      expect(
        report.blocking.filter((item) => item.ruleId === "bundle-relative-src"),
      ).toHaveLength(1);
    },
  );
  test.each([
    "./assets/canvases/x.canvas.json",
    "10-s/page/assets/canvases/x.canvas.json",
    "https://example.com/x.canvas.json",
  ])("canvas src %s does not produce a bundle-relative-src finding", (src) => {
    const report = lintDocument(document(srcBlock("canvas", src)), {
      phase: "complete",
    });
    expect(
      report.findings.filter((item) => item.ruleId === "bundle-relative-src"),
    ).toEqual([]);
  });
});
test("hidden root metadata is not rendered body prose or an opening paragraph", () => {
  const doc = document();
  doc.blocks.root!.text = [{ insert: "Hidden — root text." }];
  expect(
    lintDocument(doc, { phase: "complete" }).findings.map((f) => f.ruleId),
  ).toEqual(["structure.opening-paragraph"]);
});
