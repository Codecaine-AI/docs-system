"use client";

import type { CSSProperties, ReactNode } from "react";
import type { FlowStripStep } from "@codecaine-ai/docs-model";
import { chipKind, typedChipColorCss } from "../typed-chip";

export const FLOW_STRIP_LABEL = "Flow Strip";
export const FLOW_STRIP_AGENT_DESCRIPTION =
  "A flow strip rendered from typed props: { title?; steps: { name; detail? }[]; caption? }. The steps draw as a wrapping grid of numbered cards joined by arrows, each with its name and one detail line; the title sits above, the caption below. Backticks in text render as code chips.";

/** Backtick spans become typed code chips; everything else stays plain text. */
function renderText(text: string): ReactNode[] {
  return text.split("`").map((segment, index) =>
    index % 2 ? (
      <code key={index} className="docs-flow-strip__chip" data-flow-strip-code="true" data-chip-kind={chipKind(segment)}>
        {segment}
      </code>
    ) : (
      <span key={index}>{segment}</span>
    ),
  );
}

/**
 * Columns for `count` cards: one row up to four, then whichever of 4 or 3
 * leaves the fullest last row, so the grid never strands a lone card when it
 * can avoid it (5 -> 3+2, 6 -> 3+3, 7 -> 4+3, 9 -> 3+3+3).
 */
function flowStripColumns(count: number): number {
  if (count <= 4) return Math.max(count, 1);
  let best = 4;
  let bestFill = -1;
  for (const cols of [4, 3]) {
    const fill = count % cols === 0 ? cols : count % cols;
    if (fill > bestFill) {
      best = cols;
      bestFill = fill;
    }
  }
  return best;
}

/** Tabler `arrows-right`: the flow family's flow-strip glyph. */
const TILE_GLYPH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 17l-18 0" />
    <path d="M18 4l3 3l-3 3" />
    <path d="M18 20l3 -3l-3 -3" />
    <path d="M21 7l-18 0" />
  </svg>
);

