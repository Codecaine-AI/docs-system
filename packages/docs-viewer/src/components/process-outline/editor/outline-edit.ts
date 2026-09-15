"use client";

import {
  ACTION_REGISTRY,
  checkParams,
  readProcessOutlineStepTree,
  readProcessOutlineSteps,
  type ProcessOutlineNode,
  type ProcessOutlineStep,
} from "@codecaine-ai/docs-model";
import type { DocBlock, DocValidationIssue } from "@codecaine-ai/docs-model/doc-schema";

/**
 * Hand-editing brain for the process outline. Everything here is PURE: a
 * keystroke turns into a PLAN — a list of typed component actions plus where
 * the caret should land afterwards — and the node view is the only thing that
 * touches the DOM or the editor.
 *
 * The plans never mutate the tree themselves. They name actions from the SAME
 * registry the docs-kernel `outline_*` tools dispatch
 * (`process-outline.insertStep` and friends), and `runOutlineActions` replays
 * doc-ops.ts's `componentAction` case verbatim: registry lookup, TypeBox
 * `checkParams`, `apply`, shallow-merge the returned props patch. A hand edit
 * is therefore validated by exactly the code path an agent edit is — including
 * the note-is-a-leaf refusals baked into insertStep/moveStep — and any refusal
 * comes back as issues the node view drops the keystroke on instead of writing
 * an invalid tree.
 */

/** Index path into the step forest; `[]` names the root list, never a step. */
export type StepPath = readonly number[];

/** One typed component action, shaped like the `componentAction` doc op's payload. */
export type OutlineAction = { action: string; params: Record<string, unknown> };

export type OutlineActionsResult =
  | { ok: true; props: Record<string, unknown> }
  | { ok: false; issues: DocValidationIssue[] };

/** Where the caret goes after a plan commits; `"end"` = end of that step's text. */
export type CaretTarget = { path: StepPath; offset: number | "end" };

/**
 * A keystroke's outcome: the actions to commit (in order) and where the caret
 * goes — a target step, `"keep"` (leave it where it is; a background text
 * commit) or `"clear"` (nothing left to focus). A planner returning `null`
 * means BLOCKED — the keystroke is a no-op (no previous sibling to indent
 * under, a note that would gain children, an empty step that still owns a
 * subtree).
 */
export type OutlinePlan = { actions: OutlineAction[]; caret: CaretTarget | "keep" | "clear" };

/** The focused line's live editing state: its raw text (backticks visible) and caret offset within it. */
export type LineState = { text: string; caret: number };

/** Synthetic block for the pure action `apply` calls — actions only read `props`. */
function outlineBlock(props: Record<string, unknown>): DocBlock {
  return { id: "", type: "process-outline", props, children: [] };
}

/** The stored step forest behind a `process-outline` block's props (tolerant read, fresh objects). */
export function readStepsFromProps(props: Record<string, unknown>): ProcessOutlineStep[] {
  return readProcessOutlineStepTree(outlineBlock(props));
}

/** Derived render nodes (depth computed) behind a `process-outline` block's props. */
export function readNodesFromProps(props: Record<string, unknown>): ProcessOutlineNode[] {
  return readProcessOutlineSteps(outlineBlock(props));
}

/**
 * Runs a plan's actions against `props`, folding each action's shallow-merge
 * patch forward so a multi-action plan (flush text, then move; remove, then
 * re-insert) composes into ONE final props object — one `updateAttributes`,
 * one `updateBlock` op. Stops at the first refusal, mirroring `applyOps`.
 */
export function runOutlineActions(
  props: Record<string, unknown>,
  actions: readonly OutlineAction[],
): OutlineActionsResult {
  let current = props;
  for (const entry of actions) {
    const action = ACTION_REGISTRY.get(entry.action);
    if (!action) {
      return {
        ok: false,
        issues: [{ path: "$.op.action", message: `Unknown component action: "${entry.action}".` }],
      };
    }
    const issues = checkParams(action, entry.params);
    if (issues.length > 0) return { ok: false, issues };
    if (!("apply" in action)) {
      return {
        ok: false,
        issues: [
          {
            path: "$.op.action",
            message: `Action "${entry.action}" is handled by the ${action.forward.authority} authority.`,
          },
        ],
      };
    }
    const result = action.apply(outlineBlock(current), entry.params);
    if (!result.ok) return { ok: false, issues: result.issues };
    // Outline actions only ever patch `steps`, so a plain spread is the whole
    // shallow merge; sibling props (none today) ride through untouched.
    current = { ...current, ...result.props };
  }
  return { ok: true, props: current };
}

/* ---------------------------------------------------------------- paths -- */

export function pathKey(path: StepPath): string {
  return path.join(".");
}

export function samePath(a: StepPath | null | undefined, b: StepPath | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((index, i) => index === b[i]);
}

