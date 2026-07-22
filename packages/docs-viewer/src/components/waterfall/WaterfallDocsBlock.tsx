"use client";

import { useEffect, type ReactNode } from "react";
import type { WaterfallNode } from "@codecaine-ai/docs-model";

export const LABEL = "Waterfall";

export const AGENT_DESCRIPTION =
  "A process-flow waterfall rendered from a typed recursive step tree: { steps: { text; kind?: 'step' | 'note'; steps? }[] }. Steps nest for sublayers, `kind: \"note\"` leaves are clarification notes (bulleted cards off the rail), and backticks in text render as code chips. Use it for a high-level ‘this process flows this way’ diagram; a heading above carries any title, canvas covers relationships, and sequence covers exact exchanges.";

const STYLE_ID = "docs-waterfall-style";

/*
 * Rail geometry is var-driven so it survives any host typography. The
 * knobs are author-meaningful (style-rail tokens with prototype defaults
 * as fallback):
 *   --wf-indent     full horizontal indent per nesting level; children
 *                   pad by it and the elbow hangs its left edge at
 *                   exactly -1 * indent
 *   --wf-arrow-gap  extra space between the arrowhead tip and the first
 *                   letter — pure text offset (padding on the step line),
 *                   it never moves or resizes the drawn arrow
 *   --wf-gap        vertical gap between sibling rows
 *   --wf-line       first-line height of a step; the elbow's horizontal
 *                   run lands at exactly half this, and step rows pin
 *                   their line-height to it so geometry and text agree
 *   --wf-stroke     rail stroke width (token --docs-waterfall-stroke)
 *   --wf-arrow      arrowhead edge length (token --docs-waterfall-arrow-size)
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
const WATERFALL_CSS = `
  .docs-waterfall {
    --wf-line: var(--docs-waterfall-line-height, 22px);
    --wf-gap: var(--docs-waterfall-row-gap, 7px);
    --wf-indent: var(--docs-waterfall-indent, 36px);
    --wf-arrow-gap: var(--docs-waterfall-arrow-gap, 4px);
    --wf-stroke: var(--docs-waterfall-stroke, 1.5px);
    --wf-arrow: var(--docs-waterfall-arrow-size, 6px);
    min-width: 640px;
    color: var(--docs-waterfall-ink, var(--foreground));
    font-family: var(--docs-font-code, ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace);
    font-size: var(--docs-waterfall-text-size, 12.5px);
    line-height: var(--wf-line);
  }
  .docs-waterfall__flow > .docs-waterfall__node + .docs-waterfall__node {
    margin-top: 14px;
  }
  .docs-waterfall__line {
    position: relative;
    max-width: 700px;
    line-height: var(--wf-line);
  }
  .docs-waterfall__children {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--wf-gap);
    margin-left: 5px;
    padding-top: var(--wf-gap);
    padding-left: var(--wf-indent);
  }
  .docs-waterfall__children > .docs-waterfall__node {
    position: relative;
  }
  .docs-waterfall__children > .docs-waterfall__node::before {
    position: absolute;
    top: calc(-1 * var(--wf-gap) - 2px);
    left: calc(-1 * var(--wf-indent));
    width: calc(var(--wf-indent) - 2px);
    height: calc(var(--wf-gap) + 2px + var(--wf-line) / 2);
    border-bottom: var(--wf-stroke) solid var(--docs-waterfall-rail, #909498);
    border-left: var(--wf-stroke) solid var(--docs-waterfall-rail, #909498);
    border-bottom-left-radius: calc(var(--radius) * 0.75);
    content: "";
  }
  .docs-waterfall__children > .docs-waterfall__node:not(:last-child)::after {
    position: absolute;
    top: calc(-1 * var(--wf-gap) - 2px);
    bottom: calc(-1 * var(--wf-gap) - 2px);
    left: calc(-1 * var(--wf-indent));
    width: 0;
    border-left: var(--wf-stroke) solid var(--docs-waterfall-rail, #909498);
    content: "";
  }
  .docs-waterfall__children > .docs-waterfall__node > .docs-waterfall__line {
    padding-left: var(--wf-arrow-gap);
  }
  .docs-waterfall__children > .docs-waterfall__node > .docs-waterfall__line::before {
    position: absolute;
    top: calc(var(--wf-line) / 2 - var(--wf-arrow) / 2 - 0.75px);
    left: calc(-1.2 * var(--wf-arrow) - 1px);
    width: var(--wf-arrow);
    height: var(--wf-arrow);
    border-top: var(--wf-stroke) solid var(--docs-waterfall-rail, #909498);
    border-right: var(--wf-stroke) solid var(--docs-waterfall-rail, #909498);
    content: "";
    transform: rotate(45deg);
  }
  .docs-waterfall__flow > .docs-waterfall__node > .docs-waterfall__line {
    font-size: 13.5px;
    font-weight: 650;
  }
  .docs-waterfall__node--depth-one > .docs-waterfall__line {
    font-weight: 600;
  }
  .docs-waterfall__node--deep > .docs-waterfall__line {
    color: var(--docs-waterfall-deep-ink, color-mix(in srgb, var(--docs-waterfall-ink, var(--foreground)) 78%, transparent));
  }
  .docs-waterfall__keyword {
    font-weight: 650;
  }
  .docs-waterfall__code {
    border-radius: calc(var(--radius) * 0.45);
    background: var(--docs-waterfall-code-bg, var(--muted));
    padding: 0 4px;
  }
  .docs-waterfall__node--note {
    margin: 1px 0 2px;
  }
  .docs-waterfall__note-card {
    display: block;
    max-width: 580px;
    border: 1px solid var(--docs-waterfall-note-border, var(--border));
    border-radius: calc(var(--radius) * 0.8);
    background: var(--docs-waterfall-note-bg, transparent);
    padding: 5px 12px;
    color: var(--docs-waterfall-note-fg, var(--docs-waterfall-ink, var(--foreground)));
    font-size: var(--docs-waterfall-note-text-size, inherit);
    font-weight: 400;
  }
  .docs-waterfall__note-bullet {
    position: relative;
    padding-left: 14px;
  }
  .docs-waterfall__note-bullet::before {
    position: absolute;
    top: calc(var(--wf-line) / 2 - 1.5px);
    left: 2px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: currentColor;
    content: "";
    opacity: 0.7;
  }
  .docs-waterfall__children > .docs-waterfall__node--note::before,
  .docs-waterfall__children > .docs-waterfall__node--note > .docs-waterfall__line::before {
    display: none;
  }
  /* the trunk must not dangle toward a trailing note: hide the continuation
     on any node whose remaining siblings are all notes */
  .docs-waterfall__children
    > .docs-waterfall__node:not(
      :has(~ .docs-waterfall__node:not(.docs-waterfall__node--note))
    )::after {
    display: none;
  }
  .docs-waterfall__empty {
    color: var(--muted-foreground);
    font-size: 12px;
    line-height: var(--wf-line);
  }
