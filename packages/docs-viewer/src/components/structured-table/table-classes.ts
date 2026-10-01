/**
 * Option D class strings shared verbatim by the read renderer
 * (StructuredTableDocsBlock) and the editor grid (editor/TableGrid) so the
 * table looks byte-identical at rest in both surfaces. Every spacing, rule,
 * type and color value routes through a `--docs-table-*` theme token, and
 * every `var()` carries a fallback equal to the semantic.css default, so the
 * table renders the same where that stylesheet is absent (static export).
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
 * The line height is the ratio of Tailwind's small text step (20px at 14px),
 * which the title used before it had its own size token; it stays unitless
 * so it scales with the title size knob.
 */
export const TABLE_TITLE_CLASSES =
  "mb-[var(--docs-table-title-gap,6px)] text-[length:var(--docs-table-title-text-size,14px)] leading-[calc(1.25/0.875)] [font-weight:var(--docs-table-title-weight,500)] text-[color:var(--docs-table-title-fg,var(--foreground))]";

export const TABLE_WRAPPER_CLASSES =
  "overflow-auto rounded-[var(--docs-table-radius,var(--radius,2px))] border-[length:var(--docs-table-border-width,1px)] border-[color:var(--docs-table-border,var(--border))] bg-[color:var(--docs-table-bg,var(--background))]";

export const TABLE_ELEMENT_CLASSES =
  "w-full border-collapse text-left leading-[var(--docs-table-line-height,1.55)]";

export const TABLE_HEAD_CLASSES =
  "border-b border-solid border-b-[length:var(--docs-table-header-rule-width,2px)] border-b-[color:color-mix(in_srgb,var(--docs-table-header-rule,var(--docs-table-header-fg,currentColor))_calc(var(--docs-table-header-rule-opacity,0.7)*100%),transparent)] bg-[color:var(--docs-table-header-bg,transparent)] text-[color:var(--docs-table-header-fg,currentColor)]";

/**
 * The 60px floor (AFFiNE's ColumnMinWidth) keeps freshly added — still
 * empty — columns visible instead of collapsing to 0px in the auto-layout
 * table; populated columns are always wider, so at rest it changes nothing.
 *
 * The header size follows the body size by default (one pixel smaller) and
 * detaches only when its own token is set.
 */
export const TABLE_HEADER_CELL_TEXT_CLASSES =
  "min-w-[60px] align-top text-[length:var(--docs-table-header-text-size,calc(var(--docs-table-font-size,14px)-1px))] [font-weight:var(--docs-table-header-weight,500)]";

export const TABLE_ROW_HOVER_CLASSES =
  "transition-colors hover:bg-[color:var(--docs-table-row-hover-bg,color-mix(in_srgb,var(--muted)_20%,transparent))]";

/**
 * Floor for a body row's height. `height` on a table row is a minimum — rows
 * still grow to fit wrapped cells — so 0px leaves the cell padding in charge.
 */
export const TABLE_ROW_MIN_HEIGHT_CLASS = "h-[var(--docs-table-row-min-height,0px)]";

export const TABLE_ROW_RULE_CLASSES =
  "border-b border-solid border-b-[length:var(--docs-table-row-rule-width,1px)] border-b-[color:color-mix(in_srgb,var(--docs-table-row-rule,var(--border))_calc(var(--docs-table-row-rule-opacity,1)*100%),transparent)]";

export const TABLE_BODY_CELL_TEXT_CLASSES =
  "align-top text-[length:var(--docs-table-font-size,14px)] [font-weight:var(--docs-table-body-weight,400)] text-[color:var(--docs-table-fg,currentColor)]";

export const TABLE_CELL_SPACING_CLASS =
  "py-[length:var(--docs-table-cell-pad-y,10px)] px-[length:var(--docs-table-cell-pad-x,12px)]";

/**
 * Light vertical divider on every non-last column (Notion-style grid). Each
 * column-rule token falls back to its row-rule twin, so the dividers match
 * the row rules until a column token is set on its own.
 */
export const TABLE_COLUMN_RULE_CLASSES =
  "border-r border-solid border-r-[length:var(--docs-table-column-rule-width,var(--docs-table-row-rule-width,1px))] border-r-[color:color-mix(in_srgb,var(--docs-table-column-rule,var(--docs-table-row-rule,var(--border)))_calc(var(--docs-table-column-rule-opacity,var(--docs-table-row-rule-opacity,1))*100%),transparent)]";

/**
 * One text line tall, so an empty cell keeps its row from collapsing. Tracks
 * the line-height token — the read and edit cell islands both carry it.
 */
export const TABLE_CELL_MIN_HEIGHT_CLASS =
  "min-h-[calc(var(--docs-table-line-height,1.55)*1em)]";
