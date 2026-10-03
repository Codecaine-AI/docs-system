import { describe, expect, test } from "bun:test";
import { measureWidth } from "@codecaine-ai/text-measure";
import type { TableCell } from "../components/structured-table/lib";
import type { DocBlock, DocDocument } from "../doc-schema";
import { orderedBlocks } from "../lint/engine";
import { document } from "../lint/fixtures";
import { lintDocument } from "../lint/index";
import { px } from "./fit";
import { codeFont } from "./metrics";
import { structuredTableWidths, tableFitRule } from "./table-fit";

/**
 * The column model was checked against Chromium 153 on every table in the
 * docs-system, canvas and agent-kernel corpora (156 tables): the table's
 * max-content width within 0.21px everywhere, its min-content width within
 * 1px on 151 tables and within 4.1px on the rest, and the same PDF cells
 * overflowing.
 */

function table(id: string, columns: TableCell[], rows: TableCell[][]): DocBlock {
  return { id, type: "structured-table", props: { columns, rows }, children: [] };
}
function listItem(id: string, child: DocBlock): DocBlock[] {
  return [{ id, type: "list-item", props: {}, text: [{ insert: "Item" }], children: [child.id] }, child];
}
function nested(top: DocBlock, ...owned: DocBlock[]): DocDocument {
  const doc = document(top);
  for (const block of owned) doc.blocks[block.id] = block;
  return doc;
}
const check = (doc: DocDocument) => tableFitRule.check({ document: doc, blocks: orderedBlocks(doc) });
const code = (insert: string) => ({ insert, attributes: { code: true as const } });

/** A key column of one snake_case identifier `keyChars` long and a prose column of one unbreakable word. */
const keyAndWord = (keyChars: number, wordChars: number) =>
  table("t", ["k", "p"], [[`a_${"b".repeat(keyChars - 2)}`, "x".repeat(wordChars)]]);

/** The key and word lengths whose table needs `target` px, within `tolerance`. */
function tableNeeding(target: number, tolerance: number): DocBlock {
  for (let key = 3; key < 140; key += 1) {
    for (let word = 1; word < 150; word += 1) {
      const block = keyAndWord(key, word);
      const { minPx } = structuredTableWidths(block, 688)!;
      if (Math.abs(minPx - target) <= tolerance) return block;
      if (minPx > target) break;
    }
  }
  throw new Error(`No key and word length needs ${target}px`);
}