/** The step a full index path addresses, or undefined (an empty path names no step). */
export function stepAt(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
): ProcessOutlineStep | undefined {
  if (path.length === 0) return undefined;
  let list: readonly ProcessOutlineStep[] = steps;
  let current: ProcessOutlineStep | undefined;
  for (const index of path) {
    current = list[index];
    if (!current) return undefined;
    list = current.steps ?? [];
  }
  return current;
}

/** The sibling list a path PREFIX addresses (`[]` = the roots); read-only, never creates arrays. */
export function siblingsAt(
  steps: readonly ProcessOutlineStep[],
  prefix: StepPath,
): readonly ProcessOutlineStep[] | undefined {
  if (prefix.length === 0) return steps;
  const parent = stepAt(steps, prefix);
  return parent ? (parent.steps ?? []) : undefined;
}

/** Every step's path in document (pre-order) order — the order the rail reads top to bottom. */
export function documentOrderPaths(steps: readonly ProcessOutlineStep[]): StepPath[] {
  const paths: StepPath[] = [];
  const walk = (list: readonly ProcessOutlineStep[], prefix: number[]) => {
    list.forEach((step, index) => {
      const path = [...prefix, index];
      paths.push(path);
      if (step.steps) walk(step.steps, path);
    });
  };
  walk(steps, []);
  return paths;
}

/**
 * The step directly ABOVE `path` on screen (pre-order predecessor: the
 * previous sibling's deepest last descendant, else the parent). Its path is
 * stable across removing `path`, because a pre-order predecessor is either an
 * ancestor or sits in an earlier subtree — neither is reindexed.
 */
export function previousStepPath(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
): StepPath | undefined {
  const order = documentOrderPaths(steps);
  const index = order.findIndex((candidate) => samePath(candidate, path));
  return index > 0 ? order[index - 1] : undefined;
}

/* --------------------------------------------------------------- chips --- */

/** Rendered (chip) text of a raw step text: the backticks are the markup, so they drop out. */
export function plainText(raw: string): string {
  return raw.replace(/`/g, "");
}

/**
 * Rendered-text offset -> raw-text offset. Clicking a chipped line gives a
 * caret position in the RENDERED text; the line then swaps to raw text with
 * the backticks visible, and the caret has to land on the same character.
 */
export function plainOffsetToRawOffset(raw: string, plainOffset: number): number {
  let plain = 0;
  let index = 0;
  while (index < raw.length) {
    if (plain === plainOffset) {
      // Step over the markup backticks so the caret lands NEXT TO the
      // character that was clicked rather than outside the chip fence.
      while (index < raw.length && raw[index] === "`") index += 1;
      return index;
    }
    if (raw[index] !== "`") plain += 1;
    index += 1;
  }
  return raw.length;
}

/* -------------------------------------------------------------- planners -- */

/** The text notation `>` uses for a clarification note, as a line prefix. */
export const NOTE_MARKER = "> ";

/** The text notation `=>` uses for a step a real trace event corresponds to. */
export const TRACE_MARKER = "=> ";

/** Strips a typed line prefix, shifting the caret back with it. */
function markerTyped(line: LineState, marker: string): LineState | null {
  if (!line.text.startsWith(marker)) return null;
  return {
    text: line.text.slice(marker.length),
    caret: Math.max(0, line.caret - marker.length),
  };
}

/**
 * Detects the note prefix a step's text just grew. Returns the text WITHOUT
 * the marker (plus the shifted caret) — the marker is notation, never content.
 */
export function noteMarkerTyped(line: LineState): LineState | null {
  return markerTyped(line, NOTE_MARKER);
}

/** Same, for the `=> ` trace marker. Checked BEFORE `> `, which is its suffix. */
export function traceMarkerTyped(line: LineState): LineState | null {
  return markerTyped(line, TRACE_MARKER);
}

function setStepTextAction(path: StepPath, text: string): OutlineAction {
  return { action: "process-outline.setStepText", params: { path: [...path], text } };
}

/** Prepends a text flush when the line drifted from the committed text, so one commit carries both. */
function withTextFlush(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
  text: string,
  actions: OutlineAction[],
): OutlineAction[] {
  const step = stepAt(steps, path);
  if (!step || step.text === text) return actions;
  return [setStepTextAction(path, text), ...actions];
}

/** Typing: the debounced text commit. */
export function planSetText(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
  text: string,
): OutlinePlan | null {
  const step = stepAt(steps, path);
  if (!step || step.text === text) return null;
  return { actions: [setStepTextAction(path, text)], caret: "keep" };
}

/**
 * Enter: split the focused step at the caret and drop the tail into a fresh
 * SIBLING below (never a child — children stay with the original step, and the
 * new step lands after the whole subtree). A note splits into another note, so
 * Enter inside a note card keeps writing notes.
 */
export function planSplit(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
  line: LineState,
): OutlinePlan | null {
  const step = stepAt(steps, path);
  if (!step) return null;
  const caret = Math.max(0, Math.min(line.caret, line.text.length));
  const before = line.text.slice(0, caret);
  const after = line.text.slice(caret);
  const nextPath = [...path.slice(0, -1), path[path.length - 1] + 1];
  const insert: OutlineAction = {
    action: "process-outline.insertStep",
    params: {
      path: nextPath,
      text: after,
      ...(step.kind === "note" ? { kind: "note" } : {}),
    },
  };
  return {
    actions: withTextFlush(steps, path, before, [insert]),
    caret: { path: nextPath, offset: 0 },
  };
}

