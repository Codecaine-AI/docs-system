/**
 * Class strings shared verbatim by the read renderer
 * (StructuredTableDocsBlock) and the editor grid (editor/TableGrid) so the
 * table looks byte-identical at rest in both surfaces. Every spacing, rule,
 * type and color value routes through a `--docs-table-*` theme token, and
 * every `var()` carries a fallback equal to the semantic.css LIGHT default
 * (the app palette value of the role token it follows), so the table renders
 * the same where that stylesheet is absent (static export).
 *
 * The table is a panel: one rule-colored frame on the panel background that
 * shrinks to its content (the lane is a maximum, never a target). The frame
 * starts at the header row — a block title is never drawn; it only labels
 * the `<table>` for assistive tech. The header row is muted sans over one
 * rule, body rows are split by the soft rule, and there are no column rules
 * at stock. Column sizing (column-layout.ts): identifier and short columns
 * fit their content on one line, one prose column takes the remaining width
 * and wraps at a 60ch measure. When even that overflows the lane, the frame
 * scrolls horizontally under a pinned first column.
 *
 * Cell typography is set ON the th/td. A host stylesheet that re-asserts prose
 * typography on `td`/`th`/`p` from outside a cascade layer beats these
 * utilities outright (unlayered rules win over `@layer utilities` regardless
 * of specificity), which silently kills the type knobs — the workbench's
 * index.css therefore exempts structured-table descendants from its prose
 * re-assertion rules.
 */

export const TABLE_SECTION_CLASSES = "not-prose my-4";

/**
 * The grid's frame: the panel's rule-colored border and fill around the
 * scroll box. `w-fit` shrinks it to the table; `max-w-full` caps it at the
 * lane, past which the box scrolls (TABLE_STICKY_* pins the first column).
 * The frame carries `data-table-overflow` while it actually scrolls
 * (use-table-overflow.ts), which shows the pinned column's edge rule.
 */
export const TABLE_WRAPPER_CLASSES =
  "w-fit max-w-full overflow-auto rounded-[var(--docs-table-radius,var(--radius,2px))] border-[length:var(--docs-table-border-width,1px)] border-[color:var(--docs-table-border,var(--docs-rule,#e6e5e3))] bg-[color:var(--docs-table-bg,var(--docs-panel,#f8f8f7))]";

/** Auto width: the table is as wide as its columns' content, never stretched to the frame. */
export const TABLE_ELEMENT_CLASSES =
  "border-collapse text-left leading-[var(--docs-table-line-height,1.45)]";

/**
 * Per-column sizing classes (column-layout.ts), on every th/td of the column.
 * A fit column never wraps — the editor's mini cell editor sets its own
 * pre-wrap, hence the descendant override. Prose/wrap columns get their
 * measure from TABLE_PROSE_MEASURE_CLASS around the cell content instead.
 */
export const TABLE_COLUMN_FIT_CLASSES = {
  fit: "whitespace-nowrap **:whitespace-nowrap",
  prose: "",
  wrap: "",
} as const;

/**
 * The prose measure, on a block wrapped around a prose/wrap cell's content:
 * the column's preferred width is its text, capped at 60ch, so it shrinks to
 * short text and wraps long text. `min-w-min` keeps the longest word whole —
 * a prose cell only ever breaks between words (the column's minimum width is
 * its longest word, so `break-words` on the editor island never fires).
 */
export const TABLE_PROSE_MEASURE_CLASS = "max-w-[var(--ds-layout-lane-text)] min-w-min";

/**
 * The pinned first column (th and td): sticky at the frame's left edge,
 * above the cells scrolling under it, painted opaque — the panel fill under
 * the row's own fill (the header's tint, the hovered row's hover fill) so it
 * matches its row exactly. While the frame scrolls, a 1px frame-colored rule
 * marks its right edge. Without overflow, `sticky` changes nothing.
 */
const TABLE_STICKY_BASE_CLASSES =
  "sticky left-0 z-1 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-[length:var(--docs-table-border-width,1px)] after:bg-[color:var(--docs-table-border,var(--docs-rule,#e6e5e3))] after:opacity-0 [[data-table-overflow]_&]:after:opacity-100";

export const TABLE_STICKY_HEADER_CELL_CLASSES = `${TABLE_STICKY_BASE_CLASSES} bg-[image:linear-gradient(var(--docs-table-header-bg,transparent),var(--docs-table-header-bg,transparent))] bg-[color:var(--docs-table-bg,var(--docs-panel,#f8f8f7))]`;

export const TABLE_STICKY_BODY_CELL_CLASSES = `${TABLE_STICKY_BASE_CLASSES} bg-[color:var(--docs-table-bg,var(--docs-panel,#f8f8f7))] [tr:hover>&]:bg-[color:var(--docs-table-row-hover-bg,var(--docs-hover,#ebebea))]`;

