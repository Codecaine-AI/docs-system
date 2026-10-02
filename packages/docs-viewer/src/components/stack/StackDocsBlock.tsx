"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { StackBoundary, StackNode } from "@codecaine-ai/docs-model";
import { monoBreaks } from "../mono-breaks";
import { chipKind } from "../typed-chip";

export const STACK_LABEL = "Stack";
export const STACK_AGENT_DESCRIPTION =
  "A boundary stack: nested layers drawn top to bottom. A node with children is a tinted container with its name pinned in a header chip; a leaf is a card with its name and its detail as plain text, and an optional badge shows as the card's role: a colored left edge plus a small lowercase word beside the name. A uses arrow points from a node to its next sibling, and a dashed line beneath a node states, in words, the rule enforced at that boundary. Auto-laid out; no coordinates.";

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
 * muted lowercase mono word at the name row's right end (and the hover
 * title). A boundary is a dashed line with the rule as text, never colour
 * alone; next to a crossing arrow the line starts just right of it, so the
 * two never overlap.
 *
 * Every value reads a --docs-stack-* token, then the role token, then the
 * light literal, so the block renders the light theme without the workbench
 * stylesheet. Node colours map onto the category roster (blue 1, green 3,
 * yellow and orange 4, purple 5, pink and red 6), keeping red for danger.
 */
const STACK_STYLE = `
[data-stack]{--stack-ink:var(--docs-stack-ink,var(--docs-ink,#1f1f1f));--stack-muted:var(--docs-stack-muted,var(--docs-muted,#666562));--stack-text:var(--docs-stack-detail,var(--docs-text,#2a2a2a));--stack-page:var(--docs-page,#fdfdfd);--stack-card:var(--docs-stack-card-bg,var(--docs-page,#fdfdfd));--stack-base:var(--stack-page);--stack-t1:7%;--stack-t2:10.5%;--stack-t3:14%;--stack-chip-mix:16%;--stack-arrow:var(--docs-stack-arrow,var(--docs-muted,#666562));--stack-boundary:var(--docs-stack-boundary,var(--docs-muted,#666562));--stack-gap:var(--docs-stack-gap,12px);--stack-radius:var(--docs-stack-radius,var(--radius,2px));--stack-arrow-x:20px;--stack-sans:var(--font-tx02,ui-sans-serif,system-ui,sans-serif);--stack-mono:var(--docs-font-code,ui-monospace,monospace);display:flex;flex-direction:column;width:fit-content;max-width:100%;margin:0;font-family:var(--stack-sans);color:var(--stack-ink)}
:is(.dark,[data-theme="dark"]) [data-stack]{--stack-card:var(--docs-stack-card-bg,color-mix(in srgb,var(--stack-ink) 7%,var(--docs-panel,#151b23)));--stack-t1:10%;--stack-t2:15%;--stack-t3:20%;--stack-chip-mix:20%}
[data-stack] [data-color="blue"]{--stack-c:var(--docs-stack-blue,var(--docs-cat-1,#0b6e99))}
[data-stack] [data-color="green"]{--stack-c:var(--docs-stack-green,var(--docs-cat-3,#26744f))}
[data-stack] [data-color="orange"]{--stack-c:var(--docs-stack-orange,var(--docs-cat-4,#805f01))}
[data-stack] [data-color="yellow"]{--stack-c:var(--docs-stack-yellow,var(--docs-cat-4,#805f01))}
[data-stack] [data-color="purple"]{--stack-c:var(--docs-stack-purple,var(--docs-cat-5,#6940a5))}
[data-stack] [data-color="red"]{--stack-c:var(--docs-stack-red,var(--docs-cat-6,#ad1a72))}
[data-stack] [data-color="pink"]{--stack-c:var(--docs-stack-pink,var(--docs-cat-6,#ad1a72))}
[data-stack] [data-color="gray"]{--stack-c:var(--docs-stack-gray,var(--stack-muted))}
[data-stack-group]{--stack-layer:var(--stack-c);--stack-body:color-mix(in srgb,var(--stack-c) var(--stack-t1),var(--stack-base));--stack-chip:color-mix(in srgb,var(--stack-c) var(--stack-chip-mix),var(--stack-body));--stack-line:color-mix(in srgb,var(--stack-c) 50%,transparent);min-width:0;overflow:hidden;background:var(--stack-body);border:1px solid var(--stack-line);border-radius:var(--stack-radius)}
[data-stack-group] [data-stack-group]{--stack-body:color-mix(in srgb,var(--stack-c) var(--stack-t2),var(--stack-base))}
[data-stack-group] [data-stack-group] [data-stack-group]{--stack-body:color-mix(in srgb,var(--stack-c) var(--stack-t3),var(--stack-base))}
[data-stack-head]{display:flex;flex-wrap:wrap;align-items:center;gap:12px;min-width:0;min-height:28px}
[data-stack-chip]{display:inline-flex;flex:0 1 auto;flex-wrap:wrap;align-items:center;column-gap:6px;min-width:0;max-width:100%;min-height:28px;padding:4px 10px 4px 6px;box-sizing:border-box;background:var(--stack-chip);border-right:1px solid var(--stack-line);border-bottom:1px solid var(--stack-line);border-bottom-right-radius:var(--stack-radius)}
[data-stack-tile]{display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px;border-radius:2px;background:var(--stack-c);color:var(--docs-tile-glyph,var(--stack-page))}
[data-stack-tile] svg{display:block;width:11px;height:11px}
[data-stack-chip-name]{font-family:var(--stack-mono);font-size:12px;font-weight:600;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:var(--stack-ink)}
[data-stack-body]{display:grid;grid-template-columns:repeat(var(--cols,1),minmax(0,1fr));column-gap:var(--stack-gap);padding:var(--stack-gap)}
[data-stack-body][data-cols="2"]{row-gap:var(--stack-gap)}
[data-stack-body]>[data-stack-uses],[data-stack-body]>[data-stack-boundary]{grid-column:1/-1}
:is([data-stack-box],[data-stack-group])+:is([data-stack-box],[data-stack-group]){margin-top:var(--stack-gap)}
[data-stack-body][data-cols="2"]>:is([data-stack-box],[data-stack-group]){margin-top:0}
[data-stack-box]{min-width:0;padding:10px 12px;background:var(--stack-card);border:1px solid color-mix(in srgb,var(--stack-layer,var(--stack-muted)) 55%,transparent);border-radius:var(--stack-radius)}
[data-stack-box][data-role]{padding-left:10px;border-left:3px solid var(--stack-c,var(--stack-muted))}
[data-stack-head-row]{display:flex;align-items:baseline;justify-content:space-between;column-gap:16px;min-width:0}
[data-stack-role]{flex:none;font-family:var(--stack-mono);font-size:12px;font-weight:400;line-height:1.4;text-transform:lowercase;color:color-mix(in srgb,var(--stack-muted) 50%,var(--stack-text))}
[data-stack-name]{min-width:0;font-family:var(--stack-mono);font-size:13.5px;font-weight:600;line-height:1.4;color:var(--stack-ink);overflow-wrap:normal}
[data-stack-detail]{max-width:60ch;margin-top:2px;font-size:13.5px;line-height:1.5;color:var(--stack-text);overflow-wrap:anywhere}
[data-stack-detail-line]{display:block}
[data-stack-detail][data-mono]{font-family:var(--stack-mono);font-size:12px;line-height:1.6;overflow-wrap:normal}
[data-stack-uses],[data-stack-boundary]{position:relative;min-width:0}
[data-stack-uses]{display:flex;align-items:center;min-height:20px;padding-left:calc(var(--stack-arrow-x) + 8px)}
[data-stack-arrow]{position:absolute;top:0;bottom:0;left:var(--stack-arrow-x);border-left:1px solid var(--stack-arrow)}
[data-stack-arrow]::after{position:absolute;bottom:1px;left:-3.5px;box-sizing:content-box;width:5px;height:5px;border-right:1px solid var(--stack-arrow);border-bottom:1px solid var(--stack-arrow);transform:rotate(45deg);content:""}
[data-stack-uses][data-continues] [data-stack-arrow]::after{display:none}
[data-stack-uses-label]{font-family:var(--stack-mono);font-size:12px;line-height:1.3;color:var(--stack-muted);overflow-wrap:normal}
[data-stack-boundary]{display:flex;align-items:center;min-height:44px;padding:4px 0}
[data-stack-dash]{height:0;border-top:1px dashed var(--stack-boundary)}
[data-stack-dash="lead"]{flex:0 0 calc(var(--stack-arrow-x) * 2)}
[data-stack-boundary][data-crossed] [data-stack-dash="lead"]{flex-basis:24px;margin-left:calc(var(--stack-arrow-x) + 8px)}
[data-stack-dash="tail"]{flex:1 1 auto;min-width:24px}
[data-stack-rule]{margin:0 12px;font-size:13.5px;font-weight:600;line-height:1.3;color:var(--stack-ink)}
`;

