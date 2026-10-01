"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { StackBoundary, StackNode } from "@codecaine-ai/docs-model";
import { chipKind } from "../typed-chip";

export const STACK_LABEL = "Stack";
export const STACK_AGENT_DESCRIPTION =
  "A boundary stack: nested layers drawn top to bottom. A node with children is a tinted container with its name pinned in a header chip; a leaf is a card with its name, optional badge, and one detail line. A uses arrow points from a node to its next sibling, and a dashed line beneath a node states, in words, the rule enforced at that boundary. Auto-laid out; no coordinates.";

/**
 * Theme-lab look: a container is the canvas section idiom on one panel frame,
 * a header chip pinned to its top-left corner (a tile in the container's hue +
 * its name in sentence case) over a soft category tint; untinted (gray)
 * containers stay neutral. Leaves are raised cards with a mono name, a 12px
 * badge and one detail line (mono when it is a path). A boundary is a dashed
 * line plus the rule as text, never colour alone, and muted rather than red:
 * it is a standing design rule, not an error.
 *
 * Every value reads a --docs-stack-* token, then the role token, then the
 * light literal, so the block renders the light theme without the workbench
 * stylesheet. Node colours map onto the category roster (blue 1, green 3,
 * yellow and orange 4, purple 5, pink and red 6), keeping red for danger.
 */
const STACK_STYLE = `
[data-stack]{--stack-ink:var(--docs-stack-ink,var(--docs-ink,#1f1f1f));--stack-muted:var(--docs-stack-muted,var(--docs-muted,#666562));--stack-rule:var(--docs-stack-rule,var(--docs-rule,#e6e5e3));--stack-panel:var(--docs-stack-panel,var(--docs-panel,#f8f8f7));--stack-card:var(--docs-stack-card-bg,var(--docs-page,#fdfdfd));--stack-arrow:var(--docs-stack-arrow,var(--docs-muted,#666562));--stack-boundary:var(--docs-stack-boundary,var(--docs-muted,#666562));--stack-gap:var(--docs-stack-gap,12px);--stack-radius:var(--docs-stack-radius,var(--radius,2px));--stack-arrow-x:20px;--stack-sans:var(--font-tx02,ui-sans-serif,system-ui,sans-serif);--stack-mono:var(--docs-font-code,ui-monospace,monospace);display:flex;flex-direction:column;margin:0;font-family:var(--stack-sans);color:var(--stack-ink)}
[data-stack] [data-color="blue"]{--stack-c:var(--docs-stack-blue,var(--docs-cat-1,#0b6e99));--stack-soft:var(--docs-stack-blue-soft,var(--docs-cat-1-soft,#ddebf1))}
[data-stack] [data-color="green"]{--stack-c:var(--docs-stack-green,var(--docs-cat-3,#26744f));--stack-soft:var(--docs-stack-green-soft,var(--docs-cat-3-soft,#e2efe6))}
[data-stack] [data-color="orange"]{--stack-c:var(--docs-stack-orange,var(--docs-cat-4,#805f01));--stack-soft:var(--docs-stack-orange-soft,var(--docs-cat-4-soft,#fbf3db))}
[data-stack] [data-color="yellow"]{--stack-c:var(--docs-stack-yellow,var(--docs-cat-4,#805f01));--stack-soft:var(--docs-stack-yellow-soft,var(--docs-cat-4-soft,#fbf3db))}
[data-stack] [data-color="purple"]{--stack-c:var(--docs-stack-purple,var(--docs-cat-5,#6940a5));--stack-soft:var(--docs-stack-purple-soft,var(--docs-cat-5-soft,#eae4f2))}
[data-stack] [data-color="red"]{--stack-c:var(--docs-stack-red,var(--docs-cat-6,#ad1a72));--stack-soft:var(--docs-stack-red-soft,var(--docs-cat-6-soft,#f4dfeb))}
[data-stack] [data-color="pink"]{--stack-c:var(--docs-stack-pink,var(--docs-cat-6,#ad1a72));--stack-soft:var(--docs-stack-pink-soft,var(--docs-cat-6-soft,#f4dfeb))}
[data-stack] [data-color="gray"]{--stack-c:var(--docs-stack-gray,var(--stack-muted))}
[data-stack-group]{--stack-body:var(--stack-soft);--stack-chip:color-mix(in srgb,var(--stack-c) 13%,var(--stack-panel));--stack-line:color-mix(in srgb,var(--stack-c) 40%,var(--stack-rule));--stack-tile:var(--stack-c);min-width:0;overflow:hidden;background:var(--stack-body);border:1px solid var(--stack-line);border-radius:var(--stack-radius)}
[data-stack-group][data-color="gray"]{--stack-body:var(--stack-panel);--stack-chip:var(--docs-stack-chip-bg,var(--docs-sunken,#ededec));--stack-line:var(--stack-rule);--stack-tile:var(--docs-fam-text-solid,#9b9a97)}
[data-stack-head]{display:flex;align-items:center;gap:12px;min-width:0;min-height:28px}
[data-stack-chip]{display:inline-flex;flex:none;align-items:center;gap:8px;max-width:100%;min-height:28px;padding:0 12px 0 8px;background:var(--stack-chip);border-right:1px solid var(--stack-line);border-bottom:1px solid var(--stack-line);border-bottom-right-radius:var(--stack-radius)}
[data-stack-tile]{display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px;border-radius:2px;background:var(--stack-tile);color:var(--docs-tile-glyph,#ffffff)}
[data-stack-tile] svg{display:block;width:11px;height:11px}
[data-stack-chip-name]{font-size:13.5px;font-weight:600;line-height:1.3;color:var(--stack-ink)}
[data-stack-chip-detail]{min-width:0;padding-right:12px;font-size:13.5px;line-height:1.3;color:var(--stack-muted);overflow-wrap:anywhere}
[data-stack-chip-detail][data-mono]{font-family:var(--stack-mono);font-size:12px}
[data-stack-body]{display:grid;grid-template-columns:repeat(var(--cols,1),minmax(0,1fr));column-gap:var(--stack-gap);padding:var(--stack-gap)}
[data-stack-body][data-cols="2"]{row-gap:var(--stack-gap)}
[data-stack-body]>[data-stack-uses],[data-stack-body]>[data-stack-boundary]{grid-column:1/-1}
:is([data-stack-box],[data-stack-group])+:is([data-stack-box],[data-stack-group]){margin-top:var(--stack-gap)}
[data-stack-body][data-cols="2"]>:is([data-stack-box],[data-stack-group]){margin-top:0}
[data-stack-box]{min-width:0;padding:10px 12px;background:var(--stack-card);border:1px solid var(--stack-rule);border-radius:var(--stack-radius)}
[data-stack-head-row]{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
[data-stack-name]{font-family:var(--stack-mono);font-size:13px;font-weight:500;line-height:1.4;color:var(--stack-ink);overflow-wrap:anywhere}
[data-stack-badge]{flex:none;padding:2px 6px;font-family:var(--stack-mono);font-size:12px;font-weight:500;line-height:1;color:var(--stack-c,var(--stack-muted));border:1px solid color-mix(in srgb,var(--stack-c,var(--stack-muted)) 40%,transparent);border-radius:var(--stack-radius)}
[data-stack-detail]{margin-top:2px;font-size:13.5px;line-height:1.5;color:var(--stack-muted);overflow-wrap:anywhere}
[data-stack-detail][data-mono]{font-family:var(--stack-mono);font-size:12px;line-height:1.6}
[data-stack-uses],[data-stack-boundary]{position:relative;min-width:0}
[data-stack-uses]{display:flex;align-items:center;min-height:20px;padding-left:calc(var(--stack-arrow-x) + 8px)}
[data-stack-arrow]{position:absolute;top:0;bottom:0;left:var(--stack-arrow-x);border-left:1px solid var(--stack-arrow)}
[data-stack-arrow]::after{position:absolute;bottom:1px;left:-3.5px;box-sizing:content-box;width:5px;height:5px;border-right:1px solid var(--stack-arrow);border-bottom:1px solid var(--stack-arrow);transform:rotate(45deg);content:""}
[data-stack-uses][data-continues] [data-stack-arrow]::after{display:none}
[data-stack-uses-label]{font-family:var(--stack-mono);font-size:12px;line-height:1.3;color:var(--stack-muted);overflow-wrap:anywhere}
[data-stack-boundary]{display:flex;align-items:center;gap:12px;min-height:44px;padding:4px 0}
[data-stack-dash]{height:0;border-top:1px dashed var(--stack-boundary)}
[data-stack-dash="lead"]{flex:0 0 calc(var(--stack-arrow-x) * 2)}
[data-stack-dash="tail"]{flex:1 1 auto;min-width:24px}
[data-stack-rule]{font-size:13.5px;font-weight:500;line-height:1.3;color:var(--stack-ink)}
`;

