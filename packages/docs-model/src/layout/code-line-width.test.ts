import { describe, expect, test } from "bun:test";
import { measureWidth } from "@codecaine-ai/text-measure";
import { join } from "node:path";
import type { DocBlock, DocDocument } from "../doc-schema";
import { orderedBlocks } from "../lint/engine";
import { document, paragraph } from "../lint/fixtures";
import { lintDocument } from "../lint/index";
import { codeLineWidthRule } from "./code-line-width";

/**
 * Stock visible columns with IBM Plex Mono at 13px (7.8px a column): 118 in
 * the 88ch code lane (990px, 924px for code), 82 beside a notes column, 75
 * inside a list item (the 675px text lane less the 24px marker column).
 */
function code(id: string, text: string, props: Record<string, unknown> = {}): DocBlock {
  return { id, type: "code", props, text: [{ insert: text }], children: [] };
}
function listItem(id: string, children: DocBlock[]): DocBlock[] {
  return [{ id, type: "list-item", props: {}, text: [{ insert: "Item" }], children: children.map((child) => child.id) }, ...children];
}
/** A document whose root holds `top` and owns every block in `nested`. */
function documentWith(top: DocBlock[], nested: DocBlock[] = []): DocDocument {
  const doc = document(...top);
  for (const block of nested) doc.blocks[block.id] = block;
  return doc;
}
const check = (doc: DocDocument) => codeLineWidthRule.check({ document: doc, blocks: orderedBlocks(doc) });
const x = (columns: number) => "x".repeat(columns);
const message = (line: number, columns: number, fits: string) =>
  `Line ${line} is ${columns} columns wide, but at stock theme settings the code panel fits ${fits} before it scrolls sideways.`;