type StackProps = { nodes: StackNode[]; boundaries: StackBoundary[] };

function colorAttr(node: StackNode, isGroup: boolean): string | undefined {
  return node.color ?? (isGroup ? "gray" : undefined);
}


/** The hover title for what the shape leaves out: a node's role and a container's detail. */
const hoverTitle = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" — ") || undefined;

/** Detail segments are stored ` · `-separated; the shape never draws them as a dotted list. */
const detailSegments = (detail: string) => detail.split(/\s+·\s+/).filter(Boolean);

/**
 * A leaf's detail as plain text: prose segments join with ", "; path segments
 * (`@spectre/* · @/* · apps/{…}/`) go one per line, since their own commas and
 * braces would blur a comma-joined line.
 */
function StackDetail({ detail }: { detail: string }) {
  const segments = detailSegments(detail);
  if (chipKind(detail) !== "path") return <div data-stack-detail="">{segments.join(", ")}</div>;
  return (
    <div data-stack-detail="" data-mono="">
      {segments.map((segment, index) => (
        <span key={index} data-stack-detail-line="">
          {monoBreaks(segment)}
        </span>
      ))}
    </div>
  );
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
        <span data-stack-name="">{monoBreaks(node.name)}</span>
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
              {typeof node.uses === "string" && <span data-stack-uses-label="">{monoBreaks(node.uses)}</span>}
            </div>
          )}
          {rule !== undefined && (
            <div data-stack-boundary="" data-crossed={crossed ? "" : undefined} role="separator" aria-label={rule}>
              {crossed && <span data-stack-arrow="" aria-hidden="true" />}
              {/* A crossing arrow keeps clear space: the line starts just right of it. */}
              <span data-stack-dash="lead" />
              <span data-stack-rule="">{rule}</span>
              <span data-stack-dash="tail" />
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
