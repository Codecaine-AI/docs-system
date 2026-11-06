"use client";

import { useLayoutEffect, useMemo } from "react";
import { useNotesBelow } from "../notes-below";

/** The rows are wider than the panel. Every comment then moves under its line. */
function rowsOverflow(grid: HTMLDivElement): boolean {
  if (!grid.querySelector(".docs-pseudo-comment")) return false;
  return grid.scrollWidth > grid.clientWidth + 1;
}

/**
 * Per-row placement: a comment that would wrap beside its line moves under
 * that line (data-note-below on the row), and every other comment stays in the
 * aligned column. A move can narrow the code column and give the column room,
 * so placement runs until no comment moves, at most once per row.
 */
function placeComments(grid: HTMLDivElement) {
  const rows = [...grid.querySelectorAll<HTMLElement>(".docs-pseudo-row")];
  for (const row of rows) row.removeAttribute("data-note-below");
  if (grid.dataset.notes === "below") return;
  for (let pass = 0; pass < rows.length; pass += 1) {
    const wrapped = rows.filter((row) => {
      if (row.hasAttribute("data-note-below")) return false;
      const comment = row.querySelector<HTMLElement>(".docs-pseudo-comment");
      if (!comment) return false;
      const line = Number.parseFloat(getComputedStyle(comment).lineHeight) || Infinity;
      return comment.offsetHeight > 1.5 * line;
    });
    if (wrapped.length === 0) return;
    for (const row of wrapped) row.setAttribute("data-note-below", "");
  }
}

/** The pseudocode row grid (styles/code.css `.docs-pseudo-*`). `html` is the escaped and highlighted rows. */
export function PseudocodeGrid({ html, diff }: { html: string; diff: boolean }) {
  const notes = useNotesBelow(rowsOverflow);
  // One object per html: a re-render with a new object would reset the rows and drop their placement.
  const inner = useMemo(() => ({ __html: html }), [html]);
  useLayoutEffect(() => {
    const grid = notes.ref.current;
    if (!grid) return;
    placeComments(grid);
    // A web font that loads later changes how wide each line is, so measure again then.
    let live = true;
    const remeasure = () => { if (live) placeComments(grid); };
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    void fonts?.ready.then(remeasure);
    fonts?.addEventListener?.("loadingdone", remeasure);
    const stop = () => {
      live = false;
      fonts?.removeEventListener?.("loadingdone", remeasure);
    };
    if (typeof ResizeObserver === "undefined") return stop;
    let width = Math.round(grid.clientWidth);
    const observer = new ResizeObserver(() => {
      const next = Math.round(grid.clientWidth);
      if (next === width) return;
      width = next;
      placeComments(grid);
    });
    observer.observe(grid);
    return () => {
      stop();
      observer.disconnect();
    };
  }, [html, notes.below, notes.ref]);
  return (
    <div
      ref={notes.ref}
      className="hljs docs-pseudo-grid font-mono"
      data-pseudo-diff={diff ? "true" : undefined}
      data-notes={notes.below ? "below" : undefined}
      dangerouslySetInnerHTML={inner}
    />
  );
}