/**
 * Tab: become the LAST child of the previous sibling. Blocked with no previous
 * sibling (nothing to nest under) and blocked when that sibling is a note —
 * notes are leaves, and `moveStep` would refuse the same move for an agent.
 */
export function planIndent(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
  line: LineState,
): OutlinePlan | null {
  if (path.length === 0) return null;
  const index = path[path.length - 1];
  if (index === 0) return null;
  const prefix = path.slice(0, -1);
  const siblings = siblingsAt(steps, prefix);
  const previous = siblings?.[index - 1];
  if (!previous || previous.kind === "note") return null;
  // `to` is resolved AFTER the step is detached, and the previous sibling sits
  // before it, so its index and child count are both unchanged by the removal.
  const target = [...prefix, index - 1, previous.steps?.length ?? 0];
  return {
    actions: withTextFlush(steps, path, line.text, [
      { action: "process-outline.moveStep", params: { from: [...path], to: target } },
    ]),
    caret: { path: target, offset: line.caret },
  };
}

/**
 * Shift+Tab: become the next sibling of the parent. Blocked at depth 0.
 * Following siblings stay where they are (they do NOT re-parent under the
 * outdented step) — that keeps a note from ever acquiring children, and it is
 * the move `moveStep` already models.
 */
export function planOutdent(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
  line: LineState,
): OutlinePlan | null {
  if (path.length < 2) return null;
  const parentIndex = path[path.length - 2];
  const target = [...path.slice(0, -2), parentIndex + 1];
  return {
    actions: withTextFlush(steps, path, line.text, [
      { action: "process-outline.moveStep", params: { from: [...path], to: target } },
    ]),
    caret: { path: target, offset: line.caret },
  };
}

/**
 * Backspace at the start of an EMPTY step: delete it, caret to the step above.
 * Blocked when the step still owns children — `removeStep` takes the whole
 * subtree with it, and a backspace must never be that destructive.
 */
export function planRemoveEmpty(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
): OutlinePlan | null {
  const step = stepAt(steps, path);
  if (!step) return null;
  if (step.steps && step.steps.length > 0) return null;
  const previous = previousStepPath(steps, path);
  return {
    actions: [{ action: "process-outline.removeStep", params: { path: [...path] } }],
    caret: previous ? { path: previous, offset: "end" } : "clear",
  };
}

/**
 * Kind flip, both directions: `> ` typed at the start makes a note, Backspace
 * at the start of a note makes it a step again. There is no `setStepKind`
 * action (adding one would grow the agent tool surface), so this composes the
 * granular pair — remove the step, re-insert it at the same path with the new
 * kind, both inside one commit. Blocked when the step has children: a note is
 * a leaf, and re-inserting cannot carry a subtree anyway.
 */
export function planSetKind(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
  kind: "step" | "note",
  line: LineState,
): OutlinePlan | null {
  const step = stepAt(steps, path);
  if (!step) return null;
  if ((step.kind === "note" ? "note" : "step") === kind) return null;
  if (step.steps && step.steps.length > 0) return null;
  return {
    actions: [
      { action: "process-outline.removeStep", params: { path: [...path] } },
      {
        action: "process-outline.insertStep",
        params: { path: [...path], text: line.text, ...(kind === "note" ? { kind } : {}) },
      },
    ],
    caret: { path, offset: line.caret },
  };
}

/**
 * Trace flip, both directions: `=> ` typed at the start marks the step as one
 * a real trace event corresponds to, Backspace at the start of a marked step
 * clears it. Unlike the note flip this is NOT a remove/re-insert pair — the
 * step keeps its identity and its subtree, because a phase that owns substeps
 * is exactly the kind of step a trace event lands on. `setStepText` carries
 * the flag alongside the line it belongs to, so the whole flip is one action
 * and the agent tool surface stays at five.
 *
 * Blocked on notes: a note is prose about a step, not an event. The action
 * refuses it too, so a hand edit and an agent edit fail the same way.
 */
export function planSetTrace(
  steps: readonly ProcessOutlineStep[],
  path: StepPath,
  trace: boolean,
  line: LineState,
): OutlinePlan | null {
  const step = stepAt(steps, path);
  if (!step) return null;
  if (step.kind === "note") return null;
  if ((step.trace === true) === trace) return null;
  return {
    actions: [
      {
        action: "process-outline.setStepText",
        params: { path: [...path], text: line.text, trace },
      },
    ],
    caret: { path, offset: line.caret },
  };
}

/** Click on the empty-outline placeholder: seed the first root step. */
export function planFirstStep(): OutlinePlan {
  return {
    actions: [{ action: "process-outline.insertStep", params: { path: [0], text: "" } }],
    caret: { path: [0], offset: 0 },
  };
}
