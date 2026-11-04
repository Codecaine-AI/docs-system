"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Whether a block's side notes sit under their rows: true once `crowded`
 * says the side-by-side layout does not fit (the rows overflow, or a note
 * wraps). A width change measures again from the side-by-side layout.
 * Call-stack and component-tree rows (OutlineRows) and pseudocode comments
 * use it. `crowded` must be a stable function.
 */
export function useNotesBelow<T extends HTMLElement>(crowded: (el: T) => boolean) {
  const ref = useRef<T>(null);
  const [below, setBelow] = useState(false);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth((previous) => {
      const next = Math.round(el.clientWidth);
      if (next !== previous) setBelow(false);
      return next;
    }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !below && crowded(el)) setBelow(true);
  }, [below, width, crowded]);
  return { ref, below };
}
