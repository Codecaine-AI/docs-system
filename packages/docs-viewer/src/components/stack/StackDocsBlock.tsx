"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { StackBoundary, StackNode } from "@codecaine-ai/docs-model";
import { monoBreaks } from "../mono-breaks";
import { chipKind } from "../typed-chip";

export const STACK_LABEL = "Stack";
export const STACK_AGENT_DESCRIPTION =
  "A boundary stack: nested layers drawn top to bottom. A node with children is a tinted container with its name pinned in a header chip; a leaf is a card with its name and its detail as plain text, and an optional badge shows as the card's role: a colored left edge plus a small code-font word beside the name, in its own case. A uses arrow points from a node to its next sibling, and a dashed line beneath a node states, in words, the rule enforced at that boundary. Auto-laid out; no coordinates.";

/**
 * Canvas schematic look (canvas theme/canvas-style.ts SCHEMATIC_LIGHT/DARK,
 * theme/palette.ts layerCakeSectionPaint): a container is a canvas section —
 * a layer-cake tint (the hue mixed into the card fill at 7%, +3.5% per nesting
 * level, max 16%; dark 10%/+5%/22% over the page), a frame of the hue at 50%,
 * and a header chip pinned flush into the top-left corner (chip = hue mixed
 * 16%/20% into the fill, mono uppercase tracked title; a container's detail
 * is the header's hover title, not drawn). Leaves are canvas cards: card
 * fill, a hairline in the hue at 55%, semibold name, detail in body text
 * (mono when a path, one segment per line), never a dotted list. The stack
 * draws the shape: a node's role is a 3px left edge in its colour plus a
 * muted mono word at the name row's right end, in the case it was written
 * (and the hover title). A prose name or detail segment sets in the sans
 * face, and a backtick span inside prose (`startMcp`, `doc.json`) in the mono. A boundary is a dashed line across the stack with the rule as text
 * beneath it, never colour alone; next to a crossing arrow the line and the
 * text start just right of it, so the two never overlap.
 *
 * Every value reads a --docs-stack-* token, then the role token, then the
 * light literal, so the block renders the light theme without the workbench
 * stylesheet. Node colours map onto the category roster (blue 1, green 3,
 * yellow and orange 4, purple 5, pink and red 6), keeping red for danger.
 */