describe("layout.code-line-width", () => {
  test("flags a line wider than the 118 columns a top-level code panel fits, as a non-blocking warning", () => {
    const doc = document(code("c", [x(118), x(119), "short"].join("\n")));
    expect(check(doc)).toEqual([{
      blockId: "c",
      field: "text",
      evidence: x(119),
      message: message(2, 119, "118"),
      suggestion:
        "Wrap line 2 or shorten it by 1 column, or accept horizontal scrolling for this block. " +
        "This is an on-screen check: PDF export wraps code instead of scrolling.",
    }]);
    const report = lintDocument(doc, { phase: "complete" });
    expect(report.findings.filter((f) => f.ruleId === "layout.code-line-width").map((f) => f.severity)).toEqual(["warning"]);
    expect(report.blocking).toEqual([]);
  });

  test("tabs expand to stops of four", () => {
    expect(check(document(code("c", `${"\t".repeat(29)}xxx`))).map((f) => f.message)).toEqual([message(1, 119, "118")]);
    expect(check(document(code("c", `${"\t".repeat(29)}xx`)))).toEqual([]);
  });

  test("spaces keep their width in a white-space: pre panel", () => {
    expect(check(document(code("c", `${" ".repeat(100)}${x(19)}`))).map((f) => f.message)).toEqual([message(1, 119, "118")]);
  });

  test("characters the bundled font lacks are estimated and never judged an overflow", () => {
    // Browsers paint CJK 1em wide (13px): 60 ideographs need about 780px of 924px, so nothing is reported.
    expect(check(document(code("c", "日".repeat(60))))).toEqual([]);
    const [finding] = check(document(code("c", "日".repeat(100))));
    expect(finding!.message).toBe(
      "Line 1 may scroll sideways: it needs about 1,300px and at stock theme settings the code panel shows 924px, and part of that width " +
        "is text the bundled fonts lack. These widths are approximate: the bundled fonts lack 日, so the browser's fallback font sets their width.",
    );
    // Covered text that overflows on its own is still an overflow, with the estimate disclosed.
    const [mixed] = check(document(code("c", `${x(119)}日`)));
    expect(mixed!.message).toStartWith(message(1, 121, "118"));
    expect(mixed!.message).toContain("These widths are approximate: the bundled fonts lack 日");
  });

  test("a line within 1px of the edge may scroll", () => {
    // Two list items leave 561px for code. 72 columns paint 561.61px.
    const [outer, inner, block] = [
      { id: "li1", type: "list-item", props: {}, text: [{ insert: "Outer" }], children: ["li2"] },
      { id: "li2", type: "list-item", props: {}, text: [{ insert: "Inner" }], children: ["c"] },
      code("c", x(72)),
    ] as DocBlock[];
    expect(measureWidth(x(72), { family: "IBM Plex Mono", size: 13 }) - 561).toBeCloseTo(0.609375, 6);
    expect(check(documentWith([outer!], [inner!, block!])).map((f) => f.message)).toEqual([
      "Line 1 is 72 columns wide and at stock theme settings the code panel fits about 71, so it may scroll sideways.",
    ]);
  });

  test("on the approximate table backend a finding says its widths are approximate", async () => {
    // A fresh process without the test preload measures with the default table backend.
    const script = `
      const { codeLineWidthRule } = await import(${JSON.stringify(join(import.meta.dir, "code-line-width.ts"))});
      const { document } = await import(${JSON.stringify(join(import.meta.dir, "../lint/fixtures.ts"))});
      const doc = document({ id: "c", type: "code", props: {}, text: [{ insert: "x".repeat(200) }], children: [] });
      console.log(JSON.stringify(codeLineWidthRule.check({ document: doc, blocks: [doc.blocks.c] }).map((f) => f.message)));
    `;
    const run = Bun.spawn([process.execPath, "-e", script], { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = [await new Response(run.stdout).text(), await new Response(run.stderr).text()];
    expect(await run.exited, stderr).toBe(0);
    expect(JSON.parse(stdout)).toEqual([`${message(1, 200, "118")} These widths are approximate: text-measure is on its table backend.`]);
  });

  test("an annotated block fits 82 columns beside its notes column", () => {
    const annotations = [{ lines: "1", note: "Why this line matters." }];
    expect(check(document(code("c", x(82), { annotations })))).toEqual([]);
    expect(check(document(code("c", x(83), { annotations }))).map((f) => f.message)).toEqual([
      message(1, 83, "82 beside its notes column"),
    ]);
  });

  test("a code block nested in a list item lays out in the text lane, 75 columns", () => {
    // 74 columns fit clearly, 75 exactly (585px of 585px, within 1px, so it may scroll), 76 do not.
    const [item, nested] = listItem("li", [code("c", [x(74), x(75), x(76)].join("\n"))]) as [DocBlock, DocBlock];
    expect(check(documentWith([item], [nested])).map((f) => f.message)).toEqual([
      "Line 2 is 75 columns wide and at stock theme settings the code panel fits about 75, so it may scroll sideways.",
      message(3, 76, "75"),
    ]);
  });

  test("JSON is checked as the viewer shows it, pretty-printed", () => {
    const minified = JSON.stringify(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`key${i}`, `value ${i}`])));
    expect(minified.length).toBeGreaterThan(118);
    expect(check(document(code("c", minified, { language: "json" })))).toEqual([]);
    expect(check(document(code("c", minified, { language: "text" })))).toHaveLength(1);
  });

  test("evidence keeps the first 200 characters of a very long line", () => {
    const [finding] = check(document(code("c", x(5000))));
    expect(finding?.evidence).toBe(`${x(200)}… (5000 characters)`);
  });

  test("a long line stays an existing finding when lines are added above it", () => {
    const baseline = document(paragraph("p", "Intro."), code("c", x(130)));
    const edited = document(paragraph("p", "Intro."), code("c", ["// added", x(130)].join("\n")));
    const findings = lintDocument(edited, { phase: "complete", baseline }).findings.filter((f) => f.ruleId === "layout.code-line-width");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ blockId: "c", evidence: x(130), introduced: false, message: message(2, 130, "118") });
  });
});
