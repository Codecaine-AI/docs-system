"use client";

import type { HTMLAttributes } from "react";
import { cn } from "../../ui/cn";
import { RANGE_CHIP_CLASSES, RANGE_CHIP_LIT_CLASSES } from "./classes";

/**
 * The universal address (system rule R2): every note, property row, and
 * annotation names its start/end lines with one chip — `L4` for a single
 * line, `L2–7` (en dash) for a span. A 12px mono outlined chip in the page
 * muted color; a lit pair turns it to the link color on a soft accent fill.
 */

/** "L4" for a single line, "L2–7" (en dash) for a span; reversed input normalizes. */
export function formatLineRange(start: number, end?: number): string {
  const first = Math.max(1, Math.round(start));
  const last = end === undefined ? first : Math.max(1, Math.round(end));
  const lo = Math.min(first, last);
  const hi = Math.max(first, last);
  return lo === hi ? `L${lo}` : `L${lo}–${hi}`;
}

/**
 * A code annotation's `lines` key ("4", "4-9", "1,4-6") as chip text: each
 * comma segment becomes its own L-address, spans take an en dash —
 * "L4", "L4–9", "L1, L4–6". Unparseable segments pass through trimmed.
 */
export function formatLinesKey(lines: string): string {
  return lines
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(segment);
      if (!match) return segment;
      return formatLineRange(Number(match[1]), match[2] === undefined ? undefined : Number(match[2]));
    })
    .join(", ");
}

export function RangeChip({
  start,
  end,
  lines,
  lit,
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> &
  (
    | { start: number; end?: number; lines?: undefined }
    | { lines: string; start?: undefined; end?: undefined }
  ) & {
    /** The pair is lit (hovered, focused or pinned): link-color chip. */
    lit?: boolean;
  }) {
  return (
    <span {...rest} data-range-chip="true" className={cn(RANGE_CHIP_CLASSES, lit && RANGE_CHIP_LIT_CLASSES, className)}>
      {lines !== undefined ? formatLinesKey(lines) : formatLineRange(start ?? 1, end)}
    </span>
  );
}
