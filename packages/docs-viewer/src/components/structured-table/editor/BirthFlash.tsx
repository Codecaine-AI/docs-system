"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../../ui/cn";
import { unionRect, type Rect } from "./geometry";
import { HANDLE_ACCENT_BG_CLASS } from "./Handles";
import type { TableData } from "./mutations";
import { rangeRects, type CellRectMap } from "./overlay-geometry";
import { HEADER_ROW, type CellPosition } from "./TableGrid";

/** Inclusive cell range one birth-flash slab covers (rows may include HEADER_ROW). */
export type FlashRange = { anchor: CellPosition; head: CellPosition };

/** How long the accent wash takes to fade to transparent. */
export const BIRTH_FLASH_DURATION_MS = 600;
/** Unmount fallback if animationend never fires (hidden ancestors, test DOMs). */
export const BIRTH_FLASH_FALLBACK_MS = BIRTH_FLASH_DURATION_MS + 400;

/**
 * Flash range for just-added columns `from..to`: header through the last body
 * row. With no body rows, `rows.length - 1` IS `HEADER_ROW`, so the range
 * degrades to the header cells alone.
 */
export function columnsFlashRange(data: TableData, from: number, to: number): FlashRange {
  return {
    anchor: { row: HEADER_ROW, col: from },
    head: { row: data.rows.length - 1, col: to },
  };
}

/** Flash range for just-added rows `from..to`: the rows' full width. */
export function rowsFlashRange(data: TableData, from: number, to: number): FlashRange {
  return { anchor: { row: from, col: 0 }, head: { row: to, col: data.columns.length - 1 } };
}

/**
 * One-shot "birth flash" over freshly added columns/rows: an accent wash
 * (same accent family as DragRegionOverlay, ~14% strength) that fades to
 * transparent over BIRTH_FLASH_DURATION_MS and then unmounts — the visible
 * answer to "where did my new column go?" in a table with no vertical rules.
 *
 * The node view keys each mount by a flash token, so this measures ONCE on
 * mount: the layout effect runs in the same commit that mounted and
 * registered the freshly added cells, exactly when the registry can resolve
 * them. Purely visual — absolutely positioned (no layout shift),
 * `pointer-events-none`, removed on animationend with a timer fallback so it
 * can never linger.
 */
export function BirthFlash({
  ranges,
  cells,
  surface,
  onDone,
}: {
  ranges: FlashRange[];
  cells: CellRectMap;
  surface: HTMLElement | null;
  onDone: () => void;
}) {
  const [rects, setRects] = useState<Rect[]>([]);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only measure; the parent remounts per flash token
  useLayoutEffect(() => {
    if (!surface) return;
    const measured: Rect[] = [];
    for (const range of ranges) {
      const rect = unionRect(rangeRects(cells, surface, range.anchor, range.head));
      if (rect) measured.push(rect);
    }
    setRects(measured);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), BIRTH_FLASH_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, []);

  if (rects.length === 0) return null;
  return (
    <>
      <style>{"@keyframes docs-table-birth-flash{0%{opacity:0.14}100%{opacity:0}}"}</style>
      {rects.map((rect, index) => (
        <div
          key={index}
          contentEditable={false}
          data-table-birth-flash=""
          className={cn(
            "pointer-events-none absolute z-[3] rounded-sm",
            HANDLE_ACCENT_BG_CLASS,
          )}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            // `forwards` holds the faded-out end state, so even a delayed
            // unmount shows nothing.
            opacity: 0,
            animation: `docs-table-birth-flash ${BIRTH_FLASH_DURATION_MS}ms ease-out forwards`,
          }}
          onAnimationEnd={() => onDoneRef.current()}
        />
      ))}
    </>
  );
}
