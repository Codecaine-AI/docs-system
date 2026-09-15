"use client";

import { useEffect, type ReactNode } from "react";
import type { ProcessOutlineNode } from "@codecaine-ai/docs-model";

export const LABEL = "Process Outline";

export const AGENT_DESCRIPTION =
  "An ordered process outline rendered from a typed recursive step tree: { steps: { text; kind?: 'step' | 'note'; steps? }[] }. Children are ordered substeps, `kind: \"note\"` leaves are clarification notes (plain bullet lines off the rail), and backticks in text render as code chips. Use it to explain how a process decomposes from phases into substeps; a heading above carries any title, canvas covers spatial relationships, and sequence covers exact exchanges.";

const STYLE_ID = "docs-process-outline-style";

/*
 * Rail geometry is var-driven so it survives any host typography. The
 * knobs are author-meaningful (style-rail tokens with prototype defaults
 * as fallback):
 *   --po-indent     full horizontal indent per nesting level; children
 *                   pad by it and the elbow hangs its left edge at
 *                   exactly -1 * indent
 *   --po-arrow-gap  extra space between the arrowhead tip and the first
 *                   letter — pure text offset (padding on the step line),
 *                   it never moves or resizes the drawn arrow
 *   --po-gap        vertical gap between sibling rows, RE-DECLARED at every
 *                   nesting level so a per-level gap (depth-1 phases use the
 *                   wider branch gap) never leaks down into its own substeps
 *                   and the elbow math always matches the gap it sits in
 *   --po-line       first-line height of a step; the elbow's horizontal
 *                   run lands at exactly half this, and step rows pin
 *                   their line-height to it so geometry and text agree
 *   --po-stroke     rail stroke width (token --docs-process-outline-stroke)
 *   --po-arrow      arrowhead edge length (token --docs-process-outline-arrow-size)
 *   --po-c          the CURRENT LEVEL'S colour. It re-declares once per
 *                   __children nesting level through a five-hue cycle, so a
 *                   node's incoming elbow, its arrowhead, the chips on its
 *                   line and any note card it owns all resolve to the same
 *                   hue with zero per-node classes and no renderer knowledge
 *                   of depth. Mixes against it happen at the USE SITE: a
 *                   var() inside a custom property resolves where that
 *                   property is computed (:root), where --po-c does not
 *                   exist, so only the mix STRENGTH can travel as a token
 *                   (unitless percent numbers, multiplied by 1% here).
 * The arrow is one drawn unit anchored to the elbow: the shaft spans
 * indent - 2px, running through the arrowhead's open middle to 1px shy
 * of its tip; the head sits at -1.2 * arrow - 1px so its rotated tip
 * lands ~1px before the text column. Shaft and head cannot detach at
 * any knob values because both are anchored to the same edges.
 * The elbow drops from inside the gap above and the trunk overlaps into
 * BOTH gaps, so adjacent segments always meet regardless of row spacing.
 * The rail color fallback must stay opaque: overlapping elbow/trunk
 * strokes at the same x stack alpha into darker segments, which makes
 * single-stroke stretches read as broken.
 */