/** Read-only strip of step cards. Every visual value reads a --docs-flow-strip-* token, then a role token, then the light literal. */
export function FlowStripBlock({
  id,
  title,
  steps,
  caption,
}: {
  id: string;
  title?: string;
  steps: readonly FlowStripStep[];
  caption?: string;
}) {
  const cols = flowStripColumns(steps.length);
  return (
    <section className="not-prose my-4 w-full" data-docs-block-type="flow-strip" data-source-id={id}>
      <style>{FLOW_STRIP_CSS}</style>
      <div className="docs-flow-strip" data-fam="flow">
        {title ? (
          <div className="docs-flow-strip__title">
            <span className="docs-flow-strip__tile" aria-hidden="true">
              {TILE_GLYPH}
            </span>
            <span>{renderText(title)}</span>
          </div>
        ) : null}
        {/* Divs with list roles, not ol/li: host list styles must never leak in. */}
        <div
          className="docs-flow-strip__cards"
          role="list"
          data-cols={cols}
          style={{ "--fs-cols": cols } as CSSProperties}
        >
          {steps.map((step, index) => (
            <div key={index} role="listitem" className="docs-flow-strip__card" data-flow-strip-card="true">
              <div className="docs-flow-strip__head">
                <span className="docs-flow-strip__num">{String(index + 1).padStart(2, "0")}</span>
                <span className="docs-flow-strip__name">{renderText(step.name)}</span>
              </div>
              {step.detail ? <div className="docs-flow-strip__detail">{renderText(step.detail)}</div> : null}
            </div>
          ))}
        </div>
        {caption ? (
          <div className="docs-flow-strip__caption" data-flow-strip-caption="true">
            {renderText(caption)}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/*
 * Theme-lab look: plain panel cards in a wrapping grid (flowStripColumns picks
 * the column count), the step number in the flow family green at a regular
 * weight so the mono name stays the focal point, one detail line, typed chips,
 * and a muted arrow in each column gap at the name line. A card that starts a
 * row has no arrow, so an arrow never crosses a row break. Narrow containers
 * drop to two columns, then one (numbers carry the order there).
 * Every value reads --docs-flow-strip-* first, then the role token, then the
 * light literal (renders without semantic.css match the light theme).
 */
const FLOW_STRIP_CSS = `
.docs-flow-strip {
  --fs-gap: var(--docs-flow-strip-gap, 28px);
  --fs-pad: 12px;
  --fs-stroke: var(--docs-flow-strip-stroke, 1px);
  --fs-arrow: var(--docs-flow-strip-arrow, var(--docs-muted, #666562));
  --fs-muted: var(--docs-flow-strip-muted-fg, var(--docs-muted, #666562));
  container: docs-flow-strip / inline-size;
  display:flex; flex-direction:column; gap:12px; padding:var(--docs-flow-strip-pad-y, 0px) 0;
  color:var(--docs-flow-strip-ink, var(--docs-text, #2a2a2a));
  font-family:var(--font-tx02, ui-sans-serif, system-ui, sans-serif);
}
.docs-flow-strip__title {
  display:flex; align-items:center; gap:8px; color:var(--docs-flow-strip-title-fg, var(--docs-ink, #1f1f1f));
  font-size:max(12px,var(--docs-flow-strip-title-size, 13.5px)); font-weight:600; line-height:1.3;
}
.docs-flow-strip__tile {
  display:inline-flex; flex:none; align-items:center; justify-content:center; width:16px; height:16px;
  border-radius:2px; background:var(--docs-fam-flow-solid, #287c55); color:var(--docs-tile-glyph, #ffffff);
}
.docs-flow-strip__tile svg { display:block; width:11px; height:11px; }
.docs-flow-strip__cards {
  display:grid; grid-template-columns:repeat(var(--fs-cols, 3),minmax(0,1fr));
  gap:12px var(--fs-gap); margin:0; padding:0; list-style:none;
}
.docs-flow-strip__card {
  position:relative; min-width:0; padding:var(--fs-pad);
  border:1px solid var(--docs-flow-strip-card-border, var(--docs-rule, #e6e5e3)); border-radius:var(--radius, 2px);
  background:var(--docs-flow-strip-card-bg, var(--docs-panel, #f8f8f7));
}
/* the arrow: a line through the column gap and a chevron at its end, level with the name */
.docs-flow-strip__card::before, .docs-flow-strip__card::after { position:absolute; box-sizing:content-box; top:calc(var(--fs-pad) + 9px); content:""; }
.docs-flow-strip__card::before { left:calc(-1 * var(--fs-gap) + 7px); width:calc(var(--fs-gap) - 14px); border-top:var(--fs-stroke) solid var(--fs-arrow); }
.docs-flow-strip__card::after {
  left:-11px; width:5px; height:5px; margin-top:-3px;
  border-top:var(--fs-stroke) solid var(--fs-arrow); border-right:var(--fs-stroke) solid var(--fs-arrow); transform:rotate(45deg);
}
.docs-flow-strip__cards > .docs-flow-strip__card:first-child::before, .docs-flow-strip__cards > .docs-flow-strip__card:first-child::after,
.docs-flow-strip__cards[data-cols="3"] > .docs-flow-strip__card:nth-child(3n+1)::before, .docs-flow-strip__cards[data-cols="3"] > .docs-flow-strip__card:nth-child(3n+1)::after,
.docs-flow-strip__cards[data-cols="4"] > .docs-flow-strip__card:nth-child(4n+1)::before, .docs-flow-strip__cards[data-cols="4"] > .docs-flow-strip__card:nth-child(4n+1)::after { display:none; }
.docs-flow-strip__head { display:flex; align-items:baseline; gap:8px; min-width:0; }
.docs-flow-strip__num {
  flex:none; color:var(--docs-flow-strip-num-fg, var(--docs-fam-flow, #26744f));
  font-family:var(--docs-font-code, ui-monospace, monospace); font-size:12px; font-weight:400; line-height:1;
}
.docs-flow-strip__name {
  min-width:0; color:var(--docs-flow-strip-name-fg, var(--docs-ink, #1f1f1f)); overflow-wrap:anywhere;
  font-family:var(--docs-font-code, ui-monospace, monospace); font-size:max(12px,var(--docs-flow-strip-name-size, 13px)); font-weight:500; line-height:1.4;
}
.docs-flow-strip__detail, .docs-flow-strip__caption { font-size:max(12px,var(--docs-flow-strip-text-size, 13.5px)); line-height:1.5; }
.docs-flow-strip__detail { margin-top:4px; }
.docs-flow-strip__caption { color:var(--fs-muted); }
/* typed chips: one soft neutral chip, the text colour says what the code is */
.docs-flow-strip__chip {
  padding:.1em .3em; border-radius:3px; background:var(--docs-flow-strip-chip-bg, var(--docs-chip-bg, #ebebe9));
  font-family:var(--docs-font-code, ui-monospace, monospace); font-size:12px; white-space:nowrap;
  box-decoration-break:clone; -webkit-box-decoration-break:clone;
}
${typedChipColorCss(".docs-flow-strip__chip")}
/* inside the (already mono) step name a chip is just the name */
.docs-flow-strip__name .docs-flow-strip__chip { padding:0; background:none; color:inherit; font-size:inherit; white-space:normal; }
@container docs-flow-strip (max-width: 640px) {
  .docs-flow-strip__cards[data-cols="3"], .docs-flow-strip__cards[data-cols="4"] { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .docs-flow-strip__cards[data-cols="3"] > .docs-flow-strip__card:nth-child(n)::before, .docs-flow-strip__cards[data-cols="3"] > .docs-flow-strip__card:nth-child(n)::after,
  .docs-flow-strip__cards[data-cols="4"] > .docs-flow-strip__card:nth-child(n)::before, .docs-flow-strip__cards[data-cols="4"] > .docs-flow-strip__card:nth-child(n)::after { display:block; }
  .docs-flow-strip__cards[data-cols="3"] > .docs-flow-strip__card:nth-child(2n+1)::before, .docs-flow-strip__cards[data-cols="3"] > .docs-flow-strip__card:nth-child(2n+1)::after,
  .docs-flow-strip__cards[data-cols="4"] > .docs-flow-strip__card:nth-child(2n+1)::before, .docs-flow-strip__cards[data-cols="4"] > .docs-flow-strip__card:nth-child(2n+1)::after { display:none; }
}
@container docs-flow-strip (max-width: 400px) {
  .docs-flow-strip__cards[data-cols] { grid-template-columns:minmax(0,1fr); }
  .docs-flow-strip__cards[data-cols] > .docs-flow-strip__card:nth-child(n)::before, .docs-flow-strip__cards[data-cols] > .docs-flow-strip__card:nth-child(n)::after { display:none; }
}
`;
