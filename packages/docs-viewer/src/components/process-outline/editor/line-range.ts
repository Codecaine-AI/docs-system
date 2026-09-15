"use client";

import { serializeProcessOutline, type ProcessOutlineStep } from "@codecaine-ai/docs-model";
import {
  documentOrderPaths,
  pathKey,
  previousStepPath,
  samePath,
  stepAt,
  type OutlineAction,
  type OutlinePlan,
  type StepPath,
} from "./outline-edit";

/**
 * LINE-RANGE selection for the outline — the "drag across a bunch of bullets"
 * half of editing it like a bullet list. Everything here is PURE: a range is
 * two paths (where the drag started, where it is now), and every question the
 * node view asks about it — which lines highlight, what Copy writes, what
 * Delete removes — is answered from the step tree alone.
 *
 * Two rules give the range its shape:
 *
 * - DOCUMENT ORDER. The range is the contiguous run of lines between anchor
 *   and head as they read top to bottom, which is pre-order over the forest —
 *   exactly the order the rail draws.
 * - SUBTREE IMPLICATION. Selecting a step selects everything nested under it.
 *   You cannot take a phase without its substeps, because `removeStep` takes
 *   the subtree with it and a selection that lied about that would delete more
 *   than it highlighted.
 *
 * Deletion is still a plan of typed actions (`process-outline.removeStep`, one
 * per TOP-LEVEL selected step, applied bottom-up so earlier indices stay
 * valid), so a range delete is validated by the same registry an agent edit is.
 */

/** A live line selection: where the drag started, and the line the pointer is on now. */
export type LineRange = { anchor: StepPath; head: StepPath };

/** True when `path` sits inside (or is) `prefix` — the subtree test. */
function isDescendant(path: StepPath, prefix: StepPath): boolean {
  return path.length > prefix.length && prefix.every((index, i) => path[i] === index);
}

/** Index of the LAST path belonging to `order[index]`'s subtree (itself when it is a leaf). */
function subtreeEndIndex(order: readonly StepPath[], index: number): number {
  let end = index;
  while (end + 1 < order.length && isDescendant(order[end + 1], order[index])) end += 1;
  return end;
}

/**
 * Every path the range covers, in document order: the run between anchor and
 * head, grown forward so no subtree is ever half-selected. Returns `[]` when
 * either end no longer resolves (the tree moved underneath the range).
 */
export function rangePaths(
  steps: readonly ProcessOutlineStep[],
  range: LineRange | null,
): StepPath[] {
  if (!range) return [];
  const order = documentOrderPaths(steps);
  const a = order.findIndex((path) => samePath(path, range.anchor));
  const b = order.findIndex((path) => samePath(path, range.head));
  if (a === -1 || b === -1) return [];
  const start = Math.min(a, b);
  let end = Math.max(a, b);
  // A subtree is contiguous in pre-order, so growing the tail is enough: every
  // descendant of a selected step sits immediately after it.
  for (let index = start; index <= end; index += 1) {
    const subtreeEnd = subtreeEndIndex(order, index);
    if (subtreeEnd > end) end = subtreeEnd;
  }
  return order.slice(start, end + 1);
}

/** Path-key set for the render pass — one `has` per line instead of a scan per line. */
export function rangeKeys(paths: readonly StepPath[]): Set<string> {
  return new Set(paths.map(pathKey));
}

/**
 * The selected paths that no OTHER selected path contains — the steps a
 * removal (or a copy) actually names, since each one carries its subtree.
 */
export function topLevelPaths(paths: readonly StepPath[]): StepPath[] {
  return paths.filter((path) => !paths.some((other) => isDescendant(path, other)));
}

/** The selected steps as a forest, each with its subtree — what Copy serializes. */
export function rangeSteps(
  steps: readonly ProcessOutlineStep[],
  range: LineRange | null,
): ProcessOutlineStep[] {
  const selected = topLevelPaths(rangePaths(steps, range));
  const forest: ProcessOutlineStep[] = [];
  for (const path of selected) {
    const step = stepAt(steps, path);
    if (step) forest.push(step);
  }
  return forest;
}

/**
 * Copy text for a range: the block's OWN notation (`-> ` substeps, `> ` notes,
 * `=> ` trace steps), from the same serializer the agent view and the markdown
 * projection use. Pasting it into any editor gives readable text, and pasting
 * it back into a process-outline fence round-trips the structure — the top
 * selected steps land at depth 0, because a selection is its own outline.
 */
export function serializeRange(
  steps: readonly ProcessOutlineStep[],
  range: LineRange | null,
): string {
  return serializeProcessOutline(rangeSteps(steps, range));
}

/**
 * Delete/Backspace over a range: one `removeStep` per top-level selected step,
 * in REVERSE document order so each removal leaves the not-yet-removed paths
 * addressable. The caret lands on the line above the range (pre-order
 * predecessor — an ancestor or an earlier subtree, so removing the range never
 * moves it), or nowhere when the range took the whole outline.
 */
export function planRemoveRange(
  steps: readonly ProcessOutlineStep[],
  range: LineRange | null,
): OutlinePlan | null {
  const paths = rangePaths(steps, range);
  if (paths.length === 0) return null;
  const selected = topLevelPaths(paths);
  if (selected.length === 0) return null;
  const actions: OutlineAction[] = [...selected]
    .reverse()
    .map((path) => ({ action: "process-outline.removeStep", params: { path: [...path] } }));
  const previous = previousStepPath(steps, selected[0]);
  return { actions, caret: previous ? { path: previous, offset: "end" } : "clear" };
}

/**
 * Shift+Down / Shift+Up: move the HEAD one line, leaving the anchor put.
 * Growing downward skips the head's own subtree, which is already selected —
 * otherwise the first Shift+Down over a phase would highlight nothing new.
 * Returns null at the ends of the outline, where the range just stays.
 */
export function extendRangeHead(
  steps: readonly ProcessOutlineStep[],
  range: LineRange,
  delta: 1 | -1,
): LineRange | null {
  const order = documentOrderPaths(steps);
  const index = order.findIndex((path) => samePath(path, range.head));
  if (index === -1) return null;
  const next = delta === 1 ? subtreeEndIndex(order, index) + 1 : index - 1;
  if (next < 0 || next >= order.length) return null;
  return { anchor: range.anchor, head: order[next] };
}

/** The line one step away in document order — Shift+Arrow's first hop out of a caret. */
export function neighborPath(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
  delta: 1 | -1,
): StepPath | undefined {
  const order = documentOrderPaths(steps);
  const index = order.findIndex((candidate) => samePath(candidate, path));
  if (index === -1) return undefined;
  const next = delta === 1 ? subtreeEndIndex(order, index) + 1 : index - 1;
  return next >= 0 && next < order.length ? order[next] : undefined;
}
