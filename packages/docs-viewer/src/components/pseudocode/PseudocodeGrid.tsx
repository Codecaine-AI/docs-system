"use client";

import { useNotesBelow } from "../notes-below";

/**
 * The comment column is crowded when a comment wraps beside its line, or the
 * rows are wider than the panel. Every comment then moves under its line.
 */
function commentsCrowded(grid: HTMLDivElement): boolean {
  const comments = [...grid.querySelectorAll<HTMLElement>(".docs-pseudo-comment")];
  if (comments.length === 0) return false;
  if (grid.scrollWidth > grid.clientWidth + 1) return true;
  return comments.some((comment) => comment.offsetHeight > 1.5 * (Number.parseFloat(getComputedStyle(comment).lineHeight) || Infinity));
}

/** The pseudocode row grid (styles/code.css `.docs-pseudo-*`). `html` is the escaped and highlighted rows. */
export function PseudocodeGrid({ html, diff }: { html: string; diff: boolean }) {
  const notes = useNotesBelow(commentsCrowded);
  return (
    <div
      ref={notes.ref}
      className="hljs docs-pseudo-grid font-mono"
      data-pseudo-diff={diff ? "true" : undefined}
      data-notes={notes.below ? "below" : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
