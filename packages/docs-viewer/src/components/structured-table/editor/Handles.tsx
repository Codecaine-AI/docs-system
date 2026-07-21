"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { cn } from "../../../ui/cn";

/**
 * Full-strength editor accent as a background (drop indicator, active handle
 * skin) — every piece of table furniture derives its accent from
 * `--docs-editor-accent` (workbench semantic tokens; the hex fallback keeps
 * host-neutral renders sane, since docs-viewer can't reference workbench CSS
 * at build time). Always spelled as a full literal class so Tailwind's
 * scanner can see it.
 */
export const HANDLE_ACCENT_BG_CLASS = "bg-[color:var(--docs-editor-accent,#2383e2)]";

const HANDLE_BASE_CLASSES =
  "absolute z-[2] flex cursor-grab items-center justify-center rounded-[var(--docs-table-handle-radius,3px)] transition-opacity duration-200 ease-out active:cursor-grabbing";

function handleSkin(active: boolean): string {
  return active
    ? cn(HANDLE_ACCENT_BG_CLASS, "border border-transparent text-white shadow-sm")
    : "border bg-background text-muted-foreground shadow-sm";
}

/**
 * Notion's six-dot grab glyph: the column pill carries 2 rows × 3 dots, the
 * row pill 3 rows × 2 dots.
 */
function Dots({ vertical = false }: { vertical?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("grid gap-[2px]", vertical ? "grid-cols-2" : "grid-cols-3")}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className="h-[2.5px] w-[2.5px] rounded-full bg-current" />
      ))}
    </span>
  );
}

/**
 * Column pill handle: 28×16, horizontally centered on the hovered column and
 * raised above the table's top edge by `--docs-table-handle-offset` (the
 * caller passes a calc() string for that axis, so the themed offset resolves
 * in CSS). Corner rounding comes from `--docs-table-handle-radius` — a small
 * radius by default, so the pills read as rectangles. Mousedown feeds the
 * reorder drag (which reports a plain click — menu open — inside the dead
 * zone). Active (menu open or dragging) swaps to the accent background with
 * white dots.
 */
export function ColumnHandle({
  left,
  top,
  active,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
}: {
  left: number | string;
  top: number | string;
  active: boolean;
  onMouseDown: (event: ReactMouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <button
      type="button"
      contentEditable={false}
      aria-label="Column handle"
      data-table-column-handle=""
      style={{ left, top }}
      className={cn(HANDLE_BASE_CLASSES, "h-4 w-7", handleSkin(active))}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Dots />
    </button>
  );
}

/**
 * Row pill handle: 16×28 (dots stacked 3×2), vertically centered on the
 * hovered BODY row and pushed left of the table's left edge by
 * `--docs-table-handle-offset` (a calc() string on that axis, same as the
 * column pill). The header row never gets one — it cannot be moved or
 * removed.
 */
export function RowHandle({
  left,
  top,
  active,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
}: {
  left: number | string;
  top: number | string;
  active: boolean;
  onMouseDown: (event: ReactMouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <button
      type="button"
      contentEditable={false}
      aria-label="Row handle"
      data-table-row-handle=""
      style={{ left, top }}
      className={cn(HANDLE_BASE_CLASSES, "h-7 w-4", handleSkin(active))}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Dots vertical />
    </button>
  );
}
