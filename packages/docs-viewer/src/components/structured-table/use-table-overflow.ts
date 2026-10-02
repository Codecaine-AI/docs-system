"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Whether the table's scroll frame is narrower than the table inside it —
 * i.e. whether it actually scrolls horizontally. The frame carries the
 * answer as `data-table-overflow`, which shows the pinned first column's
 * edge rule (table-classes.ts). Re-measured whenever the frame or the table
 * resizes; environments without ResizeObserver (SSR, tests) report false.
 *
 * Returns a callback ref for the frame element.
 */
export function useTableOverflow(): {
  frameRef: (element: HTMLDivElement | null) => void;
  overflowing: boolean;
} {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const frameRef = useCallback((element: HTMLDivElement | null) => setFrame(element), []);

  useEffect(() => {
    if (!frame || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflowing(frame.scrollWidth > frame.clientWidth + 0.5);
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    const table = frame.querySelector("table");
    if (table) observer.observe(table);
    measure();
    return () => observer.disconnect();
  }, [frame]);

  return { frameRef, overflowing };
}
