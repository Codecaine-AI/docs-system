import type { DocBlock } from "../doc-schema";
import { normalizeRow, readTableColumns, readTableRows, tableCellToPlainText, type TableCell } from "../components/structured-table/lib";
import type { LintRule, RuleMatch } from "../lint/types";
import { blockPdfWidthsPx, blockWidthsPx } from "./block-width";
import { approximateNote, excerpt, px, widthVerdict } from "./fit";
import { measureInline, type InlineContext, type MeasuredText } from "./inline-measure";
import {
  INLINE_MARK_METRICS,
  LANE_PX,
  PDF_CODE_FONT_SIZE_PX,
  PDF_PAGE,
  PDF_TABLE_CELL_PAD_PX,
  TABLE_METRICS,
  TABLE_PROSE_MEASURE_PX,
  codeFont,
  sansFont,
} from "./metrics";
import { liftBacktickCode, tableCellKinds, tableColumnFits, type TableCellKind, type TableColumnFit } from "./table-columns";

/**
 * Structured table width: the narrowest each column can get, against the
 * width the table has on screen and in PDF export.
 *
 * On screen the table uses automatic layout. A column never gets narrower
 * than its widest cell's unbreakable content. A fit column or an identifier
 * cell never wraps its text, so the whole text counts, though a code chip
 * still breaks at its `<wbr>`. A prose or wrap column breaks between words,
 * so its longest word or code piece counts. When those minimums add up to
 * more than the table's width, the frame scrolls sideways.
 *
 * In PDF export the table has fixed layout at the printable width, so every
 * column gets an equal share. Text wraps anywhere there, except code chip
 * pieces and, in fit columns and identifier cells, whole inline elements.
 * Those run past their column when they are wider than it.
 */

/** Which cell of the table: the header row or a body row. */
export type TableCellRow = number | "header";

export interface TableCellWidth {
  row: TableCellRow;
  column: number;
  measured: MeasuredText;
  /** The cell's text wraps between words (else it never wraps, and `measured` is all of it). */
  wraps: boolean;
  /** An identifier cell: the code font, never wrapping. */
  identifier: boolean;
}

export interface TableColumnWidth {
  /** The header text, plain. */
  name: string;
  fit: TableColumnFit;
  /** Some body cell is an identifier cell (mono, never wraps). */
  identifiers: boolean;
  /** The narrowest the column gets on screen, padding included. */
  minPx: number;
  /** minPx with the characters the bundled faces lack left out. */
  minCoveredPx: number;
  /** The column's width when the table has all the room it wants, padding included. */
  preferredPx: number;
  /** The cell whose unbreakable content sets minPx. */
  widest: TableCellWidth;
}

export interface TableWidths {
  columns: TableColumnWidth[];
  /** The narrowest the table frame gets on screen. */
  minPx: number;
  minCoveredPx: number;
  /** The frame's width with all the room it wants. */
  preferredPx: number;
  /** In PDF export: each column's share, and the room for text in it. */
  pdfColumnPx: number;
  pdfTextPx: number;
  /**
   * In PDF export, the widest unbreakable run a cell holds before it leaves
   * its column: the text room plus the cell's right padding, which a run may
   * cover without reaching the next column.
   */
  pdfLimitPx: number;
  /** In PDF export, every cell whose unbreakable content is wider than pdfLimitPx, widest first. */
  pdfOverflows: TableCellWidth[];
}

const m = TABLE_METRICS;
const CELL_CHROME_PX = 2 * m.cellPadXPx + m.columnRulePx;
const FRAME_PX = 2 * m.borderPx;

function chipOn(sizePx: number, identifier: boolean): InlineContext["chip"] {
  if (identifier) return { sizePx, padXPx: 0 };
  const chipSize = sizePx * INLINE_MARK_METRICS.codeTextEm;
  return { sizePx: chipSize, padXPx: chipSize * INLINE_MARK_METRICS.codePadXEm };
}