/** One rule under the header row — no box, no texture. */
export const TABLE_HEAD_CLASSES =
  "border-b border-solid border-b-[length:var(--docs-table-header-rule-width,1px)] border-b-[color:color-mix(in_srgb,var(--docs-table-header-rule,var(--docs-rule,#e6e5e3))_calc(var(--docs-table-header-rule-opacity,1)*100%),transparent)] bg-[color:var(--docs-table-header-bg,transparent)] text-[color:var(--docs-table-header-fg,var(--docs-muted,#666562))]";

/**
 * The 60px floor (AFFiNE's ColumnMinWidth) keeps freshly added — still
 * empty — columns visible instead of collapsing to 0px in the auto-layout
 * table; populated columns are always wider, so at rest it changes nothing.
 *
 * The header size follows the body size by default and detaches only when
 * its own token is set.
 */
export const TABLE_HEADER_CELL_TEXT_CLASSES =
  "min-w-15 align-top text-[length:var(--docs-table-header-text-size,var(--docs-table-font-size,13.5px))] font-[var(--docs-table-header-weight,500)]";

export const TABLE_ROW_HOVER_CLASSES =
  "transition-colors hover:bg-[color:var(--docs-table-row-hover-bg,var(--docs-hover,#ebebea))]";

/**
 * Floor for a body row's height. `height` on a table row is a minimum — rows
 * still grow to fit wrapped cells.
 */
export const TABLE_ROW_MIN_HEIGHT_CLASS = "h-[var(--docs-table-row-min-height,28px)]";

export const TABLE_ROW_RULE_CLASSES =
  "border-b border-solid border-b-[length:var(--docs-table-row-rule-width,1px)] border-b-[color:color-mix(in_srgb,var(--docs-table-row-rule,var(--docs-rule-soft,#efeeec))_calc(var(--docs-table-row-rule-opacity,1)*100%),transparent)]";

/**
 * Body cell type. A td carrying `data-cell-kind` (cell-kind.ts) is an
 * identifier cell: 0.5px under the body size in the code font, ink colored —
 * and the key column's identifier is the one colored cell, in the key token
 * (property syntax role). Inside it the inline-code chip vars are zeroed
 * (the typed-chip color on the code element itself included), so a
 * whole-cell code span reads as the same plain mono (both the chip
 * utilities and the workbench's unlayered chip rule read those vars). An
 * identifier cell keeps the sans cells' line box (body size times line
 * height) so baselines line up across a row, and it never breaks at its
 * hyphens: the cell and its editor island
 * stay on one line, so prose columns wrap instead (the frame scrolls when
 * identifiers alone overflow it).
 */
export const TABLE_BODY_CELL_TEXT_CLASSES = [
  "align-top text-[length:var(--docs-table-font-size,13.5px)] font-[var(--docs-table-body-weight,400)] text-[color:var(--docs-table-fg,var(--docs-text,#2a2a2a))]",
  "data-[cell-kind]:font-[family-name:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace)] data-[cell-kind]:text-[length:calc(var(--docs-table-font-size,13.5px)-0.5px)] data-[cell-kind]:leading-[calc(var(--docs-table-font-size,13.5px)*var(--docs-table-line-height,1.45))] data-[cell-kind]:whitespace-nowrap data-[cell-kind]:**:whitespace-nowrap",
  "data-[cell-kind=mono]:text-[color:var(--docs-ink,#1f1f1f)] data-[cell-kind=key]:text-[color:var(--docs-table-key-fg,var(--docs-syn-prop,#0d7164))]",
  "data-[cell-kind]:[--docs-inline-code-bg:transparent] data-[cell-kind]:[--docs-inline-code-fg:currentColor] data-[cell-kind]:[&_code]:[--docs-chip-kind-fg:currentColor] data-[cell-kind]:[--docs-inline-code-pad-x:0] data-[cell-kind]:[--docs-inline-code-pad-y:0] data-[cell-kind]:[--docs-inline-code-text-size:1] data-[cell-kind]:[--docs-inline-code-border-width:0px]",
].join(" ");

export const TABLE_CELL_SPACING_CLASS =
  "py-[length:var(--docs-table-cell-pad-y,4px)] px-[length:var(--docs-table-cell-pad-x,12px)]";

/**
 * Vertical divider on every non-last column — 0px wide at stock (no column
 * rules), kept so the Column rule knobs can bring them back. The color and
 * opacity fall back to their row-rule twins.
 */
export const TABLE_COLUMN_RULE_CLASSES =
  "border-r border-solid border-r-[length:var(--docs-table-column-rule-width,0px)] border-r-[color:color-mix(in_srgb,var(--docs-table-column-rule,var(--docs-table-row-rule,var(--docs-rule-soft,#efeeec)))_calc(var(--docs-table-column-rule-opacity,var(--docs-table-row-rule-opacity,1))*100%),transparent)]";

/**
 * One text line tall, so an empty cell keeps its row from collapsing. Tracks
 * the line-height token — the read and edit cell islands both carry it.
 */
export const TABLE_CELL_MIN_HEIGHT_CLASS =
  "min-h-[calc(var(--docs-table-line-height,1.45)*1em)]";
