import { measureWidth, type FontSpec } from "@codecaine-ai/text-measure";
import type { DocBlockType } from "../doc-schema";

/**
 * Layout facts: the numbers the docs viewer lays blocks out with at STOCK
 * settings (no style-rail or theme override), as plain constants. Lints and
 * layout engines read them to reason about what a reader sees without
 * rendering a page.
 *
 * The viewer and the workbench cannot import these values. Tailwind only
 * generates CSS for literal class tokens, and the theme registry declares its
 * own defaults. So the numbers live in both places, and drift guards fail
 * when one copy changes alone:
 *
 * - docs-viewer/src/__tests__/layout-metrics-drift.test.ts (class strings,
 *   inline stylesheets, block lanes, the code display rules)
 * - docs-workbench/web/src/__tests__/layout-metrics-drift.test.ts (style-rail
 *   stock, theme token defaults, stock font stacks, tab size, PDF export)
 *
 * Lengths are CSS px (96 per inch) unless a name says otherwise. Values that
 * depend on font files (`sansChPx`, `MONO_COLUMN_EM` and every `ch` cap) are
 * measured from the bundled faces through @codecaine-ai/text-measure, so
 * they hold wherever the page paints with DOCS_DEFAULT_FONTS.
 */

// -- Fonts -------------------------------------------------------------------

/**
 * The faces the docs paint with at stock, as the measured family and the CSS
 * stack the theme declares. Inter (3.19 static, 400/500/600/700) sets body
 * text, headings, table cells, stack details and tree notes. IBM Plex Mono
 * (2.5, 400/500/600) sets code blocks, inline code chips and identifier
 * cells. Both are bundled with @codecaine-ai/text-measure, so a measurement
 * here matches what the browser paints once the page loads the same faces.
 * The default theme (docs-system/themes/default/theme.json `fonts`) declares
 * exactly these stacks, and the drift tests that guard it import this
 * constant.
 */