/** How a cell paints on screen: its font, its chips, and whether it wraps. */
function screenContext(row: TableCellRow, kind: TableCellKind | undefined, fit: TableColumnFit): InlineContext {
  if (row === "header") {
    return { font: sansFont(m.headerFontSizePx, m.headerWeight), chip: chipOn(m.headerFontSizePx, false), wrap: fit === "fit" ? "nowrap" : "normal" };
  }
  if (kind) return { font: codeFont(m.identifierFontSizePx), chip: chipOn(m.identifierFontSizePx, true), wrap: "nowrap" };
  return { font: sansFont(m.fontSizePx, m.bodyWeight), chip: chipOn(m.fontSizePx, false), wrap: fit === "fit" ? "nowrap" : "normal" };
}

/** How a cell paints in PDF export: print CSS wraps cells anywhere and sets code to 9pt. */
function pdfContext(row: TableCellRow, kind: TableCellKind | undefined, fit: TableColumnFit): InlineContext {
  const chipSize = PDF_CODE_FONT_SIZE_PX;
  const chip = { sizePx: chipSize, padXPx: kind ? 0 : chipSize * INLINE_MARK_METRICS.codePadXEm };
  const print = { wrap: "anywhere", chip, chipWrapsAnywhere: true } as const;
  if (row === "header") return { ...print, font: sansFont(m.headerFontSizePx, m.headerWeight), nowrapElements: fit === "fit" };
  if (kind) return { ...print, font: codeFont(m.identifierFontSizePx), nowrapElements: true };
  return { ...print, font: sansFont(m.fontSizePx, m.bodyWeight), nowrapElements: fit === "fit" };
}

/**
 * Column and table widths for a structured table, and the cells that run
 * past their column in PDF export, where the table gets `pdfAvailablePx`.
 * Null when the block has no columns (the viewer renders an invalid-block
 * placeholder).
 */
export function structuredTableWidths(block: DocBlock, pdfAvailablePx: number): TableWidths | null {
  const header = readTableColumns(block);
  if (header.length === 0) return null;
  const count = header.length;
  const rows = readTableRows(block).map((row) => normalizeRow(row, count));
  const kinds = tableCellKinds(rows, count);
  const fits = tableColumnFits(rows, count, kinds);
  const pdfColumnPx = (pdfAvailablePx - FRAME_PX) / count;
  const pdfTextPx = pdfColumnPx - 2 * PDF_TABLE_CELL_PAD_PX;
  const pdfLimitPx = pdfColumnPx - PDF_TABLE_CELL_PAD_PX;
  const pdfOverflows: TableCellWidth[] = [];

  const columns = header.map((name, column): TableColumnWidth => {
    const fit = fits[column]!;
    let widest: TableCellWidth | undefined;
    let minCovered = 0;
    let preferred = 0;
    const cells: Array<[TableCellRow, TableCell, TableCellKind | undefined]> = [
      ["header", name, undefined],
      ...rows.map((row, index): [TableCellRow, TableCell, TableCellKind | undefined] => [index, row[column] ?? "", kinds[index]?.[column]]),
    ];
    for (const [row, cell, kind] of cells) {
      const spans = liftBacktickCode(cell);
      const context = screenContext(row, kind, fit);
      const screen = measureInline(spans, context);
      const wraps = context.wrap !== "nowrap";
      const min = screen.widest;
      if (!widest || min.width > widest.measured.width) widest = { row, column, measured: min, wraps, identifier: kind !== undefined };
      minCovered = Math.max(minCovered, min.coveredWidth);
      // A wrapping body cell sits in the prose measure, so it asks for at most 60ch. A wrapping header does not.
      const measured = wraps && row !== "header" ? Math.min(screen.natural.width, TABLE_PROSE_MEASURE_PX) : screen.natural.width;
      preferred = Math.max(preferred, min.width, measured);
      const print = measureInline(spans, pdfContext(row, kind, fit)).widest;
      if (widthVerdict(print.width, print.coveredWidth, pdfLimitPx, print.uncovered.length > 0) !== "fits") {
        pdfOverflows.push({ row, column, measured: print, wraps: false, identifier: kind !== undefined });
      }
    }
    return {
      name: tableCellToPlainText(name).trim(),
      fit,
      identifiers: kinds.some((row) => row[column] !== undefined),
      minPx: Math.max(m.minColumnPx, widest!.measured.width + CELL_CHROME_PX),
      minCoveredPx: Math.max(m.minColumnPx, minCovered + CELL_CHROME_PX),
      preferredPx: Math.max(m.minColumnPx, preferred + CELL_CHROME_PX),
      widest: widest!,
    };
  });
  pdfOverflows.sort((a, b) => b.measured.width - a.measured.width);
  const sum = (pick: (column: TableColumnWidth) => number) => columns.reduce((total, column) => total + pick(column), FRAME_PX);
  return {
    columns,
    minPx: sum((column) => column.minPx),
    minCoveredPx: sum((column) => column.minCoveredPx),
    preferredPx: sum((column) => column.preferredPx),
    pdfColumnPx,
    pdfTextPx,
    pdfLimitPx,
    pdfOverflows,
  };
}

