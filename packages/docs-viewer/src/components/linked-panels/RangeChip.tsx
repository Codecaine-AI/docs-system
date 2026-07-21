"use client";

import type { HTMLAttributes } from "react";
import { cn } from "../../ui/cn";
import { RANGE_CHIP_CLASSES } from "./classes";

/**
 * The universal address (system rule R2): every note, property row, and
 * annotation names its start/end lines with one chip — `L4` for a single
 * line, `L2–7` (en dash) for a span. Small bold mono in the shared
 * annotation accent.
 */

/** "L4" for a single line, "L2–7" (en dash) for a span; reversed input normalizes. */
export function formatLineRange(start: number, end?: number): string {
  const first = Math.max(1, Math.round(start));
  const last = end === undefined ? first : Math.max(1, Math.round(end));
  const lo = Math.min(first, last);
  const hi = Math.max(first, last);
  return lo === hi ? `L${lo}` : `L${lo}–${hi}`;
}

export function RangeChip({
  start,
  end,
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & {
  start: number;
  end?: number;
}) {
  return (
    <span {...rest} data-range-chip="true" className={cn(RANGE_CHIP_CLASSES, className)}>
      {formatLineRange(start, end)}
    </span>
  );
}
