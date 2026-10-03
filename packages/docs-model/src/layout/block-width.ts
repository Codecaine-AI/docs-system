import type { DocBlockType, DocDocument } from "../doc-schema";
import { BLOCK_LANE, LANE_PX, NESTED_INSET_PX, PDF_PAGE, type LaneName } from "./metrics";

/** The lane cap in px a block type claims at the top level of a page (`text` for unknown types). */
export function laneWidthPx(type: string): number {
  return LANE_PX[BLOCK_LANE[type as DocBlockType] ?? "text"];
}

/** Where a document-owned block lays out: its top-level ancestor's lane, and the room the list items on the way keep. */
export interface BlockPlacement {
  lane: LaneName;
  /** Horizontal px taken by enclosing containers (24px per enclosing list item). */
  insetPx: number;
}

/**
 * Each document-owned block's placement. A top-level block takes its own
 * lane. A nested block is not re-laned (docs-viewer DocBlockRenderer): it
 * takes its top-level ancestor's lane, minus the room each list item on the
 * way keeps (NESTED_INSET_PX).
 */
export function blockPlacements(document: DocDocument): Map<string, BlockPlacement> {
  const placements = new Map<string, BlockPlacement>();
  const visit = (id: string, parent: BlockPlacement | undefined) => {
    const block = document.blocks[id];
    if (!block || placements.has(id)) return;
    const own = parent ?? { lane: BLOCK_LANE[block.type as DocBlockType] ?? "text", insetPx: 0 };
    placements.set(id, own);
    const inner = { lane: own.lane, insetPx: own.insetPx + (NESTED_INSET_PX[block.type] ?? 0) };
    for (const child of block.children) visit(child, inner);
  };
  for (const child of document.blocks[document.root]?.children ?? []) visit(child, undefined);
  return placements;
}

/**
 * The width available to each document-owned block at stock settings, in
 * px: the containing width it lays out in. A fit-content block (a short
 * table, a small tree) renders narrower than this. A code block inside a
 * list item gets the text lane less the marker column, not the code lane.
 */
export function blockWidthsPx(document: DocDocument): Map<string, number> {
  const widths = new Map<string, number>();
  for (const [id, placement] of blockPlacements(document)) widths.set(id, LANE_PX[placement.lane] - placement.insetPx);
  return widths;
}

/**
 * The width each block gets in PDF export: print CSS drops the lanes, so
 * every block spans the printable width, less the room enclosing list items
 * keep.
 */
export function blockPdfWidthsPx(document: DocDocument): Map<string, number> {
  const widths = new Map<string, number>();
  for (const [id, placement] of blockPlacements(document)) widths.set(id, PDF_PAGE.printableWidthPx - placement.insetPx);
  return widths;
}