const cellName = (cell: TableCellWidth, columns: readonly TableColumnWidth[]) => {
  const column = columns[cell.column]?.name || `column ${cell.column + 1}`;
  return cell.row === "header" ? `the "${excerpt(column, 30)}" header` : `row ${cell.row + 1} of "${excerpt(column, 30)}"`;
};

const fieldOf = (cell: TableCellWidth) => (cell.row === "header" ? `props.columns[${cell.column}]` : `props.rows[${cell.row}][${cell.column}]`);

/** Why a column cannot get narrower, for the screen message. */
function columnReason(column: TableColumnWidth): string {
  const name = `"${excerpt(column.name, 30) || `column ${column.widest.column + 1}`}" at ${px(column.minPx)}`;
  const { widest } = column;
  if (widest.measured.width + CELL_CHROME_PX < column.minPx) return `${name}, its floor`;
  if (widest.identifier) return `${name}, where identifier "${excerpt(widest.measured.text, 40)}" never wraps`;
  if (!widest.wraps) return `${name}, where ${cellNameShort(widest)} never wraps`;
  return `${name}, where "${excerpt(widest.measured.text, 40)}" cannot break`;
}

const cellNameShort = (cell: TableCellWidth) => (cell.row === "header" ? "its header" : `row ${cell.row + 1}`);

/** "a", "a and b", "a, b, and c". */
const listing = (items: readonly string[]) =>
  items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;

const EVIDENCE_CHARS = 200;
const evidence = (text: string) => {
  const chars = Array.from(text);
  return chars.length <= EVIDENCE_CHARS ? text : `${chars.slice(0, EVIDENCE_CHARS).join("")}…`;
};

function screenFinding(block: DocBlock, widths: TableWidths, availablePx: number): RuleMatch | null {
  const uncovered = [...new Set(widths.columns.flatMap((column) => column.widest.measured.uncovered))];
  const verdict = widthVerdict(widths.minPx, widths.minCoveredPx, availablePx, uncovered.length > 0);
  if (verdict === "fits") return null;
  const reliable = widths.columns.every((column) => column.widest.measured.reliable);
  const widest = [...widths.columns].sort((a, b) => b.minPx - a.minPx).slice(0, 3).map(columnReason);
  const needed = px(widths.minPx);
  const lead =
    verdict === "overflows"
      ? `The table needs at least ${needed} but has ${px(availablePx)} at stock theme settings, so it scrolls sideways on screen.`
      : verdict === "borderline"
        ? `The table needs about ${needed} and has ${px(availablePx)} at stock theme settings, so it may scroll sideways on screen.`
        : `The table may scroll sideways on screen: at stock theme settings it needs about ${needed} of its ${px(availablePx)}, and part of that width is text the bundled fonts lack.`;
  return {
    blockId: block.id,
    field: "props.columns",
    evidence: evidence(widths.columns.map((column) => column.name).join(" | ")),
    message: `${lead} The widest columns are ${listing(widest)}.${approximateNote({ reliable, uncovered })}`,
    suggestion:
      "Shorten the widest cells, or split the table. Identifier cells never wrap, and a text column wraps only when one of its cells is over " +
      `${m.wrapThresholdChars} characters, so long values in short-text columns keep their column wide.`,
  };
}

