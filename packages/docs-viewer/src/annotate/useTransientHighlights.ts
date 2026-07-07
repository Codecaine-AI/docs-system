"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Transient "recently changed" id set (CP9, TG9.3 — the D12 deliverable's
 * changed-id highlight half: apply → changed-id highlights + op summary +
 * one-click undo).
 *
 * `flash(ids)` marks ids as highlighted for `durationMs` (default ~2s).
 * Ids are refcounted: each flash holds its ids for its own full window, so
 * an id re-flashed mid-window stays lit until the LATEST window ends
 * instead of being clipped by the earlier flash's timer. Ids are opaque
 * here: doc block ids and canvas object ids share the set (the DOM marking
 * side matches whichever kind exists — see DocsViewer's
 * `[data-block-id]`/`[data-canvas-object-id]` effect).
 *
 * All pending timers are cleared on unmount.
 */
export function useTransientHighlights(durationMs = 2000): {
  highlightedIds: ReadonlySet<string>;
  flash: (ids: readonly string[]) => void;
} {
  const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(() => new Set());
  const countsRef = useRef<Map<string, number>>(new Map());
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const flash = useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 0) return;
      const counts = countsRef.current;
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      setHighlightedIds(new Set(counts.keys()));

      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        for (const id of ids) {
          const remaining = counts.get(id) ?? 0;
          if (remaining <= 1) counts.delete(id);
          else counts.set(id, remaining - 1);
        }
        setHighlightedIds(new Set(counts.keys()));
      }, durationMs);
      timersRef.current.add(timer);
    },
    [durationMs],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return { highlightedIds, flash };
}