const STACK_STYLE = `
[data-stack]{--stack-ink:var(--docs-stack-ink,var(--docs-ink,#1f1f1f));--stack-muted:var(--docs-stack-muted,var(--docs-muted,#666562));--stack-text:var(--docs-stack-detail,var(--docs-text,#2a2a2a));--stack-page:var(--docs-page,#fdfdfd);--stack-card:var(--docs-stack-card-bg,var(--docs-page,#fdfdfd));--stack-base:var(--stack-page);--stack-t1:7%;--stack-t2:10.5%;--stack-t3:14%;--stack-chip-mix:16%;--stack-arrow:var(--docs-stack-arrow,var(--docs-muted,#666562));--stack-boundary:var(--docs-stack-boundary,var(--docs-muted,#666562));--stack-gap:var(--docs-stack-gap,12px);--stack-radius:var(--docs-stack-radius,var(--radius,2px));--stack-arrow-x:var(--ds-space-5);--stack-sans:var(--font-tx02,ui-sans-serif,system-ui,sans-serif);--stack-mono:var(--docs-font-code,ui-monospace,monospace);display:flex;flex-direction:column;width:fit-content;max-width:100%;margin:0;font-family:var(--stack-sans);color:var(--stack-ink)}
:is(.dark,[data-theme="dark"]) [data-stack]{--stack-card:var(--docs-stack-card-bg,color-mix(in srgb,var(--stack-ink) 7%,var(--docs-panel,#151b23)));--stack-t1:10%;--stack-t2:15%;--stack-t3:20%;--stack-chip-mix:20%}
[data-stack] [data-color="blue"]{--stack-c:var(--docs-stack-blue,var(--docs-cat-1,#0b6e99))}
[data-stack] [data-color="green"]{--stack-c:var(--docs-stack-green,var(--docs-cat-3,#26744f))}
[data-stack] [data-color="orange"]{--stack-c:var(--docs-stack-orange,var(--docs-cat-4,#805f01))}
[data-stack] [data-color="yellow"]{--stack-c:var(--docs-stack-yellow,var(--docs-cat-4,#805f01))}
[data-stack] [data-color="purple"]{--stack-c:var(--docs-stack-purple,var(--docs-cat-5,#6940a5))}
[data-stack] [data-color="red"]{--stack-c:var(--docs-stack-red,var(--docs-cat-6,#ad1a72))}
[data-stack] [data-color="pink"]{--stack-c:var(--docs-stack-pink,var(--docs-cat-6,#ad1a72))}
[data-stack] [data-color="gray"]{--stack-c:var(--docs-stack-gray,var(--stack-muted))}
[data-stack-group]{--stack-layer:var(--stack-c);--stack-body:color-mix(in srgb,var(--stack-c) var(--stack-t1),var(--stack-base));--stack-chip:color-mix(in srgb,var(--stack-c) var(--stack-chip-mix),var(--stack-body));--stack-line:color-mix(in srgb,var(--stack-c) 50%,transparent);min-width:0;overflow:hidden;background:var(--stack-body);border:var(--ds-border-width-hairline) solid var(--stack-line);border-radius:var(--stack-radius)}
[data-stack-group] [data-stack-group]{--stack-body:color-mix(in srgb,var(--stack-c) var(--stack-t2),var(--stack-base))}
[data-stack-group] [data-stack-group] [data-stack-group]{--stack-body:color-mix(in srgb,var(--stack-c) var(--stack-t3),var(--stack-base))}
[data-stack-head]{display:flex;flex-wrap:wrap;align-items:center;gap:var(--ds-space-3);min-width:0;min-height:var(--ds-space-7)}
[data-stack-chip]{display:inline-flex;flex:0 1 auto;flex-wrap:wrap;align-items:center;column-gap:var(--ds-space-1-5);min-width:0;max-width:100%;min-height:var(--ds-space-7);padding:var(--ds-space-1) 10px var(--ds-space-1) var(--ds-space-1-5);box-sizing:border-box;background:var(--stack-chip);border-right:var(--ds-border-width-hairline) solid var(--stack-line);border-bottom:var(--ds-border-width-hairline) solid var(--stack-line);border-bottom-right-radius:var(--stack-radius)}
[data-stack-tile]{display:inline-flex;flex:none;align-items:center;justify-content:center;width:var(--ds-space-4);height:var(--ds-space-4);border-radius:var(--ds-radius-base);background:var(--stack-c);color:var(--docs-tile-glyph,var(--stack-page))}
[data-stack-tile] svg{display:block;width:11px;height:11px}
[data-stack-chip-name]{font-family:var(--stack-mono);font-size:var(--ds-font-size-ui-xs);font-weight:var(--ds-font-weight-semibold);line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:var(--stack-ink)}
[data-stack-body]{display:grid;grid-template-columns:repeat(var(--cols,1),minmax(0,1fr));column-gap:var(--stack-gap);padding:var(--stack-gap)}
[data-stack-body][data-cols="2"]{row-gap:var(--stack-gap)}
[data-stack-body]>[data-stack-uses],[data-stack-body]>[data-stack-boundary]{grid-column:1/-1}
:is([data-stack-box],[data-stack-group])+:is([data-stack-box],[data-stack-group]){margin-top:var(--stack-gap)}
[data-stack-body][data-cols="2"]>:is([data-stack-box],[data-stack-group]){margin-top:0}
[data-stack-box]{min-width:0;padding:10px var(--ds-space-3);background:var(--stack-card);border:var(--ds-border-width-hairline) solid color-mix(in srgb,var(--stack-layer,var(--stack-muted)) 55%,transparent);border-radius:var(--stack-radius)}
[data-stack-box][data-role]{padding-left:10px;border-left:var(--ds-border-width-rail) solid var(--stack-c,var(--stack-muted))}
[data-stack-head-row]{display:flex;align-items:baseline;justify-content:space-between;column-gap:var(--ds-space-4);min-width:0}
[data-stack-role]{flex:none;font-family:var(--stack-mono);font-size:var(--ds-font-size-ui-sm);font-weight:var(--ds-font-weight-regular);line-height:1.4;color:color-mix(in srgb,var(--stack-muted) 50%,var(--stack-text))}
[data-stack-name]{min-width:0;font-family:var(--stack-mono);font-size:var(--ds-font-size-ui-lg);font-weight:var(--ds-font-weight-semibold);line-height:1.4;color:var(--stack-ink);overflow-wrap:normal}
[data-stack-detail]{max-width:var(--ds-layout-lane-text);margin-top:var(--ds-space-0-5);font-size:var(--ds-font-size-ui-md);line-height:var(--ds-line-height-ui);color:var(--stack-text);overflow-wrap:anywhere}
[data-stack-detail-line]{display:block}
[data-stack-detail][data-mono]{font-family:var(--stack-mono);font-size:var(--ds-font-size-ui-sm);line-height:1.6;overflow-wrap:normal}
[data-stack-detail][data-mono]>[data-stack-detail-line]:not([data-prose]){color:var(--stack-muted)}
[data-stack-detail-line][data-prose]{font-family:var(--stack-sans);font-size:var(--ds-font-size-ui-md);line-height:var(--ds-line-height-ui)}
[data-stack-name][data-prose]{font-family:var(--stack-sans)}
[data-stack-code]{font-family:var(--stack-mono);font-size:var(--ds-font-size-ui-sm);white-space:nowrap}
[data-stack-nowrap]{white-space:nowrap}
[data-stack-uses],[data-stack-boundary]{position:relative;min-width:0}
[data-stack-uses]{display:flex;align-items:center;min-height:var(--ds-space-5);padding-left:calc(var(--stack-arrow-x) + var(--ds-space-2))}
[data-stack-arrow]{position:absolute;top:0;bottom:0;left:var(--stack-arrow-x);border-left:var(--ds-border-width-ring) solid var(--stack-arrow)}
[data-stack-arrow]::after{position:absolute;bottom:1px;left:-4.5px;box-sizing:content-box;width:6px;height:6px;border-right:var(--ds-border-width-ring) solid var(--stack-arrow);border-bottom:var(--ds-border-width-ring) solid var(--stack-arrow);transform:rotate(45deg);content:""}
[data-stack-uses][data-continues] [data-stack-arrow]::after{display:none}
[data-stack-uses-label]{font-family:var(--stack-mono);font-size:var(--ds-font-size-ui-sm);line-height:1.3;color:color-mix(in srgb,var(--stack-muted) 40%,var(--stack-text));overflow-wrap:normal}
[data-stack-boundary]{display:flex;flex-direction:column;row-gap:var(--ds-space-1-5);padding:var(--ds-space-2) 0 var(--ds-space-3)}
[data-stack-dash]{height:0;border-top:var(--ds-border-width-hairline) dashed var(--stack-boundary)}
[data-stack-boundary][data-crossed] [data-stack-dash]{margin-left:calc(var(--stack-arrow-x) + var(--ds-space-2))}
[data-stack-rule]{margin:0 0 0 calc(var(--stack-arrow-x) + var(--ds-space-2));font-size:var(--ds-font-size-ui-md);font-weight:var(--ds-font-weight-regular);line-height:1.4;color:var(--stack-text)}
`;

