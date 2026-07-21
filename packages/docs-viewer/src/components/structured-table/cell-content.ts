"use client";

import type { DeltaSpan, DeltaSpanAttributes } from "@codecaine-ai/docs-model/doc-schema";
import { normalizeTableCell, type TableCell } from "@codecaine-ai/docs-model";
import { cellDeltaToPMInline, pmInlineToCellDelta, type PMNode } from "../../editor/core/convert";
import { isDeltaSpanArray } from "../../editor/core/node-helpers";

/**
 * TableCell <-> mini-cell-editor bridge. A cell's canonical value is
 * docs-model's `TableCell` (`string` when unmarked, `DeltaSpan[]` when
 * carrying bold/italic/strike/code/link marks); the per-cell TipTap editor
 * holds it as a single-paragraph PM doc whose hard breaks map to "\n" in
 * span inserts. All conversion in and out funnels through convert.ts's
 * shared text+marks logic so the mark<->attribute mapping exists exactly
 * once.
 */

/** Shape gate for props parsing: a valid cell is a plain string or a structurally valid DeltaSpan[]. */
export function isTableCellValue(value: unknown): value is TableCell {
  return typeof value === "string" || isDeltaSpanArray(value);
}

/** Cell -> spans (plain string becomes one unattributed span; "" -> []). */
export function tableCellSpans(cell: TableCell): DeltaSpan[] {
  if (typeof cell === "string") return cell.length > 0 ? [{ insert: cell }] : [];
  return cell;
}

/** Cell -> the mini cell editor's whole-doc PM JSON (one paragraph). */
export function tableCellToPMDoc(cell: TableCell): PMNode {
  const inline = cellDeltaToPMInline(tableCellSpans(cell));
  return {
    type: "doc",
    content: [inline.length > 0 ? { type: "paragraph", content: inline } : { type: "paragraph" }],
  };
}

/**
 * Mini cell editor whole-doc PM JSON -> canonical TableCell. The doc is a
 * single paragraph by schema; extra paragraphs (defensive — e.g. a hand-built
 * doc in a test) join with "\n" rather than silently concatenating.
 */
export function pmDocToTableCell(doc: PMNode): TableCell {
  const spans: DeltaSpan[] = [];
  (doc.content ?? []).forEach((paragraph, index) => {
    if (index > 0) spans.push({ insert: "\n" });
    spans.push(...pmInlineToCellDelta(paragraph.content ?? []));
  });
  return normalizeTableCell(spans);
}

const CELL_MARK_KEYS = ["bold", "italic", "strike", "code", "link"] as const;

function sameCellMarkAttrs(
  a: DeltaSpanAttributes | undefined,
  b: DeltaSpanAttributes | undefined,
): boolean {
  const an = a ?? {};
  const bn = b ?? {};
  return CELL_MARK_KEYS.every((key) => an[key] === bn[key]);
}

/** Value equality over the canonical cell forms (both sides normalized first, so `""` == `[]` and merged spans compare stably). */
export function tableCellEquals(a: TableCell, b: TableCell): boolean {
  const an = normalizeTableCell(a);
  const bn = normalizeTableCell(b);
  if (typeof an === "string" || typeof bn === "string") return an === bn;
  if (an.length !== bn.length) return false;
  return an.every((span, index) => {
    const other = bn[index];
    return span.insert === other.insert && sameCellMarkAttrs(span.attributes, other.attributes);
  });
}