describe("layout.table-fit on screen", () => {
  test("a table whose columns all fit the wide lane has no finding", () => {
    expect(check(document(table("t", ["Name", "Notes"], [["alpha", "A short note."]])))).toEqual([]);
  });

  test("fit columns that never wrap past the 1,100px lane make the table scroll, as a warning that never blocks", () => {
    const sentence = "Short text column under forty characters";
    const block = table("t", ["One", "Two", "Three", "Four", "Five", "Six"], [[sentence, sentence, sentence, sentence, sentence, sentence]]);
    const { minPx } = structuredTableWidths(block, 688)!;
    expect(minPx).toBeGreaterThan(1101);
    const [finding] = check(document(block));
    expect(finding).toMatchObject({ blockId: "t", field: "props.columns", evidence: "One | Two | Three | Four | Five | Six" });
    expect(finding!.message).toStartWith(`The table needs at least ${px(minPx)} but has 1,100px at stock theme settings, so it scrolls sideways on screen.`);
    expect(finding!.message).toContain(`"Two" at ${px(measureWidth(sentence, { family: "Inter", size: 13.5 }) + 24)}, where row 1 never wraps`);
    expect(finding!.message).not.toContain("approximate");
    const report = lintDocument(document(block), { phase: "complete" });
    expect(report.findings.filter((f) => f.ruleId === "layout.table-fit").map((f) => f.severity)).toEqual(["warning"]);
    expect(report.blocking).toEqual([]);
  });

  test("a table within 1px of the lane may scroll", () => {
    const block = tableNeeding(1100, 0.5);
    const [finding] = check(document(block));
    expect(finding!.message).toStartWith(`The table needs about ${px(structuredTableWidths(block, 688)!.minPx)} and has 1,100px at stock theme settings, so it may scroll sideways on screen.`);
  });

  test("a table that scrolls only because of characters the bundled fonts lack is reported, not judged", () => {
    const fits = tableNeeding(1030, 3);
    const rows = fits.props.rows as TableCell[][];
    const block = table("t", ["k", "label", "p"], [[rows[0]![0]!, "日本語の見出しです", rows[0]![1]!]]);
    const widths = structuredTableWidths(block, 688)!;
    expect(widths.minPx).toBeGreaterThan(1101);
    expect(widths.minCoveredPx).toBeLessThanOrEqual(1101);
    const [finding] = check(document(block));
    expect(finding!.message).toStartWith(`The table may scroll sideways on screen: at stock theme settings it needs about ${px(widths.minPx)} of its 1,100px, and part of that width is text the bundled fonts lack.`);
    expect(finding!.message).toContain("These widths are approximate: the bundled fonts lack 日 本 語");
  });

  test("a table nested in a list item lays out in the text lane, less the 24px marker column", () => {
    const block = tableNeeding(660, 2);
    expect(check(document(block))).toEqual([]);
    const [item, child] = listItem("li", block) as [DocBlock, DocBlock];
    const [finding] = check(nested(item, child));
    expect(finding!.message).toContain("but has 651px at stock theme settings, so it scrolls sideways on screen.");
  });

  test("a cell of no-break spaces keeps its width", () => {
    const block = table("t", ["A"], [["\u00A0".repeat(400)]]);
    expect(structuredTableWidths(block, 688)!.minPx).toBe(measureWidth("\u00A0".repeat(400), { family: "Inter", size: 13.5 }) + 24 + 2);
    expect(check(document(block))[0]!.message).toContain("scrolls sideways on screen");
  });

  test("a soft-hyphen break counts the hyphen it paints", () => {
    const prefix = "W".repeat(27);
    const block = table("t", ["A", "B"], [[`a_${"b".repeat(88)}`, `${prefix}\u00ADx`]]);
    const widths = structuredTableWidths(block, 688)!;
    expect(widths.columns[1]!.widest.measured.text).toBe(`${prefix}-`);
    expect(widths.minPx).toBeCloseTo(1103.390625, 6);
    expect(check(document(block))[0]!.message).toContain("scrolls sideways on screen");
  });

  test("a code span breaks only between its pieces, each padded on both sides", () => {
    const block = table("t", ["Name", "Notes"], [["alpha", [{ insert: "See " }, code("packages/docs-viewer/src"), { insert: " for the reader." }]]]);
    const { columns } = structuredTableWidths(block, 688)!;
    const chip = 13.5 * 0.85;
    // The chip breaks at the <wbr> after its first piece, so that piece carries a third padding (Chromium's min-content).
    expect(columns[1]!.widest.measured.text).toBe("packages/");
    expect(columns[1]!.widest.measured.width).toBeCloseTo(measureWidth("packages/", codeFont(chip)) + 3 * chip * 0.35, 6);
  });

  test("identifier cells never wrap their text, but a path still breaks at its pieces", () => {
    const block = table("t", ["Path", "Notes"], [[[code("packages/docs-viewer/src/components")], "x"], [[code("headerRuleWidthTokenWithALongName")], "y"]]);
    const { columns } = structuredTableWidths(block, 688)!;
    expect(columns[0]!.widest.identifier).toBe(true);
    expect(columns[0]!.widest.measured.text).toBe("headerRuleWidthTokenWithALongName");
    expect(columns[0]!.minPx).toBeCloseTo(measureWidth("headerRuleWidthTokenWithALongName", codeFont(13)) + 24, 6);
  });
});

describe("layout.table-fit in PDF export", () => {
  const rows = (cell: TableCell): TableCell[][] => [["a", "b", cell, "d", "e"]];

  test("text that cannot wrap and is wider than its column's share runs into the next column", () => {
    const block = table("t", ["A", "B", "C", "D", "E"], rows([{ insert: "Read " }, code("costEstimateWithAVeryLongName?")]));
    const widths = structuredTableWidths(block, 688)!;
    // 686px of table over five columns, less 8px of left padding.
    expect(widths.pdfLimitPx).toBeCloseTo(686 / 5 - 8, 6);
    const findings = check(document(block));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ field: "props.rows[0][2]", evidence: "Read costEstimateWithAVeryLongName?" });
    const needed = measureWidth("costEstimateWithAVeryLongName?", codeFont(12)) + 2 * 12 * 0.35;
    expect(findings[0]!.message).toBe(
      `In PDF export at stock theme settings, each of the 5 columns leaves ${px(widths.pdfLimitPx)} for a line of text, but "costEstimateWithAVeryLongName?" in row 1 of "C" ` +
        `cannot wrap and needs ${px(needed)}, so it runs into the next column.`,
    );
  });

  test("a code span with no break inside its words wraps anywhere in print", () => {
    const block = table("t", ["A", "B", "C", "D", "E"], rows([{ insert: "Read " }, code("costEstimateWithAVeryLongName")]));
    expect(structuredTableWidths(block, 688)!.pdfOverflows).toEqual([]);
    expect(check(document(block))).toEqual([]);
  });

  test("in a fit column a bold run stays on one line in print", () => {
    const bold = { insert: "Unbreakable bold label text", attributes: { bold: true as const } };
    // Column E holds the longest text, so it is the prose column and C is a fit column.
    const block = table("t", ["A", "B", "C", "D", "E"], [["a", "b", [bold], "d", "A longer sentence that makes this the prose column."]]);
    const [finding] = check(document(block));
    expect(finding!.message).toContain('"Unbreakable bold label text" in row 1 of "C" cannot wrap');
  });
});