const PROCESS_OUTLINE_CSS = `
  .docs-process-outline {
    --po-line: var(--docs-process-outline-line-height, 22px);
    --po-note-line: var(--docs-process-outline-note-line-height, 17px);
    --po-gap: var(--docs-process-outline-row-gap, 12px);
    --po-branch-gap: var(--docs-process-outline-branch-gap, 20px);
    --po-root-gap: var(--docs-process-outline-root-gap, 30px);
    --po-indent: var(--docs-process-outline-indent, 46px);
    --po-arrow-gap: var(--docs-process-outline-arrow-gap, 4px);
    --po-stroke: var(--docs-process-outline-stroke, 1.5px);
    --po-arrow: var(--docs-process-outline-arrow-size, 6px);
    --po-focus-ring: var(--docs-process-outline-focus-ring, 0px);
    --po-c: var(--docs-process-outline-cycle-1, var(--docs-process-outline-rail, #909498));
    /* Fill the lane, but keep a floor so the rail geometry (fixed-px indents
       and elbows) never squeezes into an unreadable column. The floor is
       min()-capped at the container width so a narrow viewport wraps text
       instead of forcing the section's horizontal scrollbar. */
    width: 100%;
    min-width: min(560px, 100%);
    color: var(--docs-process-outline-ink, var(--foreground));
    font-family: var(--docs-font-code, ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace);
    font-size: var(--docs-process-outline-text-size, 12.5px);
    line-height: var(--po-line);
  }
  /* The five-hue depth cycle. Level 1 (the first __children) takes cycle-2, so
     a root step's own colour (cycle-1) and its first branch never collide;
     after cycle-5 the cycle repeats. Each level carries the opaque rail as its
     own fallback, so a theme that drops one cycle slot degrades to the flat
     rail instead of to an invalid colour. */
  .docs-process-outline__children {
    --po-c: var(--docs-process-outline-cycle-2, var(--docs-process-outline-rail, #909498));
  }
  .docs-process-outline__children .docs-process-outline__children {
    --po-c: var(--docs-process-outline-cycle-3, var(--docs-process-outline-rail, #909498));
  }
  .docs-process-outline__children .docs-process-outline__children .docs-process-outline__children {
    --po-c: var(--docs-process-outline-cycle-4, var(--docs-process-outline-rail, #909498));
  }
  .docs-process-outline__children .docs-process-outline__children .docs-process-outline__children .docs-process-outline__children {
    --po-c: var(--docs-process-outline-cycle-5, var(--docs-process-outline-rail, #909498));
  }
  .docs-process-outline__children .docs-process-outline__children .docs-process-outline__children .docs-process-outline__children .docs-process-outline__children {
    --po-c: var(--docs-process-outline-cycle-1, var(--docs-process-outline-rail, #909498));
  }
  .docs-process-outline__flow > .docs-process-outline__node + .docs-process-outline__node {
    margin-top: var(--po-root-gap);
  }
  .docs-process-outline__line {
    position: relative;
    /* Step text keeps a reading measure that scales with the font instead of
       a fixed px column; it grows with the wide lane but never runs edge to
       edge on a 1600px page. */
    max-width: min(100ch, 100%);
    line-height: var(--po-line);
  }
  .docs-process-outline__children {
    position: relative;
    display: flex;
    flex-direction: column;
    /* Re-declared here, not inherited: the depth-1 rule below widens the gap
       for phase groups, and this reset stops that widening from cascading
       into their substeps. Elbow and trunk read the same --po-gap, so the
       geometry tracks whichever value applies at this level. */
    --po-gap: var(--docs-process-outline-row-gap, 12px);
    gap: var(--po-gap);
    margin-left: 5px;
    padding-top: var(--po-gap);
    padding-left: var(--po-indent);
  }
  /* Depth-1 groups — the phases hanging directly off a root step — breathe
     more than the substeps inside them. */
  .docs-process-outline__flow > .docs-process-outline__node > .docs-process-outline__children {
    --po-gap: var(--po-branch-gap);
  }
  .docs-process-outline__children > .docs-process-outline__node {
    position: relative;
  }
  .docs-process-outline__children > .docs-process-outline__node::before {
    position: absolute;
    top: calc(-1 * var(--po-gap) - 2px);
    left: calc(-1 * var(--po-indent));
    width: calc(var(--po-indent) - 2px);
    height: calc(var(--po-gap) + 2px + var(--po-line) / 2);
    border-bottom: var(--po-stroke) solid var(--po-c);
    border-left: var(--po-stroke) solid var(--po-c);
    border-bottom-left-radius: calc(var(--radius) * 0.75);
    content: "";
  }
  .docs-process-outline__children > .docs-process-outline__node:not(:last-child)::after {
    position: absolute;
    top: calc(-1 * var(--po-gap) - 2px);
    bottom: calc(-1 * var(--po-gap) - 2px);
    left: calc(-1 * var(--po-indent));
    width: 0;
    border-left: var(--po-stroke) solid var(--po-c);
    content: "";
  }
  .docs-process-outline__children > .docs-process-outline__node > .docs-process-outline__line {
    padding-left: var(--po-arrow-gap);
  }
  .docs-process-outline__children > .docs-process-outline__node > .docs-process-outline__line::before {
    position: absolute;
    top: calc(var(--po-line) / 2 - var(--po-arrow) / 2 - 0.75px);
    left: calc(-1.2 * var(--po-arrow) - 1px);
    width: var(--po-arrow);
    height: var(--po-arrow);
    border-top: var(--po-stroke) solid var(--po-c);
    border-right: var(--po-stroke) solid var(--po-c);
    content: "";
    transform: rotate(45deg);
  }
  /* ONE weight step, and only one: the top layer is bold and every sub-level
     reads at the same regular weight. Depth is already carried by the rail,
     the indent and the depth colour, so a weight ramp on top of that just
     makes the middle of a deep outline look like a second set of headings.
     The three knobs stay separate so a theme can put the ramp back — the
     classic theme does exactly that. */
  .docs-process-outline__node > .docs-process-outline__line {
    font-weight: var(--docs-process-outline-step-weight, 400);
  }
  .docs-process-outline__flow > .docs-process-outline__node > .docs-process-outline__line {
    font-size: var(--docs-process-outline-root-text-size, 13.5px);
    font-weight: var(--docs-process-outline-root-weight, 650);
  }
  .docs-process-outline__node--depth-one > .docs-process-outline__line {
    font-weight: var(--docs-process-outline-branch-weight, 400);
  }
  .docs-process-outline__node--deep > .docs-process-outline__line {
    color: var(--docs-process-outline-deep-ink, color-mix(in srgb, var(--docs-process-outline-ink, var(--foreground)) 78%, transparent));
  }
  /* TRACE MARK — the step corresponds to a real trace event. It is a MINI PILL
     reading "trace", set at the END of the step's text, because the mark has to
     say what it means: the previous treatment (a thickened arrowhead plus a dot
     in the gutter) was two silent glyphs that nobody could decode, and one of
     them could not even exist on a root line.

     The pill is built on the SAME formula family as the backtick chips — fill
     is the line's depth colour at a low tint strength over an otherwise
     transparent base, label is the depth colour mixed into the inherited ink —
     so a marked step reads as kin to its own chips rather than as a badge from
     another system. A theme that wants a flat pill sets trace-bg to an opaque
     colour and drops both strengths to 0 (the classic theme does exactly that);
     a theme that never shows trace docs can drop the size to 0 as well. */
  .docs-process-outline__trace {
    display: inline-block;
    /* Enough of a gutter that the pill never crowds the last word, and it is
       margin (not padding) so it collapses out of the text's own measure. */
    margin-left: 6px;
    border-radius: calc(var(--radius) * 0.4);
    background: color-mix(
      in srgb,
      var(--po-c) calc(var(--docs-process-outline-trace-tint, 16) * 1%),
      var(--docs-process-outline-trace-bg, transparent)
    );
    padding: 0 4px;
    vertical-align: 0.08em;
    color: color-mix(
      in srgb,
      var(--po-c) calc(var(--docs-process-outline-trace-ink-mix, 70) * 1%),
      currentColor
    );
    font-weight: 500;
    font-size: var(--docs-process-outline-trace-text-size, 9.5px);
    /* Its OWN line-height, because an inline-block takes the line box it is
       given: inheriting the step's 22px rhythm would paint a 22px slab behind
       nine-pixel text. 1.6 hugs the label into a pill roughly two-thirds the
       height of the line it sits on. */
    line-height: 1.6;
    /* Lowercase with a hair of tracking: at 9.5px in a monospace face, caps
       read as a shout next to the step text and lowercase does not. */
    text-transform: lowercase;
    letter-spacing: 0.04em;
  }
  /* FOCUSED-LINE AFFORDANCE while hand-editing. The block-wide selection wash
     is suppressed for this block (docs-workbench index.css), so what is left is
     the caret — and, if a theme asks for it, a hairline ring around the focused
     line in that line's own depth colour. Zero width by default: the caret is
     the affordance, and a ring on every click is noise. */
  .docs-process-outline [data-process-outline-step-editing="true"] {
    border-radius: calc(var(--radius) * 0.4);
    box-shadow: 0 0 0 var(--po-focus-ring)
      color-mix(in srgb, var(--po-c) 45%, transparent);
  }
  /* LINE-RANGE selection — dragging across steps the way you drag across
     bullets. Deliberately PER LINE: the block-wide wash is what a selected
     BLOCK looks like, and a run of selected steps is not that. Each line takes
     the tint in its OWN depth colour (same chip/trace formula family), so the
     highlight reads as part of the rail rather than as a system selection
     colour dropped on top. The pad is a same-colour shadow spread, so the
     highlight breathes past the glyphs without moving anything. */
  .docs-process-outline [data-process-outline-step-selected="true"] {
    border-radius: calc(var(--radius) * 0.4);
    background: color-mix(
      in srgb,
      var(--po-c) calc(var(--docs-process-outline-select-tint, 22) * 1%),
      var(--docs-process-outline-select-bg, transparent)
    );
    box-shadow: 0 0 0 var(--docs-process-outline-select-pad, 2px)
      color-mix(
        in srgb,
        var(--po-c) calc(var(--docs-process-outline-select-tint, 22) * 1%),
        var(--docs-process-outline-select-bg, transparent)
      );
  }
  /* Loop control is bold AND accented, deliberately OUTSIDE the depth cycle:
     "Repeat / While / For each ... until" has to read as one recurring mark
     no matter which level it lands on, so it must not take the level's hue. */
  .docs-process-outline__keyword {
    color: var(--docs-process-outline-keyword-fg, inherit);
    font-weight: 650;
  }
  /* Backticks are the block's ONLY inline syntax, and they render as a chip
     tinted in the line's own level colour: fill is the depth colour at
     chip-tint strength over the (transparent by default) chip background,
     label is the depth colour mixed into the inherited ink. A theme that
     wants the old flat chip sets code-bg to an opaque colour and drops both
     strengths to 0 — the mixes then resolve to exactly code-bg and the
     inherited colour. */
  .docs-process-outline__code {
    border-radius: calc(var(--radius) * 0.45);
    background: color-mix(
      in srgb,
      var(--po-c) calc(var(--docs-process-outline-chip-tint, 13) * 1%),
      var(--docs-process-outline-code-bg, transparent)
    );
    padding: 0 4px;
    color: color-mix(
      in srgb,
      var(--po-c) calc(var(--docs-process-outline-chip-ink-mix, 60) * 1%),
      currentColor
    );
  }
  .docs-process-outline__node--note {
    margin: 1px 0 2px;
  }
  /* NOTES — plain bullet lines, NOT a card. The box (border, left rule, fill,
     padding) is expressed entirely in tokens that default to zero, so the
     default theme renders bare bullets under the parent step and a theme that
     wants the old bordered card back — the classic theme does — restores it by
     setting those same tokens. Same element either way: no DOM fork, and the
     run grows by however many bullets it holds because nothing here sets a
     height or clips. Subordination is carried by size and ink alone. */
  .docs-process-outline__note-card {
    /* The run sets its OWN line rhythm: smaller note text on the step line
       height reads as loose, and the bullet dot centres on this value too. */
    --po-line: var(--po-note-line);
    display: block;
    /* Notes stay narrower than the step lines they hang off, but still scale
       with the lane rather than sitting at a fixed 580px. */
    max-width: min(85ch, 100%);
    /* Pulled in under its parent step, so the run reads as subordinate to
       the line above it rather than as another sibling on the rail. */
    margin-left: var(--docs-process-outline-note-inset, 10px);
    border: var(--docs-process-outline-note-border-width, 0px) solid
      var(--docs-process-outline-note-border, var(--border));
    /* Only the left rule takes the level's colour — the fill stays a flat
       muted wash, so a page of notes does not turn into a colour chart. */
    border-left: var(--docs-process-outline-note-rule-width, 0px) solid
      color-mix(
        in srgb,
        var(--po-c) calc(var(--docs-process-outline-note-accent, 55) * 1%),
        var(--docs-process-outline-note-border, var(--border))
      );
    border-radius: calc(var(--radius) * 0.8);
    background: var(--docs-process-outline-note-bg, transparent);
    padding: var(--docs-process-outline-note-pad-y, 0px)
      var(--docs-process-outline-note-pad-x, 0px);
    color: var(--docs-process-outline-note-fg, var(--docs-process-outline-ink, var(--foreground)));
    font-size: var(--docs-process-outline-note-text-size, inherit);
    font-weight: 400;
    line-height: var(--po-line);
  }
  .docs-process-outline__note-bullet {
    position: relative;
    padding-left: 14px;
  }
  .docs-process-outline__note-bullet + .docs-process-outline__note-bullet {
    margin-top: 4px;
  }
  .docs-process-outline__note-bullet::before {
    position: absolute;
    top: calc(var(--po-line) / 2 - 1.5px);
    left: 2px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: color-mix(
      in srgb,
      var(--po-c) calc(var(--docs-process-outline-note-accent, 55) * 1%),
      currentColor
    );
    content: "";
    opacity: 0.7;
  }
  .docs-process-outline__children > .docs-process-outline__node--note::before,
  .docs-process-outline__children > .docs-process-outline__node--note > .docs-process-outline__line::before {
    display: none;
  }
  /* the trunk must not dangle toward a trailing note: hide the continuation
     on any node whose remaining siblings are all notes */
  .docs-process-outline__children
    > .docs-process-outline__node:not(
      :has(~ .docs-process-outline__node:not(.docs-process-outline__node--note))
    )::after {
    display: none;
  }
  .docs-process-outline__empty {
    color: var(--muted-foreground);
    font-size: var(--docs-process-outline-empty-text-size, 12px);
    line-height: var(--po-line);
  }
`;

