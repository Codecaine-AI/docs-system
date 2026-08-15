"use client";

import { useEffect, type ReactNode } from "react";
import type { ProcessOutlineNode } from "@codecaine-ai/docs-model";

export const LABEL = "Process Outline";

export const AGENT_DESCRIPTION =
  "An ordered process outline rendered from a typed recursive step tree: { steps: { text; kind?: 'step' | 'note'; steps? }[] }. Children are ordered substeps, `kind: \"note\"` leaves are clarification notes (bulleted cards off the rail), and backticks in text render as code chips. Use it to explain how a process decomposes from phases into substeps; a heading above carries any title, canvas covers spatial relationships, and sequence covers exact exchanges.";

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
 *   --po-gap        vertical gap between sibling rows
 *   --po-line       first-line height of a step; the elbow's horizontal
 *                   run lands at exactly half this, and step rows pin
 *                   their line-height to it so geometry and text agree
 *   --po-stroke     rail stroke width (token --docs-process-outline-stroke)
 *   --po-arrow      arrowhead edge length (token --docs-process-outline-arrow-size)
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
    --po-gap: var(--docs-process-outline-row-gap, 7px);
    --po-indent: var(--docs-process-outline-indent, 36px);
    --po-arrow-gap: var(--docs-process-outline-arrow-gap, 4px);
    --po-stroke: var(--docs-process-outline-stroke, 1.5px);
    --po-arrow: var(--docs-process-outline-arrow-size, 6px);
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
  .docs-process-outline__flow > .docs-process-outline__node + .docs-process-outline__node {
    margin-top: 14px;
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
    gap: var(--po-gap);
    margin-left: 5px;
    padding-top: var(--po-gap);
    padding-left: var(--po-indent);
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
    border-bottom: var(--po-stroke) solid var(--docs-process-outline-rail, #909498);
    border-left: var(--po-stroke) solid var(--docs-process-outline-rail, #909498);
    border-bottom-left-radius: calc(var(--radius) * 0.75);
    content: "";
  }
  .docs-process-outline__children > .docs-process-outline__node:not(:last-child)::after {
    position: absolute;
    top: calc(-1 * var(--po-gap) - 2px);
    bottom: calc(-1 * var(--po-gap) - 2px);
    left: calc(-1 * var(--po-indent));
    width: 0;
    border-left: var(--po-stroke) solid var(--docs-process-outline-rail, #909498);
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
    border-top: var(--po-stroke) solid var(--docs-process-outline-rail, #909498);
    border-right: var(--po-stroke) solid var(--docs-process-outline-rail, #909498);
    content: "";
    transform: rotate(45deg);
  }
  .docs-process-outline__flow > .docs-process-outline__node > .docs-process-outline__line {
    font-size: 13.5px;
    font-weight: 650;
  }
  .docs-process-outline__node--depth-one > .docs-process-outline__line {
    font-weight: 600;
  }
  .docs-process-outline__node--deep > .docs-process-outline__line {
    color: var(--docs-process-outline-deep-ink, color-mix(in srgb, var(--docs-process-outline-ink, var(--foreground)) 78%, transparent));
  }
  .docs-process-outline__keyword {
    font-weight: 650;
  }
  .docs-process-outline__code {
    border-radius: calc(var(--radius) * 0.45);
    background: var(--docs-process-outline-code-bg, var(--muted));
    padding: 0 4px;
  }
  .docs-process-outline__node--note {
    margin: 1px 0 2px;
  }
  .docs-process-outline__note-card {
    display: block;
    /* Notes stay narrower than the step lines they hang off, but still scale
       with the lane rather than sitting at a fixed 580px. */
    max-width: min(85ch, 100%);
    border: 1px solid var(--docs-process-outline-note-border, var(--border));
    border-radius: calc(var(--radius) * 0.8);
    background: var(--docs-process-outline-note-bg, transparent);
    padding: 5px 12px;
    color: var(--docs-process-outline-note-fg, var(--docs-process-outline-ink, var(--foreground)));
    font-size: var(--docs-process-outline-note-text-size, inherit);
    font-weight: 400;
  }
  .docs-process-outline__note-bullet {
    position: relative;
    padding-left: 14px;
  }
  .docs-process-outline__note-bullet::before {
    position: absolute;
    top: calc(var(--po-line) / 2 - 1.5px);
    left: 2px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: currentColor;
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
    font-size: 12px;
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
 * One card per note run: a bordered bullet card, deliberately off the rail.
 * Rendered as plain divs (custom dot pseudo, no list elements) so host
 * document styles targeting ul/li never override the card's typography.
 */
function renderNoteCard(group: ProcessOutlineNode[], path: string): ReactNode {
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
              {renderText(note.text)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Sibling list renderer: consecutive note siblings collapse into ONE bulleted card. */
function renderNodes(nodes: readonly ProcessOutlineNode[], basePath: string): ReactNode[] {
  const rendered: ReactNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (!nodes[index].note) {
      rendered.push(renderNode(nodes[index], `${basePath}-${index}`));
      continue;
    }
    const start = index;
    const group: ProcessOutlineNode[] = [];
    while (index < nodes.length && nodes[index].note) {
      group.push(nodes[index]);
      index += 1;
    }
    index -= 1;
    rendered.push(renderNoteCard(group, `${basePath}-${start}`));
  }
  return rendered;
}

function renderNode(node: ProcessOutlineNode, path: string): ReactNode {
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
    >
      <div className="docs-process-outline__line">{renderText(node.text)}</div>
      {node.children.length > 0 && (
        <div className="docs-process-outline__children">{renderNodes(node.children, path)}</div>
      )}
    </div>
  );
}

export function ProcessOutlineDocsBlock({
  id,
  steps,
}: {
  id: string;
  /** Derived step nodes from readProcessOutlineSteps — the viewer never parses. */
  steps: ProcessOutlineNode[];
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
            {renderNodes(steps, "root")}
          </div>
        ) : (
          <div className="docs-process-outline__empty" data-process-outline-empty="true">
            empty process outline — no steps yet
          </div>
        )}
      </div>
    </section>
  );
}
