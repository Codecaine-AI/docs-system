import { describe, expect, test } from "bun:test";
import { fitText, measureWidth } from "@codecaine-ai/text-measure";
import type { StackNode } from "../components/stack/state";
import type { DocBlock } from "../doc-schema";
import { orderedBlocks } from "../lint/engine";
import { document } from "../lint/fixtures";
import { lintDocument } from "../lint/index";
import { px } from "./fit";
import { STACK_DETAIL_MAX_PX, STACK_PATH_DETAIL_MAX_PX, codeFont, sansFont } from "./metrics";
import { stackDetailFitRule, stackDetailLines } from "./stack-detail-fit";

/**
 * Stock caps, checked in Chromium 153 with the bundled faces: a prose detail
 * wraps at 60ch of 13.5px Inter (506.25px), a path segment at 60ch of 12px
 * IBM Plex Mono (432px).
 */

const stack = (nodes: StackNode[]): DocBlock => ({ id: "s", type: "stack", props: { nodes, boundaries: [] }, children: [] });
const check = (block: DocBlock) => stackDetailFitRule.check({ document: document(block), blocks: [block] });
const prose = sansFont(13.5);
const width = (text: string) => measureWidth(text, prose);

/** Text whose one-line width lands within `tolerance` px of `target`. */
function textNear(target: number, tolerance: number): string {
  for (let wide = 0; wide < 120; wide += 1) {
    for (let narrow = 0; narrow < 200; narrow += 1) {
      const text = `${"x".repeat(wide)}${"i".repeat(narrow)}`;
      const measured = width(text);
      if (Math.abs(measured - target) <= tolerance) return text;
      if (measured > target) break;
    }
  }
  throw new Error(`No text is ${target}px wide`);
}

describe("layout.stack-detail-fit", () => {
  test("a detail that fits on one line has no finding", () => {
    expect(check(stack([{ name: "Leaf", detail: "docs serve and export · workbench shell" }]))).toEqual([]);
  });

  test("prose segments join with commas and wrap at 60ch, reported as a warning that never blocks", () => {
    const detail = "parses every stored document on load · validates the schema of each block · projects Markdown for agents";
    const joined = "parses every stored document on load, validates the schema of each block, projects Markdown for agents";
    expect(width(joined)).toBeGreaterThan(STACK_DETAIL_MAX_PX + 1);
    const block = stack([{ name: "Model", detail }]);
    const lines = fitText(joined, prose, { width: STACK_DETAIL_MAX_PX, lineHeight: 13.5 * 1.5, maxLines: 1 }).lineCount;
    expect(check(block)).toEqual([{
      blockId: "s",
      field: "props.nodes[0].detail",
      evidence: detail,
      message: `The detail of "Model" needs ${px(width(joined))} on one line, but at stock theme settings stack details wrap at 506px, so it wraps to ${lines} lines.`,
      suggestion: "Shorten the detail to one line. Keep the facts that identify the layer, and move the rest into the text near the stack.",
    }]);
    const report = lintDocument(document(block), { phase: "complete" });
    expect(report.findings.filter((f) => f.ruleId === "layout.stack-detail-fit").map((f) => f.severity)).toEqual(["warning"]);
    expect(report.blocking).toEqual([]);
  });

  test("a detail within 1px of the cap may wrap", () => {
    const detail = textNear(STACK_DETAIL_MAX_PX, 0.6);
    const [finding] = check(stack([{ name: "Leaf", detail }]));
    expect(finding!.message).toBe(`The detail of "Leaf" needs about ${px(width(detail))} on one line and at stock theme settings stack details wrap at 506px, so it may wrap to a second line.`);
  });

  test("a detail that overflows only because of characters the bundled fonts lack is reported, not judged", () => {
    const covered = textNear(430, 5);
    const detail = `${covered} 日本語の説明文です`;
    const [finding] = check(stack([{ name: "Leaf", detail }]));
    expect(finding!.message).toStartWith(`The detail of "Leaf" may wrap: it needs about`);
    expect(finding!.message).toContain("part of that width is text the bundled fonts lack.");
    expect(finding!.message).toContain("These widths are approximate: the bundled fonts lack 日 本 語");
  });

  test("each path segment gets its own line and wraps at 60ch of the code face", () => {
    const long = "packages/docs-model/src/layout/a-very-long-module-name-for-the-layout.ts";
    const detail = `${long} · src/short.ts`;
    const needed = measureWidth(long, codeFont(12));
    expect(needed).toBeGreaterThan(STACK_PATH_DETAIL_MAX_PX + 1);
    expect(check(stack([{ name: "Files", detail }]))).toEqual([expect.objectContaining({
      field: "props.nodes[0].detail",
      evidence: long,
      message: `The path "${long.slice(0, 49)}…" in the detail of "Files" needs ${px(needed)} on one line, but at stock theme settings path details wrap at 432px, so it wraps to 2 lines.`,
    })]);
  });

  test("two-column containers can leave a card narrower than the cap", () => {
    // Wide lane 1100px, less 26px per container frame, halved per two-column body, less the card's 26px.
    const inner = (1100 - 26 - 12) / 2;
    const card = (inner - 26 - 12) / 2 - 26;
    const detail = textNear(300, 5);
    const block = stack([{ name: "Outer", columns: 2, children: [{ name: "Inner", columns: 2, children: [{ name: "Leaf", detail }, { name: "Other" }] }, { name: "Side" }] }]);
    expect(stackDetailLines(block, 1100).map((line) => line.availablePx)).toEqual([card]);
    const [finding] = check(block);
    expect(finding!.field).toBe("props.nodes[0].children[0].children[0].detail");
    expect(finding!.message).toContain(`but at stock theme settings its card wraps at ${px(card)}`);
  });

  test("a path run with no break point overflows sideways instead of wrapping", () => {
    // monoBreaks gives a trailing separator no <wbr>, so the renderer keeps all 81 glyphs on one line.
    const detail = `${"x".repeat(80)}/`;
    const [finding] = check(stack([{ name: "Leaf", detail }]));
    expect(measureWidth(detail, codeFont(12))).toBe(583.203125);
    expect(finding!.message).toBe(
      `The path "${"x".repeat(49)}…" in the detail of "Leaf" has no break point within 583px, but at stock theme settings path details wrap ` +
        "at 432px, so it overflows sideways.",
    );
  });

  test("deeply nested two-column containers clamp the card to zero width instead of throwing", () => {
    let node: StackNode = { name: "Leaf", detail: "short" };
    for (let depth = 0; depth < 5; depth += 1) node = { name: `Group ${depth}`, columns: 2, children: [node] };
    const block = stack([node]);
    expect(stackDetailLines(block, 1100).map((line) => line.availablePx)).toEqual([0]);
    expect(() => lintDocument(document(block), { phase: "complete" })).not.toThrow();
    expect(check(block)[0]!.message).toContain("its card wraps at 0px");
  });

  test("a container's detail is a hover title, not a line, so it is not checked", () => {
    const detail = "a container detail that is far too long to fit on one line at the stack detail measure of sixty characters";
    expect(check(stack([{ name: "Group", detail, children: [{ name: "Leaf" }] }]))).toEqual([]);
  });
});
