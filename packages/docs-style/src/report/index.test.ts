import { describe, expect, test } from "bun:test";
import type { BlockChange, PageResult, RuleLayer, StyleFinding, SweepResult } from "../types";
import { fixtureReviewOverlay, fixtureSweepResult } from "./fixture";
import { renderReport, type ReviewLabel, type ReviewOverlay } from "./index";

const emptyDoc: PageResult["after"] = {
  schemaVersion: 1,
  id: "doc",
  root: "root",
  blocks: { root: { id: "root", type: "paragraph", props: {}, children: [] } },
};

function finding(layer: RuleLayer, tier: 1 | 2 = 1): StyleFinding {
  return { ruleId: `ste.${layer}-rule`, source: "ste", layer, tier, field: "text", message: "m", evidence: "e", hint: "h" };
}

function findings(layer: RuleLayer, n: number, tier: 1 | 2 = 1): StyleFinding[] {
  return Array.from({ length: n }, () => finding(layer, tier));
}

let block = 0;
function change(kind: BlockChange["kind"], status: BlockChange["status"]): BlockChange {
  return {
    blockId: `b${block++}`,
    blockType: "paragraph",
    kind,
    status,
    before: "Use the tool in order to run it.",
    after: "Use the tool to run it.",
    ruleIds: ["ste.replacement"],
    ops: [],
  };
}

function page(path: string, deep: boolean, words: [number, number], before: StyleFinding[], after: StyleFinding[], changes: BlockChange[] = []): PageResult {
  return {
    path,
    baseHash: `test:${path}`,
    title: path,
    stats: { blocks: 1, sentences: 1, words: words[0] },
    findings: before,
    deep,
    changes,
    findingsAfter: after,
    wordsAfter: words[1],
    after: emptyDoc,
  };
}

function sweep(pages: PageResult[]): SweepResult {
  return {
    startedAt: "2026-10-02T10:00:00.000Z",
    finishedAt: "2026-10-02T10:04:00.000Z",
    config: { judge: true, rewriter: true, models: [], deepPages: pages.filter((p) => p.deep).map((p) => p.path) },
    pages,
  };
}

/** The big number of one verdict tile, as plain text. */
function stat(html: string, name: string): string {
  const match = new RegExp(`data-stat="${name}"><label>[^<]*</label><div class="big">(.*?)</div>`).exec(html);
  return (match?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
}

const headline = (html: string) => /<p class="headline"[^>]*>(.*?)<\/p>/.exec(html)?.[1];

describe("renderReport", () => {
  test("leads with the verdict: headline and summary numbers", () => {
    const flagged = { ...change("rewrite", "accepted"), reason: "needs review: fact check unavailable" };
    // Jev judged this Tier 1 match far below any threshold: it is no finding, but the deep lint still counts it.
    const overruled: StyleFinding = { ...finding("structure"), ruleId: "ste.passive-voice", probability: 0.01, overruled: true };
    const deep = page(
      "10-system-design/deep",
      true,
      [1000, 970],
      [...findings("structure", 6), ...findings("vocabulary", 2), finding("structure", 2), overruled],
      [...findings("structure", 3), ...findings("vocabulary", 2)],
      [change("rewrite", "accepted"), change("rewrite", "accepted"), flagged, change("rewrite", "rejected"), change("autofix", "accepted")],
    );
    const shallow = page("40-guides/shallow", false, [500, 500], findings("structure", 2), findings("structure", 2));

    const html = renderReport(sweep([deep, shallow]));

    expect(headline(html)).toBe(
      "3 of 4 rewrites passed every guardrail. 1 of them needs review. Deep pages lost 3% of words. Structure findings fell 57%.",
    );
    expect(stat(html, "pages")).toBe("2");
    expect(stat(html, "findings")).toBe("11");
    expect(stat(html, "autofixes")).toBe("1");
    expect(stat(html, "rewrites")).toBe("3 / 1 / 0");
    expect(stat(html, "words")).toBe("1,000 → 970");
    expect(stat(html, "deep-findings")).toBe("9 → 5");
  });

  test("escapes every string that comes from the sweep", () => {
    const evil = '<img src=x onerror="alert(1)">';
    const result = fixtureSweepResult();
    const target = result.pages[0]!;
    const rewrite = target.changes.find((c) => c.kind === "rewrite" && c.status === "accepted")!;
    target.title = evil;
    target.path = `${target.path}/${evil}`;
    target.findings[0]!.evidence = evil;
    target.findings[0]!.sentence = `Before ${evil} after.`;
    rewrite.before += ` ${evil}`;
    rewrite.after += " </script><script>alert(2)</script>";
    rewrite.ruleIds.push(evil);
    rewrite.verdict!.checks[0]!.detail = evil;
    rewrite.attempts![0]!.model = evil;
    result.startedAt = "</script><script>alert(3)</script>";
    result.config.judgeError = evil;
    const review: ReviewOverlay = {
      reviewer: evil,
      summary: `${evil}\n- ${evil}`,
      labels: { [`${target.path}#${rewrite.blockId}`]: { label: evil as ReviewLabel, note: evil } },
    };

    const html = renderReport(result, { title: evil, review });

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>alert");
    expect(html.match(/<\/script>/g)?.length).toBe(2);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  test("overlays the reviewer's labels: card badges, the would-reject rate, and the flagged filter", () => {
    const html = renderReport(fixtureSweepResult(), { review: fixtureReviewOverlay() });
    const count = (needle: string) => html.split(needle).length - 1;

    expect(/data-stat="would-reject">(.*?)<\/div>/.exec(html)?.[1]).toBe("would reject 2 of 5 (40%)");
    expect(count('class="b rv-flagged"')).toBe(2);
    expect(count('class="b rv-good"')).toBe(2);
    expect(count('class="b rv-neutral"')).toBe(1);
    expect(html).toContain('data-status="rv-flagged">reviewer: flagged <span class="cn">2</span>');
  });

  test("renders a sweep with no changes and no findings without NaN or undefined", () => {
    const result = sweep([page("guides/empty", false, [0, 0], [], []), page("guides/empty-deep", true, [0, 0], [], [])]);

    const html = renderReport(result);
    const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");

    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
    expect(headline(html)).toBe("No block was rewritten. Deep pages had no structure findings.");
    expect(html).toContain("No changes on this page.");
  });
});
