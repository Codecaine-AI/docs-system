import type { DeltaSpan } from "@codecaine-ai/docs-model/doc-schema";
import type { TableCell } from "@codecaine-ai/docs-model";

const BACKTICK_SPAN = /`([^`\n]+)`/g;

/**
 * A plain-string cell written with backtick code (`"`--syntax-function`"`)
 * as the span cell it means: each backtick pair becomes a `code`-marked span.
 *
 * Why: the cell actions (add_row, update_cell) parse their value as inline
 * markdown, but a table written through block props (insertBlock /
 * updateBlock `rows`) stores each cell verbatim, so its backticks reached the
 * page as literal glyphs. Lifting at read time fixes every stored table on
 * every surface: the read cell renderer, the cell-kind typing (a lifted
 * whole-code cell counts as code) and the mini cell editor's initial doc.
 * A string with no backtick pair is returned unchanged.
 */
export function liftBacktickCode(cell: TableCell): TableCell {
  if (typeof cell !== "string" || !cell.includes("`")) return cell;
  const spans: DeltaSpan[] = [];
  let cursor = 0;
  for (const match of cell.matchAll(BACKTICK_SPAN)) {
    const index = match.index ?? 0;
    if (index > cursor) spans.push({ insert: cell.slice(cursor, index) });
    spans.push({ insert: match[1], attributes: { code: true } });
    cursor = index + match[0].length;
  }
  if (spans.length === 0) return cell;
  if (cursor < cell.length) spans.push({ insert: cell.slice(cursor) });
  return spans;
}