/**
 * Injects the Process Outline stylesheet once per document (SSR-safe; same pattern
 * as editor/decorations/placeholder.ts). If the tag already exists with STALE
 * content — Vite HMR reloads this module with new CSS but leaves the old tag —
 * the content is replaced in place, so the styles always match this module.
 */
function injectProcessOutlineStyles(): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    if (existing.textContent !== PROCESS_OUTLINE_CSS) existing.textContent = PROCESS_OUTLINE_CSS;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PROCESS_OUTLINE_CSS;
  document.head.appendChild(style);
}

const KEYWORD_PATTERN = /^(Repeat|While|For each)\b|\b(until)\b/g;

function renderPlainText(text: string, segmentIndex: number): ReactNode[] {
  const rendered: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(KEYWORD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) rendered.push(text.slice(cursor, index));
    rendered.push(
      <strong
        key={`${segmentIndex}-${index}`}
        className="docs-process-outline__keyword"
        data-process-outline-keyword={match[0]}
      >
        {match[0]}
      </strong>,
    );
    cursor = index + match[0].length;
  }
  if (cursor < text.length) rendered.push(text.slice(cursor));
  return rendered;
}

function renderText(text: string): ReactNode[] {
  return text.split("`").map((segment, index) =>
    index % 2 === 1 ? (
      <span key={index} className="docs-process-outline__code" data-process-outline-code="true">
        {segment}
      </span>
    ) : (
      <span key={index}>{renderPlainText(segment, index)}</span>
    ),
  );
}