type StackProps = { nodes: StackNode[]; boundaries: StackBoundary[] };

function colorAttr(node: StackNode, isGroup: boolean): string | undefined {
  return node.color ?? (isGroup ? "gray" : undefined);
}

/** Paths (`external/`, `@spectre/*`) read as machine text: mono. */
const monoAttr = (text: string) => (chipKind(text) === "path" ? { "data-mono": "" } : {});

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
        <header data-stack-head="">
          <span data-stack-chip="">
            <span data-stack-tile="" aria-hidden="true">
              {TILE_GLYPH}
            </span>
            <span data-stack-chip-name="">{node.name}</span>
          </span>
          {node.badge && (
            <span data-stack-badge="" data-color={colorAttr(node, false)}>
              {node.badge}
            </span>
          )}
          {node.detail && (
            <span data-stack-chip-detail="" {...monoAttr(node.detail)}>
              {node.detail}
            </span>
          )}
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
    <div data-stack-box="">
      <div data-stack-head-row="">
        <span data-stack-name="">{node.name}</span>
        {node.badge && (
          <span data-stack-badge="" data-color={colorAttr(node, false)}>
            {node.badge}
          </span>
        )}
      </div>
      {node.detail && (
        <div data-stack-detail="" {...monoAttr(node.detail)}>
          {node.detail}
        </div>
      )}
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
              {typeof node.uses === "string" && <span data-stack-uses-label="">{node.uses}</span>}
            </div>
          )}
          {rule !== undefined && (
            <div data-stack-boundary="" data-crossed={crossed ? "" : undefined} role="separator" aria-label={rule}>
              {crossed && <span data-stack-arrow="" aria-hidden="true" />}
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
