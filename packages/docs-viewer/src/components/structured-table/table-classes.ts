/**
 * Option D class strings shared verbatim by the read renderer
 * (StructuredTableDocsBlock) and the editor grid (editor/TableGrid) so the
 * table looks byte-identical at rest in both surfaces. All spacing/rule
 * values route through the `--docs-table-*` theme tokens.
 */

export const TABLE_SECTION_CLASSES = "not-prose my-4";

export const TABLE_TITLE_CLASSES = "mb-1.5 text-sm font-medium text-foreground";

export const TABLE_WRAPPER_CLASSES =
  "overflow-auto rounded-md border border-[color:var(--docs-table-border,transparent)] bg-background";

export const TABLE_ELEMENT_CLASSES = "w-full border-collapse text-left leading-[1.55]";

export const TABLE_HEAD_CLASSES =
  "border-b border-solid border-b-[length:var(--docs-table-header-rule-width,1.5px)] border-b-[color:color-mix(in_srgb,var(--docs-table-header-rule,var(--docs-table-header-fg,currentColor))_calc(var(--docs-table-header-rule-opacity,0.5)*100%),transparent)] bg-[color:var(--docs-table-header-bg,transparent)] text-[color:var(--docs-table-header-fg,currentColor)]";

/**
 * The 60px floor (AFFiNE's ColumnMinWidth) keeps freshly added — still
 * empty — columns visible instead of collapsing to 0px in the auto-layout
 * table; populated columns are always wider, so at rest it changes nothing.
 */
export const TABLE_HEADER_CELL_TEXT_CLASSES =
  "min-w-[60px] align-top text-[length:calc(var(--docs-table-font-size,14px)-1px)] font-medium";

export const TABLE_ROW_HOVER_CLASSES = "transition-colors hover:bg-muted/20";

export const TABLE_ROW_RULE_CLASSES =
  "border-b border-solid border-b-[length:var(--docs-table-row-rule-width,1px)] border-b-[color:color-mix(in_srgb,var(--docs-table-row-rule,var(--border))_calc(var(--docs-table-row-rule-opacity,1)*100%),transparent)]";

export const TABLE_BODY_CELL_TEXT_CLASSES =
  "align-top text-[length:var(--docs-table-font-size,14px)]";

export const TABLE_CELL_SPACING_CLASS =
  "py-[length:var(--docs-table-cell-pad-y,10px)] pl-0";

export const TABLE_COLUMN_GAP_CLASS =
  "pr-[length:var(--docs-table-cell-pad-x,16px)]";

export const TABLE_LAST_COLUMN_CLASS = "pr-0";