/**
 * The block's inline rendering (backtick chips + loop keywords), exported so
 * the editor node view can render UNFOCUSED step lines exactly the way the
 * read surface does — chips stay chips while you edit the line next door.
 */
export const renderProcessOutlineText = renderText;

/**
 * Edit-mode injection points. When absent — the read surface, and the editor
 * in read-only mode — every branch below falls through to the original
 * rendering, so read-mode DOM is unchanged down to the attribute.
 *
 * `renderLine` replaces the CONTENT of a step's `__line` (or of a note's
 * `__note-bullet`) with the editor's own island for that step, receiving the
 * step's index path so the island can address it in a component action.
 * `renderEmpty` replaces the whole empty-state placeholder.
 */
export type ProcessOutlineEditHooks = {
  renderLine: (node: ProcessOutlineNode, path: readonly number[]) => ReactNode;
  renderEmpty?: () => ReactNode;
};

/** Step text for one node: the editor's island in edit mode, chips otherwise. */
function lineContent(
  node: ProcessOutlineNode,
  path: readonly number[],
  edit: ProcessOutlineEditHooks | undefined,
): ReactNode {
  return edit ? edit.renderLine(node, path) : renderText(node.text);
}

/**
 * One group per note run: plain bullet lines, deliberately off the rail.
 * Rendered as plain divs (custom dot pseudo, no list elements) so host
 * document styles targeting ul/li never override the notes' typography.
 * The wrapper carries no box of its own by default — the border, rule, fill
 * and padding are tokens that default to zero, which is what a theme sets to
 * put the old bordered card back.
 */