export const DOCS_DEFAULT_FONTS = {
  sans: { family: "Inter", stack: "Inter, ui-sans-serif, system-ui, sans-serif" },
  code: { family: "IBM Plex Mono", stack: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
} as const;

/** Stock sans stack (theme `fonts.body`, `--font-tx02`): body, headings, table cells, stack details and tree notes. */
export const STOCK_SANS_FONT_STACK = DOCS_DEFAULT_FONTS.sans.stack;

/** Stock code stack (theme `fonts.code`, `--docs-font-code`): code blocks, inline chips and identifier cells. */
export const STOCK_CODE_FONT_STACK = DOCS_DEFAULT_FONTS.code.stack;

/** A text-measure font spec for the stock sans face (Inter) at `sizePx` and `weight`. */
export function sansFont(sizePx: number, weight = 400): FontSpec {
  return { family: DOCS_DEFAULT_FONTS.sans.family, size: sizePx, weight };
}

/** A text-measure font spec for the stock code face (IBM Plex Mono) at `sizePx` and `weight`. */
export function codeFont(sizePx: number, weight = 400): FontSpec {
  return { family: DOCS_DEFAULT_FONTS.code.family, size: sizePx, weight };
}

/**
 * The advance of the digit zero in em: CSS `1ch` (Chromium sizes `ch` from
 * the primary face's "0"). Measured once through text-measure at a size so
 * large that its rounding up to the 1/64px layout unit vanishes when the
 * result is rounded to 1e-6em. Inter's "0" is 0.625em and IBM Plex Mono's
 * 0.6em, so 60ch of 18px Inter is 675px. Every backend returns the same
 * advance: the table backend is exact on ASCII.
 */
function zeroAdvanceEm(family: string): number {
  const size = 64_000;
  return Math.round((measureWidth("0", { family, size }) / size) * 1e6) / 1e6;
}

const SANS_CH_EM = zeroAdvanceEm(DOCS_DEFAULT_FONTS.sans.family);

/** The width of `1ch` in px for the stock sans face (Inter, weight 400) at `fontSizePx`. */
export function sansChPx(fontSizePx: number): number {
  return fontSizePx * SANS_CH_EM;
}

/**
 * The advance of one column of the stock code face, in em: 0.6 for IBM Plex
 * Mono, whose every spacing glyph is 600 of its 1000 units per em. Its `ch`
 * is the same width.
 */
export const MONO_COLUMN_EM = zeroAdvanceEm(DOCS_DEFAULT_FONTS.code.family);

/** The width of one monospace column (and of `1ch`) in px for the stock code face at `fontSizePx`. */
export function monoColumnPx(fontSizePx: number): number {
  return fontSizePx * MONO_COLUMN_EM;
}

/** CSS px per point and per millimetre (96 px per inch). */
export const PX_PER_PT = 96 / 72;
export const PX_PER_MM = 96 / 25.4;

// -- Body text and page lanes ------------------------------------------------

/** Stock body size and leading (style rail Font size and Line height). */
export const BODY_FONT_SIZE_PX = 18;
export const BODY_LINE_HEIGHT = 1.45;

/** The page lanes a block type can claim (docs-viewer render/block-layout.ts). */
export type LaneName = "text" | "code" | "wide" | "full";

/** Text lane cap: `--style-content-width`, 60ch of the body font. */
export const LANE_TEXT_CH = 60;
/** Code lane cap: `--style-code-width`, 88ch of the body font. */
export const LANE_CODE_CH = 88;
/** Wide lane cap: `--style-wide-width`. */
export const LANE_WIDE_PX = 1100;

/**
 * Lane caps in px at the stock body size: text 675, code 990, wide 1100.
 * A lane is a maximum, so a window narrower than the lane plus the page
 * margin narrows it further. `full` has no cap.
 */
export const LANE_PX: Readonly<Record<LaneName, number>> = {
  text: LANE_TEXT_CH * sansChPx(BODY_FONT_SIZE_PX),
  code: LANE_CODE_CH * sansChPx(BODY_FONT_SIZE_PX),
  wide: LANE_WIDE_PX,
  full: Number.POSITIVE_INFINITY,
};

/**
 * The lane each block type claims at the top level of a page (its viewer
 * descriptor's `layout.width`, `text` when it declares none). Nested blocks
 * are not re-laned: they lay out inside their top-level ancestor's lane.
 */
export const BLOCK_LANE: Readonly<Record<DocBlockType, LaneName>> = {
  paragraph: "text",
  heading: "text",
  "list-item": "text",
  callout: "text",
  divider: "text",
  code: "code",
  pseudocode: "code",
  "file-tree": "code",
  "file-explorer": "code",
  "structured-table": "wide",
  "interaction-surface": "wide",
  "state-shape": "wide",
  canvas: "wide",
  sequence: "wide",
  image: "wide",
  "image-grid": "wide",
  video: "wide",
  html: "wide",
  "process-outline": "wide",
  stack: "wide",
  "call-stack": "wide",
  "component-tree": "wide",
};

/**
 * Horizontal room a container keeps from the blocks nested in it. A list
 * item renders its children in its content column, beside the 24px marker
 * column (`--docs-list-indent`). Most other blocks render their children
 * after themselves at full width (a callout's children sit below the card,
 * not inside it). Not modeled: an image renders its children inside its
 * fit-content figure (2px of border; 26px for the missing-src card).
 */
export const NESTED_INSET_PX: Readonly<Partial<Record<DocBlockType, number>>> = {
  "list-item": 24,
};

// -- Code block --------------------------------------------------------------

/**
 * The code panel (docs-viewer components/code/classes.ts and
 * render/block-classes.ts CODE_BLOCK_CLASSES). Code never wraps on screen:
 * a line wider than the code column scrolls the panel sideways.
 */
export const CODE_METRICS = {
  fontSizePx: 13,
  lineHeightPx: 21,
  /** Panel frame border, each side. */
  borderPx: 1,
  /** Line-number gutter. */
  gutterPx: 40,
  /** Code cell padding, each side. */
  padXPx: 12,
  /** Notes column of an annotated block. */
  notesColumnPx: 280,
  /** Notes sit beside the code from this block width (a container query) and under it below. */
  notesBesideMinWidthPx: 760,
  /** The annotated read surface scrolls vertically past this height. */
  annotatedMaxHeightPx: 440,
  /** Tailwind preflight sets `tab-size: 4` on the workbench page, and code inherits it. */
  tabSize: 4,
} as const;

/**
 * The width in px a code panel `blockWidthPx` wide gives a line of code
 * before it scrolls sideways. With notes, the notes column takes its share
 * only when the block is wide enough to put the notes beside the code.
 */
export function codeTextWidthPx(blockWidthPx: number, hasNotes: boolean): number {
  const m = CODE_METRICS;
  const notesBeside = hasNotes && blockWidthPx >= m.notesBesideMinWidthPx;
  return Math.max(0, blockWidthPx - 2 * m.borderPx - (notesBeside ? m.notesColumnPx : 0) - m.gutterPx - 2 * m.padXPx);
}

/** The monospace columns a code panel `blockWidthPx` wide shows before it scrolls sideways. */
export function codeVisibleColumns(blockWidthPx: number, hasNotes: boolean): number {
  return Math.floor(codeTextWidthPx(blockWidthPx, hasNotes) / monoColumnPx(CODE_METRICS.fontSizePx) + 1e-9);
}

/** Columns a top-level code block shows at stock settings: 118. */
export const CODE_VISIBLE_COLUMNS = codeVisibleColumns(LANE_PX.code, false);
/** Columns a top-level annotated code block shows beside its notes column: 82. */
export const CODE_VISIBLE_COLUMNS_WITH_NOTES = codeVisibleColumns(LANE_PX.code, true);

// -- Structured table ----------------------------------------------------------

/**
 * The structured table (docs-viewer components/structured-table). The table
 * shrinks to its content inside the wide lane. When the columns still
 * overflow the lane, the frame scrolls sideways.
 *
 * Column sizing (viewer column-layout.ts `tableColumnFits`, mirrored in
 * table-columns.ts) depends on the cell kinds (cell-kind.ts):
 *
 * - Identifier cells (mono) never wrap.
 * - The prose column is the non-identifier column with the highest average
 *   body-cell length. It wraps at `proseMeasureCh` of the cell font even
 *   when its text is short.
 * - Another text column wraps at the same measure when its longest
 *   non-identifier body cell is over `wrapThresholdChars` UTF-16 units.
 * - Every other column fits its content on one line.
 */
export const TABLE_METRICS = {
  fontSizePx: 13.5,
  /** Follows the body size at stock. */
  headerFontSizePx: 13.5,
  /** Identifier (mono) cells: 0.5px under the body size, in the code font. */
  identifierFontSizePx: 13,
  bodyWeight: 400,
  headerWeight: 500,
  /** Unitless multiplier of the cell font size. */
  lineHeight: 1.45,
  /** Cell padding, each side. */
  cellPadXPx: 12,
  cellPadYPx: 4,
  /** Frame border, each side. */
  borderPx: 1,
  /** Vertical rules between columns: none at stock. */
  columnRulePx: 0,
  /** Floor for every column (header cell `min-w-[60px]`). */
  minColumnPx: 60,
  rowMinHeightPx: 28,
  /** Prose and wrap columns wrap their text at this many ch of the cell font. */
  proseMeasureCh: 60,
  /** A text column whose longest body cell is over this many characters wraps. */
  wrapThresholdChars: 40,
} as const;

/** The prose measure in px at the stock cell size: 506.25. */
export const TABLE_PROSE_MEASURE_PX = TABLE_METRICS.proseMeasureCh * sansChPx(TABLE_METRICS.fontSizePx);

// -- Stack ---------------------------------------------------------------------

/**
 * The stack block (docs-viewer components/stack/StackDocsBlock.tsx). A
 * leaf's detail is stored as ` · `-separated segments.
 *
 * - The viewer picks prose or path for the WHOLE detail (typed-chip.ts
 *   `chipKind(detail) === "path"`), not per segment.
 * - Prose segments join with ", " and wrap at `detailMaxCh` with
 *   `overflow-wrap: anywhere`.
 * - Path segments render in the code font, each starting a new line, and
 *   still wrap inside a segment after `/ . - | ,` (mono-breaks.tsx).
 * - Cards size to their content (`fit-content`, capped by the lane). A
 *   container with `columns: 2` splits its body into two equal columns.
 */
export const STACK_METRICS = {
  detailFontSizePx: 13.5,
  detailLineHeight: 1.5,
  detailMaxCh: 60,
  pathDetailFontSizePx: 12,
  pathDetailLineHeight: 1.6,
  /** Leaf name: code font, weight 600. */
  nameFontSizePx: 13.5,
  nameWeight: 600,
  roleFontSizePx: 12,
  /** Leaf card padding. A card with a role keeps 10px on the left beside its 3px edge. */
  boxPadXPx: 12,
  boxPadYPx: 10,
  roleBoxPadLeftPx: 10,
  roleEdgePx: 3,
  boxBorderPx: 1,
  /** Gap between a leaf's name and its role word. */
  headRowGapPx: 16,
  /** Container (group) frame border, each side. */
  groupBorderPx: 1,
  /** `--docs-stack-gap`: container body padding and the gap between children. */
  gapPx: 12,
  detailSeparator: " · ",
  proseDetailJoiner: ", ",
} as const;

/** The prose detail cap in px at the stock size: 506.25. */
export const STACK_DETAIL_MAX_PX = STACK_METRICS.detailMaxCh * sansChPx(STACK_METRICS.detailFontSizePx);
/** The path detail cap in px: 60ch of the code font at 12px, 432. */
export const STACK_PATH_DETAIL_MAX_PX = STACK_METRICS.detailMaxCh * monoColumnPx(STACK_METRICS.pathDetailFontSizePx);

/** A stack detail's segments, split the way the viewer splits them: on a middle dot with whitespace on both sides. */
export function stackDetailSegments(detail: string): string[] {
  return detail.split(/\s+·\s+/).filter(Boolean);
}

// -- Tree rows -------------------------------------------------------------------

/**
 * The tree row system (docs-viewer components/outline-rows/tree-rows.tsx)
 * shared by file-tree and file-explorer notes and call-stack and
 * component-tree comments. Rows never wrap. Notes wrap at `noteMaxCh` of the
 * note font, and that cap includes the note's 24px left padding
 * (border-box). Past the lane, the rows scroll sideways.
 */
export const TREE_METRICS = {
  /** Row text: code font. */
  textSizePx: 13,
  rowHeightPx: 28,
  padXPx: 12,
  padYPx: 8,
  indentPx: 20,
  /** The diff gutter, when any row carries a change. */
  diffGutterPx: 16,
  borderPx: 1,
  noteFontSizePx: 13.5,
  noteLineHeight: 1.55,
  noteMaxCh: 60,
  notePadLeftPx: 24,
  /** The note column never shrinks below this. */
  noteMinColumnPx: 160,
  sourceFontSizePx: 12,
  sourceGapPx: 20,
} as const;

/** The note cap in px at the stock size: 506.25, of which 482.25 is text. */
export const TREE_NOTE_MAX_PX = TREE_METRICS.noteMaxCh * sansChPx(TREE_METRICS.noteFontSizePx);

// -- Inline marks ---------------------------------------------------------------

/**
 * Inline marks inside table cells (docs-viewer render/delta-spans.tsx and
 * render/block-classes.ts INLINE_CODE_CLASSES, workbench theme semantic.css).
 *
 * - A code span is a chip in the code font at `codeTextEm` of the text it
 *   sits in, padded `codePadXEm` of its own size on each side. The padding
 *   repeats on every line the chip spans (`box-decoration-break: clone`).
 * - Identifier cells zero the chip: no padding, the cell's own size.
 * - Bold is `font-weight: bolder` (Tailwind preflight; tables are
 *   `not-prose`), so 400 and 500 text paints at 700.
 * - Italic, strike and links keep the text's metrics. Inter ships no italic
 *   face, and a synthesized oblique keeps the upright advances.
 */
export const INLINE_MARK_METRICS = {
  codeTextEm: 0.85,
  codePadXEm: 0.35,
  codeBorderPx: 0,
} as const;

/** The weight CSS `font-weight: bolder` resolves to for an inherited `weight`. */
export function bolderWeight(weight: number): number {
  if (weight < 350) return 400;
  if (weight < 550) return 700;
  return 900;
}

// -- PDF export -------------------------------------------------------------------

/**
 * PDF export (docs-workbench src/pdf-export.ts and web/src/lib/pdf-document.tsx):
 * Chromium prints the page on A4 through a 688 x 994 px viewport, the page
 * minus its margins. Print CSS sets body text to 11pt and code to 9pt
 * `pre-wrap`, so code wraps in a PDF instead of scrolling.
 *
 * Tables print with `table-layout: fixed` at the full printable width, so
 * every column gets an equal share whatever it holds. Cells wrap anywhere
 * (`overflow-wrap: anywhere`), but an inline code chip only breaks between
 * its pieces, and in a fit column or identifier cell every inline element
 * keeps `white-space: nowrap`. Text that cannot break runs past its column.
 */
export const PDF_PAGE = {
  format: "A4",
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginMm: { top: 16, right: 14, bottom: 18, left: 14 },
  printableWidthPx: 688,
  printableHeightPx: 994,
  bodyFontSizePt: 11,
  bodyLineHeight: 1.5,
  codeFontSizePt: 9,
  codeWhiteSpace: "pre-wrap",
  /** Print CSS cell padding (`th,td{padding:6pt}`), each side. */
  tableCellPadPt: 6,
  tableLayout: "fixed",
} as const;

/** Print code size in px: 9pt is 12px. */
export const PDF_CODE_FONT_SIZE_PX = PDF_PAGE.codeFontSizePt * PX_PER_PT;
/** Print table cell padding in px, each side: 6pt is 8px. */
export const PDF_TABLE_CELL_PAD_PX = PDF_PAGE.tableCellPadPt * PX_PER_PT;