`;

/**
 * Injects the waterfall stylesheet once per document (SSR-safe; same pattern
 * as editor/decorations/placeholder.ts). If the tag already exists with STALE
 * content — Vite HMR reloads this module with new CSS but leaves the old tag —
 * the content is replaced in place, so the styles always match this module.
 */
function injectWaterfallStyles(): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    if (existing.textContent !== WATERFALL_CSS) existing.textContent = WATERFALL_CSS;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = WATERFALL_CSS;
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
        className="docs-waterfall__keyword"
        data-waterfall-keyword={match[0]}
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
      <span key={index} className="docs-waterfall__code" data-waterfall-code="true">
        {segment}
      </span>
    ) : (
      <span key={index}>{renderPlainText(segment, index)}</span>
    ),
  );
}

/**
 * One card per note run: a bordered bullet card, deliberately off the rail.
 * Rendered as plain divs (custom dot pseudo, no list elements) so host
 * document styles targeting ul/li never override the card's typography.
 */
function renderNoteCard(group: WaterfallNode[], path: string): ReactNode {
  return (
    <div
      key={path}
      className="docs-waterfall__node docs-waterfall__node--note"
      data-waterfall-depth={group[0].depth}
      data-waterfall-note="true"
    >
      <div className="docs-waterfall__line">
        <div className="docs-waterfall__note-card">
          {group.map((note, index) => (
            <div
              key={index}
              className="docs-waterfall__note-bullet"
              data-waterfall-note-item="true"
            >
              {renderText(note.text)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Sibling list renderer: consecutive note siblings collapse into ONE bulleted card. */
function renderNodes(nodes: readonly WaterfallNode[], basePath: string): ReactNode[] {
  const rendered: ReactNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (!nodes[index].note) {
      rendered.push(renderNode(nodes[index], `${basePath}-${index}`));
      continue;
    }
    const start = index;
    const group: WaterfallNode[] = [];
    while (index < nodes.length && nodes[index].note) {
      group.push(nodes[index]);
      index += 1;
    }
    index -= 1;
    rendered.push(renderNoteCard(group, `${basePath}-${start}`));
  }
  return rendered;
}

function renderNode(node: WaterfallNode, path: string): ReactNode {
  const depthClass =
    node.depth === 1
      ? " docs-waterfall__node--depth-one"
      : node.depth >= 3
        ? " docs-waterfall__node--deep"
        : "";
  return (
    <div
      key={path}
      className={`docs-waterfall__node${depthClass}`}
      data-waterfall-depth={node.depth}
      data-waterfall-node="true"
    >
      <div className="docs-waterfall__line">{renderText(node.text)}</div>
      {node.children.length > 0 && (
        <div className="docs-waterfall__children">{renderNodes(node.children, path)}</div>
      )}
    </div>
  );
}

export function WaterfallDocsBlock({
  id,
  steps,
}: {
  id: string;
  /** Derived step nodes from readWaterfallSteps — the viewer never parses. */
  steps: WaterfallNode[];
}) {
  useEffect(() => {
    injectWaterfallStyles();
  }, []);

  return (
    <section
      className="not-prose my-4 overflow-x-auto"
      data-docs-block-type="waterfall"
      data-source-id={id}
    >
      <div className="docs-waterfall font-mono">
        {steps.length > 0 ? (
          <div className="docs-waterfall__flow" data-waterfall-flow="true">
            {renderNodes(steps, "root")}
          </div>
        ) : (
          <div className="docs-waterfall__empty" data-waterfall-empty="true">
            empty waterfall — no steps yet
          </div>
        )}
      </div>
    </section>
  );
}