function renderNoteCard(
  group: ProcessOutlineNode[],
  path: string,
  start: number,
  indexPath: readonly number[],
  edit: ProcessOutlineEditHooks | undefined,
): ReactNode {
  return (
    <div
      key={path}
      className="docs-process-outline__node docs-process-outline__node--note"
      data-process-outline-depth={group[0].depth}
      data-process-outline-note="true"
    >
      <div className="docs-process-outline__line">
        <div className="docs-process-outline__note-card">
          {group.map((note, index) => (
            <div
              key={index}
              className="docs-process-outline__note-bullet"
              data-process-outline-note-item="true"
            >
              {lineContent(note, [...indexPath, start + index], edit)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Sibling list renderer: consecutive note siblings collapse into ONE bulleted card. */
function renderNodes(
  nodes: readonly ProcessOutlineNode[],
  basePath: string,
  indexPath: readonly number[],
  edit: ProcessOutlineEditHooks | undefined,
): ReactNode[] {
  const rendered: ReactNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (!nodes[index].note) {
      rendered.push(
        renderNode(nodes[index], `${basePath}-${index}`, [...indexPath, index], edit),
      );
      continue;
    }
    const start = index;
    const group: ProcessOutlineNode[] = [];
    while (index < nodes.length && nodes[index].note) {
      group.push(nodes[index]);
      index += 1;
    }
    index -= 1;
    rendered.push(renderNoteCard(group, `${basePath}-${start}`, start, indexPath, edit));
  }
  return rendered;
}

function renderNode(
  node: ProcessOutlineNode,
  path: string,
  indexPath: readonly number[],
  edit: ProcessOutlineEditHooks | undefined,
): ReactNode {
  const depthClass =
    node.depth === 1
      ? " docs-process-outline__node--depth-one"
      : node.depth >= 3
        ? " docs-process-outline__node--deep"
        : "";
  return (
    <div
      key={path}
      className={`docs-process-outline__node${depthClass}`}
      data-process-outline-depth={node.depth}
      data-process-outline-node="true"
      {...(node.trace ? { "data-process-outline-trace": "true" } : {})}
    >
      <div className="docs-process-outline__line">
        {lineContent(node, indexPath, edit)}
        {/* The trace mark rides at the END of the text, OUTSIDE the editable
            island, so hand-editing a marked line never puts the pill under the
            caret — the mark stays an attribute on the node, edited with `=>`. */}
        {node.trace ? (
          <span className="docs-process-outline__trace" data-process-outline-trace-pill="true">
            trace
          </span>
        ) : null}
      </div>
      {node.children.length > 0 && (
        <div className="docs-process-outline__children">
          {renderNodes(node.children, path, indexPath, edit)}
        </div>
      )}
    </div>
  );
}

export function ProcessOutlineDocsBlock({
  id,
  steps,
  edit,
}: {
  id: string;
  /** Derived step nodes from readProcessOutlineSteps — the viewer never parses. */
  steps: ProcessOutlineNode[];
  /**
   * Editor-only injection points (see ProcessOutlineEditHooks). Omitted on the
   * read surface, where the tree renders exactly as it always has.
   */
  edit?: ProcessOutlineEditHooks;
}) {
  useEffect(() => {
    injectProcessOutlineStyles();
  }, []);

  return (
    <section
      className="not-prose my-4 w-full overflow-x-auto"
      data-docs-block-type="process-outline"
      data-source-id={id}
    >
      <div className="docs-process-outline font-mono">
        {steps.length > 0 ? (
          <div className="docs-process-outline__flow" data-process-outline-flow="true">
            {renderNodes(steps, "root", [], edit)}
          </div>
        ) : (
          (edit?.renderEmpty?.() ?? (
            <div className="docs-process-outline__empty" data-process-outline-empty="true">
              empty process outline — no steps yet
            </div>
          ))
        )}
      </div>
    </section>
  );
}
