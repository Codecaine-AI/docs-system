/**
 * Layout facts and layout lints: the stock numbers the docs viewer lays
 * blocks out with (metrics.ts), monospace column counting (columns.ts), the
 * width each block gets on a page (block-width.ts), inline text measured
 * with the bundled fonts through @codecaine-ai/text-measure
 * (inline-measure.ts), and the rules built on them.
 */
export * from "./metrics";
export * from "./columns";
export * from "./block-width";
export { chipKind, chipNeedsPieces, chipPieces, monoBreakPieces, type ChipKind } from "./chips";
export { liftBacktickCode, tableCellKinds, tableColumnFits, WRAP_THRESHOLD, type TableCellKind, type TableColumnFit } from "./table-columns";
export { measureInline, type InlineContext, type InlineLayout, type MeasuredText, type WrapMode } from "./inline-measure";
export { FIT_TOLERANCE_PX, widthVerdict, type LayoutVerdict } from "./fit";
export { codeDisplayText, codeHasNotes, codeLineWidthRule } from "./code-line-width";
export { structuredTableWidths, tableFitRule, type TableCellWidth, type TableColumnWidth, type TableWidths } from "./table-fit";
export { stackDetailFit, stackDetailFitRule, stackDetailLines, type StackDetailLine } from "./stack-detail-fit";
export { layoutRules } from "./rules";