function pdfFinding(block: DocBlock, widths: TableWidths): RuleMatch | null {
  const worst = widths.pdfOverflows[0];
  if (!worst) return null;
  const { measured } = worst;
  const verdict = widthVerdict(measured.width, measured.coveredWidth, widths.pdfLimitPx, measured.uncovered.length > 0);
  const count = widths.pdfOverflows.length;
  const others = count > 1 ? ` ${count - 1} more cell${count === 2 ? "" : "s"} also hold text that cannot wrap.` : "";
  const runs = verdict === "overflows" ? "runs" : "may run";
  const past = worst.column === widths.columns.length - 1 ? "past the edge of the table" : "into the next column";
  return {
    blockId: block.id,
    field: fieldOf(worst),
    evidence: evidence(tableCellToPlainText(readCellAt(block, worst)).trim()),
    message:
      `In PDF export at stock theme settings, each of the ${widths.columns.length} columns leaves ${px(widths.pdfLimitPx)} for a line of text, but "${excerpt(measured.text, 50)}" in ` +
      `${cellName(worst, widths.columns)} cannot wrap and needs ${px(measured.width)}, so it ${runs} ${past}.${others}` +
      approximateNote({ reliable: measured.reliable, uncovered: measured.uncovered }),
    suggestion:
      "Shorten the text that cannot wrap, or give it break points: a code span breaks after / . _ - between words, and a camelCase name does not break. " +
      "Fewer columns give each column more room in PDF export.",
  };
}

function readCellAt(block: DocBlock, cell: TableCellWidth): TableCell {
  if (cell.row === "header") return readTableColumns(block)[cell.column] ?? "";
  return readTableRows(block)[cell.row]?.[cell.column] ?? "";
}

export const tableFitRule: LintRule = {
  id: "layout.table-fit",
  docsPath: "10-system-design/40-block-vocabulary/40-structured-reference/30-structured-table",
  severity: "warning",
  enforcement: [],
  applicability:
    "Each structured table, measured with the bundled Inter and IBM Plex Mono through @codecaine-ai/text-measure. On screen, the " +
    `columns' narrowest widths (whole text in fit columns and identifier cells, the longest unbreakable run in prose and wrap ` +
    `columns, ${m.cellPadXPx}px padding each side, ${m.minColumnPx}px floor) against the block's width: ${px(LANE_PX.wide)} in the wide ` +
    `lane, less inside list items. In PDF export, each cell's unbreakable text (code chip pieces, and whole inline elements in fit ` +
    `columns and identifier cells) against an equal share of the ${PDF_PAGE.printableWidthPx}px printable width.`,
  exclusions: [
    "Themes and style-rail picks that change the wide lane, table text size, cell padding, column rules or fonts (the shared global theme, docs-system-classic): findings describe stock theme settings",
    "Windows narrower than the wide lane, which narrow the table further",
    "Hosts that do not paint with the bundled Inter and IBM Plex Mono: widths shift with the fallback fonts",
    "Characters the bundled fonts lack: their width is estimated and never judged an overflow",
  ],
  suggestion:
    "Shorten the widest cells or split the table. Identifier cells and short-text columns never wrap on screen, and in PDF export a code span breaks only between its pieces.",
  check({ document, blocks }) {
    const tables = blocks.filter((block) => block.type === "structured-table");
    if (tables.length === 0) return [];
    const screenWidths = blockWidthsPx(document);
    const pdfWidths = blockPdfWidthsPx(document);
    return tables.flatMap((block) => {
      const widths = structuredTableWidths(block, pdfWidths.get(block.id) ?? PDF_PAGE.printableWidthPx);
      if (!widths) return [];
      const findings: RuleMatch[] = [];
      const screen = screenFinding(block, widths, screenWidths.get(block.id) ?? LANE_PX.wide);
      if (screen) findings.push(screen);
      const pdf = pdfFinding(block, widths);
      if (pdf) findings.push(pdf);
      return findings;
    });
  },
};
