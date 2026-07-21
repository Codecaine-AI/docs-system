import { describe, expect, it } from "bun:test";
import type { DeltaSpan } from "@codecaine-ai/docs-model/doc-schema";
import { normalizeTableCell, type TableCell } from "@codecaine-ai/docs-model";
import {
  cellDeltaToPMInline,
  pmInlineToCellDelta,
  type PMNode,
} from "../editor/core/convert";
import {
  isTableCellValue,
  pmDocToTableCell,
  tableCellEquals,
  tableCellSpans,
  tableCellToPMDoc,
} from "../components/structured-table/cell-content";

/** spans -> PM inline -> spans, as the cell editor does on load + commit. */
function roundTrip(spans: DeltaSpan[]): TableCell {
  return normalizeTableCell(pmInlineToCellDelta(cellDeltaToPMInline(spans)));
}

describe("cellDeltaToPMInline", () => {
  it("maps marked spans to text nodes with the shared mark vocabulary", () => {
    const inline = cellDeltaToPMInline([
      { insert: "plain " },
      { insert: "bold", attributes: { bold: true } },
      { insert: "code", attributes: { code: true } },
      { insert: "link", attributes: { link: "https://example.com" } },
    ]);
    expect(inline).toEqual([
      { type: "text", text: "plain " },
      { type: "text", text: "bold", marks: [{ type: "bold" }] },
      { type: "text", text: "code", marks: [{ type: "code" }] },
      {
        type: "text",
        text: "link",
        marks: [{ type: "link", attrs: { href: "https://example.com" } }],
      },
    ]);
  });

  it("turns newlines into hardBreak nodes carrying the span's marks", () => {
    expect(cellDeltaToPMInline([{ insert: "a\nb", attributes: { bold: true } }])).toEqual([
      { type: "text", text: "a", marks: [{ type: "bold" }] },
      { type: "hardBreak", marks: [{ type: "bold" }] },
      { type: "text", text: "b", marks: [{ type: "bold" }] },
    ]);
    expect(cellDeltaToPMInline([{ insert: "a\nb" }])).toEqual([
      { type: "text", text: "a" },
      { type: "hardBreak" },
      { type: "text", text: "b" },
    ]);
  });

  it("degrades a (model-forbidden) reference span to its plain insert text", () => {
    expect(
      cellDeltaToPMInline([
        {
          insert: "chip",
          attributes: { reference: { kind: "doc", path: "docs/x" } },
        } as DeltaSpan,
      ]),
    ).toEqual([{ type: "text", text: "chip" }]);
  });

  it("drops empty inserts and handles the empty cell", () => {
    expect(cellDeltaToPMInline([{ insert: "" }])).toEqual([]);
    expect(cellDeltaToPMInline([])).toEqual([]);
    expect(cellDeltaToPMInline(undefined)).toEqual([]);
  });
});

describe("pmInlineToCellDelta", () => {
  it("merges adjacent same-attribute text nodes", () => {
    expect(
      pmInlineToCellDelta([
        { type: "text", text: "he" },
        { type: "text", text: "llo" },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
      ]),
    ).toEqual([{ insert: "hello" }, { insert: "bold", attributes: { bold: true } }]);
  });

  it("maps hardBreak back to a newline, merging with same-marked neighbors", () => {
    expect(
      pmInlineToCellDelta([
        { type: "text", text: "a", marks: [{ type: "bold" }] },
        { type: "hardBreak", marks: [{ type: "bold" }] },
        { type: "text", text: "b", marks: [{ type: "bold" }] },
      ]),
    ).toEqual([{ insert: "a\nb", attributes: { bold: true } }]);
    expect(
      pmInlineToCellDelta([
        { type: "text", text: "a" },
        { type: "hardBreak" },
        { type: "text", text: "b" },
      ]),
    ).toEqual([{ insert: "a\nb" }]);
  });
});

describe("cell span round-trips", () => {
  it("keeps every cell mark (bold/italic/strike/code/link) stable", () => {
    const spans: DeltaSpan[] = [
      { insert: "plain " },
      { insert: "bold", attributes: { bold: true } },
      { insert: " and " },
      { insert: "both", attributes: { bold: true, italic: true } },
      { insert: "struck", attributes: { strike: true } },
      { insert: "mono", attributes: { code: true } },
      { insert: "out", attributes: { link: "https://example.com" } },
    ];
    expect(roundTrip(spans)).toEqual(spans);
  });

  it("keeps hard-break newlines stable, marked and unmarked", () => {
    const marked: DeltaSpan[] = [{ insert: "a\nb", attributes: { bold: true } }];
    expect(roundTrip(marked)).toEqual(marked);
    // Unmarked newline content normalizes to the plain string.
    expect(roundTrip([{ insert: "a\nb" }])).toBe("a\nb");
  });

  it("normalizes an unmarked span cell to the plain string, empty to \"\"", () => {
    expect(roundTrip([{ insert: "plain" }])).toBe("plain");
    expect(roundTrip([])).toBe("");
  });
});

describe("tableCellToPMDoc / pmDocToTableCell", () => {
  it("wraps a cell in a single-paragraph doc and reads it back", () => {
    const cell: TableCell = [
      { insert: "a ", attributes: { italic: true } },
      { insert: "b" },
    ];
    const doc = tableCellToPMDoc(cell);
    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0]?.type).toBe("paragraph");
    expect(pmDocToTableCell(doc)).toEqual(cell);
  });

  it("represents a plain string cell and the empty cell canonically", () => {
    expect(pmDocToTableCell(tableCellToPMDoc("hello"))).toBe("hello");
    expect(tableCellToPMDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(pmDocToTableCell(tableCellToPMDoc(""))).toBe("");
  });

  it("joins defensive multi-paragraph docs with newlines", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    };
    expect(pmDocToTableCell(doc)).toBe("a\nb");
  });
});

describe("tableCellSpans / isTableCellValue / tableCellEquals", () => {
  it("spans view of a cell", () => {
    expect(tableCellSpans("x")).toEqual([{ insert: "x" }]);
    expect(tableCellSpans("")).toEqual([]);
    const spans: DeltaSpan[] = [{ insert: "x", attributes: { bold: true } }];
    expect(tableCellSpans(spans)).toBe(spans);
  });

  it("guards cell prop values", () => {
    expect(isTableCellValue("x")).toBe(true);
    expect(isTableCellValue([{ insert: "x" }])).toBe(true);
    expect(isTableCellValue([{ insert: 1 }])).toBe(false);
    expect(isTableCellValue(1)).toBe(false);
    expect(isTableCellValue(null)).toBe(false);
  });

  it("compares canonical forms across representations", () => {
    expect(tableCellEquals("x", [{ insert: "x" }])).toBe(true);
    expect(tableCellEquals("", [])).toBe(true);
    expect(
      tableCellEquals(
        [{ insert: "ab", attributes: { bold: true } }],
        [
          { insert: "a", attributes: { bold: true } },
          { insert: "b", attributes: { bold: true } },
        ],
      ),
    ).toBe(true);
    expect(tableCellEquals("x", "y")).toBe(false);
    expect(
      tableCellEquals([{ insert: "x", attributes: { bold: true } }], [{ insert: "x" }]),
    ).toBe(false);
    expect(
      tableCellEquals(
        [{ insert: "x", attributes: { link: "https://a" } }],
        [{ insert: "x", attributes: { link: "https://b" } }],
      ),
    ).toBe(false);
  });
});