type StackProps = { nodes: StackNode[]; boundaries: StackBoundary[] };

function colorAttr(node: StackNode, isGroup: boolean): string | undefined {
  return node.color ?? (isGroup ? "gray" : undefined);
}


/** The hover title for what the shape leaves out: a node's role and a container's detail. */
const hoverTitle = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" — ") || undefined;

/** Detail segments are stored ` · `-separated; the shape never draws them as a dotted list. */
/** A leading bare path written with a comma (`packages/docs-viewer, DocsClientProvider`) is a segment of its own. */
const detailSegments = (detail: string) =>
  detail.split(/\s+·\s+/).filter(Boolean).flatMap((segment) => {
    const lead = /^(`?[^\s`,]+`?),\s+(\S.*)$/.exec(segment);
    return lead && chipKind(lead[1]!.replace(/`/g, "")) === "path" ? [lead[1]!, lead[2]!] : [segment];
  });

/**
 * A leaf's detail. A detail that is not a path joins its segments with ", " on
 * one line. In a path detail, each bare path segment (`@spectre/*`,
 * `src/rules/index.ts`) gets its own muted code-face line, since its own
 * commas and braces would blur a comma-joined line, and the other segments
 * join with ", " on one line after them in the body face. docs-model
 * layout/metrics.ts `stackDetailLayout` is the same layout for the lints.
 */
function StackDetail({ detail }: { detail: string }) {
  const segments = detailSegments(detail);
  if (chipKind(detail) !== "path") return <div data-stack-detail="">{codeWords(segments.join(", "))}</div>;
  const isPath = (segment: string) => !/\s/.test(segment) && chipKind(segment.replace(/`/g, "")) === "path";
  const rest = segments.filter((segment) => !isPath(segment));
  return (
    <div data-stack-detail="" data-mono="">
      {segments.filter(isPath).map((segment, index) => (
        <span key={index} data-stack-detail-line="">
          {monoBreaks(segment.replace(/`/g, ""))}
        </span>
      ))}
      {rest.length > 0 && (
        <span data-stack-detail-line="" data-prose="">
          {codeWords(rest.join(", "))}
        </span>
      )}
    </div>
  );
}

