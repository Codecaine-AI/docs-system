"use client";

import { offsetFromPoint } from "./caret";
import type { StepPath } from "./outline-edit";

/**
 * Pointer -> LINE hit testing. A click anywhere inside the outline has to land
 * a caret on a step, the way a click anywhere in a bullet list does: on the
 * text, in the empty space to its right, in the rail gutter, or in a gap
 * between rows. Nothing about a click inside the block may ever come back
 * "no line" while the block has lines — that answer is what used to leave
 * ProseMirror free to select the whole outline instead.
 *
 * Resolution runs DOM-first and geometry-second, on purpose: the DOM tells us
 * which row the pointer is over in every case the pointer is over one at all
 * (and it is the half that works in a headless test), and the rects only have
 * to answer "which row is nearest" for the gaps between rows.
 */

/** Where a pointer landed: the step's path, and a RENDERED-text offset within its line. */
export type LineHit = { path: StepPath; offset: number | "end" };

/** The attribute every step line carries, holding its path as `pathKey` writes it. */
const LINE_SELECTOR = "[data-process-outline-step]";

/** The row containers a click can land in that BELONG to exactly one step line. */
const ROW_SELECTOR =
  ".docs-process-outline__note-bullet, .docs-process-outline__line, .docs-process-outline__node";

/** `"0.1.2"` -> `[0, 1, 2]`; null for anything that is not an index path. */
export function parsePathKey(key: string | null): StepPath | null {
  if (!key) return null;
  const parts = key.split(".");
  const path: number[] = [];
  for (const part of parts) {
    const index = Number(part);
    if (!Number.isInteger(index) || index < 0) return null;
    path.push(index);
  }
  return path.length > 0 ? path : null;
}

/** The step path of a line element (or of anything inside one). */
export function pathFromLineElement(element: Element | null): StepPath | null {
  return parsePathKey(element?.getAttribute("data-process-outline-step") ?? null);
}

/**
 * The line element a target belongs to, WITHOUT geometry: the line itself, or
 * the row that owns it (a `__line`, a note bullet, or a whole `__node` — a
 * node's own line is the first one inside it, its children come after).
 */
export function lineElementFromTarget(target: Element | null): HTMLElement | null {
  if (!target) return null;
  const direct = target.closest<HTMLElement>(LINE_SELECTOR);
  if (direct) return direct;
  const row = target.closest<HTMLElement>(ROW_SELECTOR);
  return row?.querySelector<HTMLElement>(LINE_SELECTOR) ?? null;
}

/**
 * The line whose row is vertically nearest `y` — the answer for the pixels
 * that belong to no row at all (the padding above the first step, the gaps
 * between siblings, the lane margin beside the rail). Falls back to the first
 * line when no element reports a box, which is what a headless DOM does.
 */
export function nearestLineElement(root: Element | null, y: number): HTMLElement | null {
  if (!root) return null;
  const lines = Array.from(root.querySelectorAll<HTMLElement>(LINE_SELECTOR));
  if (lines.length === 0) return null;
  let best: HTMLElement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const rect = line.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (y >= rect.top && y <= rect.bottom) return line;
    const distance = y < rect.top ? rect.top - y : y - rect.bottom;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = line;
    }
  }
  return best ?? lines[0];
}

/**
 * Caret position for a pointer inside (or beside) one line. Past the end of
 * the text — the empty space to the right, or below the last row — is
 * end-of-line; before its start — the rail gutter — is offset 0. Between
 * those, the browser's own caret-from-point decides, so the caret lands on the
 * character that was clicked.
 */
export function offsetInLine(element: HTMLElement, x: number, y: number): number | "end" {
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    if (y > rect.bottom) return "end";
    if (y < rect.top) return 0;
    if (x > rect.right) return "end";
    if (x < rect.left) return 0;
  }
  return offsetFromPoint(element, x, y) ?? "end";
}

/**
 * The whole hit test: which step line the pointer is on, and where in it.
 * Returns null only when the outline has no lines to aim at (an empty
 * outline), where the placeholder owns the click instead.
 */
export function resolveLineHit(
  root: Element | null,
  target: Element | null,
  x: number,
  y: number,
): LineHit | null {
  const element = lineElementFromTarget(target) ?? nearestLineElement(root, y);
  if (!element) return null;
  const path = pathFromLineElement(element);
  if (!path) return null;
  return { path, offset: offsetInLine(element, x, y) };
}
