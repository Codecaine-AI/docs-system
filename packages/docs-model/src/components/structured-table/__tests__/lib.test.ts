"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import {
  normalizeRow,
  normalizeTableCell,
  parseTableCellInput,
  readTableColumns,
  readTableRows,
  tableCellToMarkdown,
  tableCellToPlainText,
} from "../lib";

describe("normalizeTableCell", () => {
  it("passes plain strings through verbatim (including empty)", () => {
    expect(normalizeTableCell("plain")).toBe("plain");
    expect(normalizeTableCell("")).toBe("");
    expect(normalizeTableCell("has **stars**")).toBe("has **stars**");
  });

  it("merges adjacent same-attribute spans", () => {
    expect(
      normalizeTableCell([
        { insert: "a", attributes: { bold: true } },
        { insert: "b", attributes: { bold: true } },
        { insert: "c", attributes: { italic: true } },
      ]),
    ).toEqual([
      { insert: "ab", attributes: { bold: true } },
      { insert: "c", attributes: { italic: true } },
    ]);
  });

  it("drops empty inserts", () => {
    expect(
      normalizeTableCell([
        { insert: "" },
        { insert: "x", attributes: { italic: true } },
        { insert: "", attributes: { bold: true } },
      ]),
    ).toEqual([{ insert: "x", attributes: { italic: true } }]);
  });

  it('returns the plain string when no attributes remain, "" for empty', () => {
    expect(normalizeTableCell([{ insert: "a" }, { insert: "b" }])).toBe("ab");
    expect(normalizeTableCell([])).toBe("");
    expect(normalizeTableCell([{ insert: "" }])).toBe("");
    expect(normalizeTableCell([{ insert: "a", attributes: {} }])).toBe("a");
  });

  it("keeps mixed marked/unmarked cells as spans, in order", () => {
    expect(
      normalizeTableCell([
        { insert: "bold", attributes: { bold: true } },
        { insert: " tail" },
      ]),
    ).toEqual([{ insert: "bold", attributes: { bold: true } }, { insert: " tail" }]);
  });
});

describe("tableCellToPlainText / tableCellToMarkdown", () => {
  it("passes plain strings through verbatim in both projections", () => {
    expect(tableCellToPlainText("a | b **c**")).toBe("a | b **c**");
    expect(tableCellToMarkdown("a | b **c**")).toBe("a | b **c**");
  });

  it("projects spans to plain text and inline markdown", () => {
    const cell = [
      { insert: "bold", attributes: { bold: true as const } },
      { insert: " and " },
      { insert: "code", attributes: { code: true as const } },
    ];
    expect(tableCellToPlainText(cell)).toBe("bold and code");
    expect(tableCellToMarkdown(cell)).toBe("**bold** and `code`");
  });

  it("renders link marks as markdown links", () => {
    expect(
      tableCellToMarkdown([
        { insert: "docs", attributes: { link: "https://example.com" } },
      ]),
    ).toBe("[docs](https://example.com)");
  });
});

describe("parseTableCellInput", () => {
  it("stores plain input as the plain string", () => {
    expect(parseTableCellInput("plain text")).toBe("plain text");
    expect(parseTableCellInput("")).toBe("");
  });

  it("parses inline markdown to normalized spans", () => {
    expect(parseTableCellInput("**bold** tail")).toEqual([
      { insert: "bold", attributes: { bold: true } },
      { insert: " tail" },
    ]);
    expect(parseTableCellInput("~~gone~~ and *soft*")).toEqual([
      { insert: "gone", attributes: { strike: true } },
      { insert: " and " },
      { insert: "soft", attributes: { italic: true } },
    ]);
  });

  it("keeps external links as plain link marks", () => {
    expect(parseTableCellInput("[site](https://example.com)")).toEqual([
      { insert: "site", attributes: { link: "https://example.com" } },
    ]);
  });

  it("downgrades doc references to a link with a #section anchor", () => {
    expect(parseTableCellInput("[API](docs/guide/intro.md#usage)")).toEqual([
      { insert: "API", attributes: { link: "docs/guide/intro.md#usage" } },
    ]);
    expect(parseTableCellInput("[Doc](docs/guide/intro.md)")).toEqual([
      { insert: "Doc", attributes: { link: "docs/guide/intro.md" } },
    ]);
  });

  it("downgrades source references to a link with #L<line> / #<symbol> anchors", () => {
    expect(parseTableCellInput("[fn](src/foo.ts#L42)")).toEqual([
      { insert: "fn", attributes: { link: "src/foo.ts#L42" } },
    ]);
    expect(parseTableCellInput("[fn](src/foo.ts#myFn)")).toEqual([
      { insert: "fn", attributes: { link: "src/foo.ts#myFn" } },
    ]);
    expect(parseTableCellInput("[fn](src/foo.ts)")).toEqual([
      { insert: "fn", attributes: { link: "src/foo.ts" } },
    ]);
  });

  it("round-trips through the markdown projection", () => {
    for (const md of ["**bold** and `code`", "plain", "*i* ~~s~~", "[x](https://e.com)"]) {
      expect(tableCellToMarkdown(parseTableCellInput(md))).toBe(md);
    }
  });
});

describe("readTableColumns / readTableRows / normalizeRow", () => {
  function block(props: Record<string, unknown>): DocBlock {
    return { id: "b1", type: "structured-table", props, children: [] };
  }

  it("reads both plain and span cells, tolerating junk", () => {
    const spans = [{ insert: "c", attributes: { code: true as const } }];
    const b = block({
      columns: ["Name", spans, 42],
      rows: [["a", spans, null], "junk-row", [["not-a-span"], 7]],
    });
    expect(readTableColumns(b)).toEqual(["Name", spans]);
    expect(readTableRows(b)).toEqual([
      ["a", spans, ""],
      [[], "7"],
    ]);
  });

  it("returns empty for missing/non-array props", () => {
    expect(readTableColumns(block({}))).toEqual([]);
    expect(readTableRows(block({ rows: "nope" }))).toEqual([]);
  });

  it("normalizeRow pads/truncates with a TableCell fill", () => {
    const spans = [{ insert: "b", attributes: { bold: true as const } }];
    expect(normalizeRow(["a", spans, "c"], 2)).toEqual(["a", spans]);
    expect(normalizeRow(["a"], 3)).toEqual(["a", "", ""]);
    expect(normalizeRow([], 2, spans)).toEqual([spans, spans]);
  });
});