/** A segment or name with a space that is not itself code (`also imports profile types`, `Docs server route`). */
const isProse = (text: string) => /\s/.test(text.trim()) && !(["string", "call"] as string[]).includes(chipKind(text));

/**
 * Prose with each backtick span (`startMcp`, `doc.json`) set in the code face, as inline code reads in the
 * page's prose. The writer marks code. The stack never guesses it, so one detail never mixes a guessed code
 * name with a missed one. A hyphenated word or a code span never breaks across lines (`docs-workbench`).
 */
function codeWords(text: string): ReactNode {
  return text.split(/(`[^`]+`)/).map((part, index) => {
    if (index % 2 === 1) return <span key={index} data-stack-code="">{part.slice(1, -1)}</span>;
    return part.split(/(\S*\w-\w\S*)/).map((piece, inner) =>
      inner % 2 === 1 ? <span key={`${index}:${inner}`} data-stack-nowrap="">{piece}</span> : piece,
    );
  });
}

/** Tabler `stack-3`: the flow family's stack glyph. */
const TILE_GLYPH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l-8 4l8 4l8 -4l-8 -4" />
    <path d="M4 10l8 4l8 -4" />
    <path d="M4 18l8 4l8 -4" />
    <path d="M4 14l8 4l8 -4" />
  </svg>
);

function renderNode(node: StackNode, renderList: (nodes: StackNode[]) => ReactNode): ReactNode {
  if (node.children && node.children.length > 0) {
    const twoColumns = node.columns === 2;
    return (
      <section data-stack-group="" data-color={colorAttr(node, true)}>
        <header data-stack-head="" title={hoverTitle(node.badge, node.detail)}>
          <span data-stack-chip="">
            <span data-stack-tile="" aria-hidden="true">
              {TILE_GLYPH}
            </span>
            <span data-stack-chip-name="">{node.name}</span>
          </span>
        </header>
        <div
          data-stack-body=""
          data-cols={twoColumns ? "2" : undefined}
          style={twoColumns ? ({ "--cols": 2 } as CSSProperties) : undefined}
        >
          {renderList(node.children)}
        </div>
      </section>
    );
  }
  return (
    <div
      data-stack-box=""
      data-role={node.badge ? "" : undefined}
      data-color={node.badge ? colorAttr(node, false) : undefined}
      title={node.badge}
    >
      <div data-stack-head-row="">
        <span data-stack-name="" data-prose={isProse(node.name) ? "" : undefined}>{monoBreaks(node.name)}</span>
        {node.badge && <span data-stack-role="">{node.badge}</span>}
      </div>
      {node.detail && <StackDetail detail={node.detail} />}
    </div>
  );
}

/** Read-only boundary stack: nodes top to bottom, arrows and rule lines between siblings. */
export function StackBlock({ nodes, boundaries }: StackProps) {
  const ruleAfter = new Map(boundaries.map((boundary) => [boundary.after, boundary.rule]));
  const renderList = (list: StackNode[]): ReactNode =>
    list.map((node, index) => {
      const rule = ruleAfter.get(node.name);
      const crossed = node.uses !== undefined && rule !== undefined;
      return (
        <Fragment key={`${index}:${node.name}`}>
          {renderNode(node, renderList)}
          {/* An unlabelled arrow that crosses a rule line is drawn by the line itself. */}
          {node.uses !== undefined && !(crossed && node.uses === true) && (
            <div data-stack-uses="" data-continues={crossed ? "" : undefined}>
              <span data-stack-arrow="" aria-hidden="true" />
              {typeof node.uses === "string" && <span data-stack-uses-label="">{monoBreaks(node.uses.replace(/`/g, ""))}</span>}
            </div>
          )}
          {rule !== undefined && (
            <div data-stack-boundary="" data-crossed={crossed ? "" : undefined} role="separator" aria-label={rule}>
              {crossed && <span data-stack-arrow="" aria-hidden="true" />}
              {/* A crossing arrow keeps clear space: the line and its rule start just right of it. */}
              <span data-stack-dash="" />
              <span data-stack-rule="">{codeWords(rule)}</span>
            </div>
          )}
        </Fragment>
      );
    });
  return (
    <div data-stack="" data-fam="flow">
      <style>{STACK_STYLE}</style>
      {renderList(nodes)}
    </div>
  );
}
