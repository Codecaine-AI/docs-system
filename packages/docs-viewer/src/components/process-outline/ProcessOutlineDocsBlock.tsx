"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { ProcessOutlineNode } from "@codecaine-ai/docs-model";
import { chipKind, typedChipVsCodeColorCss } from "../typed-chip";
import { chipBreaks } from "../mono-breaks";
import { scheduleProcessOutlineEqualize, trackProcessOutline } from "./equal-width";

export const LABEL = "Process Outline";
export const AGENT_DESCRIPTION =
  "An ordered process outline rendered from a typed recursive step tree: { steps: { text; kind?: 'step' | 'note'; steps? }[] }. Each root step draws as a panel whose head names the process; its children are ordered substeps on the rail, `kind: \"note\"` leaves are clarification notes (italic comment-coloured asides behind a `//` marker, aligned with their sibling steps and off the rail), and backticks in text render as typed code chips. Use it to explain how a process decomposes from phases into substeps; canvas covers spatial relationships, and sequence covers exact exchanges.";

const STYLE_ID = "docs-process-outline-style";
/*
 * Theme-lab look (2026-10-02), in VS Code colours: every root step is a
 * panel whose head names it (family tile + the root text). The panel follows
 * the page (light on the light page, dark on the dark page) and its colours
 * are the VS Code theme for that mode: Light+ on light, Dark+ on dark. The
 * steps below are sans text in the page ink on neutral 1px rails ending in
 * plain file-tree elbows (a short tick, no arrowhead), and depth reads from
 * indent. Phases (first-level steps with substeps) read in the brighter
 * title ink at the branch weight and are spaced apart by the branch gap.
 * Loop keywords take the control-flow colour (coloured, not also bold),
 * backtick chips are typed (typed-chip.ts, Light+ / Dark+), notes are italic
 * comment-coloured asides behind a `//` marker, and a trace mark is a quiet
 * mono tag. Consecutive outlines share one width (equal-width.ts).
 *
 * Every tunable value rides a style-rail token (workbench theme/theme-folders.ts
 * "process-outline") and carries the token's LIGHT default as its literal
 * fallback, so the block renders the same with or without semantic.css.
 * Nothing here is !important and no token is re-declared inside the block: a
 * rail or theme override set on :root must always win.
 *   --po-c     the nesting level's colour. Depths 1..6 each take their own
 *              cycle token; deeper levels inherit depth 6. It tints the note
 *              accent and the selection, never a rail or an elbow.
 *   --po-gap   vertical gap between sibling rows, re-declared per __children
 *              level so a phase gap never leaks into deeper levels and the
 *              elbow math matches the gap it sits in.
 * The -accent / -tint knobs are unitless percentages multiplied by 1% at the
 * use site, where --po-c exists. Text keeps the 12px floor (13px for the title).
 * At <=520px the spacing tokens are CAPPED (min()) rather than replaced, so a
 * knob set below the compact value still applies on a narrow screen.
 */
const PROCESS_OUTLINE_CSS = `
.docs-process-outline {
  --po-line: var(--docs-process-outline-line-height, 24px);
  --po-note-line: var(--docs-process-outline-note-line-height, 21px);
  --po-row-gap: var(--docs-process-outline-row-gap, 4px);
  --po-branch-gap: var(--docs-process-outline-branch-gap, 16px);
  --po-root-gap: var(--docs-process-outline-root-gap, 12px);
  --po-indent: var(--docs-process-outline-indent, 28px);
  --po-arrow-gap: var(--docs-process-outline-arrow-gap, 4px);
  --po-stroke: var(--docs-process-outline-stroke, 1.5px);
  --po-pad-y: var(--docs-process-outline-pad-y, 12px);
  --po-pad-x: var(--docs-process-outline-pad-x, 12px);
  --po-note-inset: var(--docs-process-outline-note-inset, 0px);
  --po-note-rule-gap: var(--docs-process-outline-note-rule-gap, 0px);
  /* the rail hangs 7px in from the parent's text, under its first letters (the
     root rail under the tile); each elbow's tick stops arrow-gap short of the text */
  --po-rail-x: 7px;
  --po-gap: var(--po-row-gap);
  /* shrink to content, cap at the lane: steps wrap at a 60ch prose measure */
  width:fit-content; max-width:100%; min-width:0;
  font-family:var(--font-tx02, ui-sans-serif, system-ui, sans-serif);
  font-size:max(var(--ds-font-size-ui-xs),var(--docs-process-outline-text-size, 13.5px)); line-height:var(--po-line);
}
.docs-process-outline {
  --po-note-fg: var(--docs-process-outline-note-fg, #008000);
  --po-note-rule: var(--docs-process-outline-note-rule, #e6e5e3);
  --po-note-bullet: var(--docs-process-outline-note-bullet, #008000);
  --po-rail: var(--docs-process-outline-rail, color-mix(in srgb,#1f1f1f 45%,#f8f8f7));
  --po-title: var(--docs-process-outline-title-fg, #1f1f1f);
  --po-c: var(--po-rail);
  color:var(--docs-process-outline-ink, #2a2a2a);
}
.docs-process-outline [data-process-outline-depth="1"] { --po-c: var(--docs-process-outline-cycle-1, #0b6e99); }
.docs-process-outline [data-process-outline-depth="2"] { --po-c: var(--docs-process-outline-cycle-2, #26744f); }
.docs-process-outline [data-process-outline-depth="3"] { --po-c: var(--docs-process-outline-cycle-3, #6940a5); }
.docs-process-outline [data-process-outline-depth="4"] { --po-c: var(--docs-process-outline-cycle-4, #805f01); }
.docs-process-outline [data-process-outline-depth="5"] { --po-c: var(--docs-process-outline-cycle-5, #0d7164); }
.docs-process-outline [data-process-outline-depth="6"] { --po-c: var(--docs-process-outline-cycle-6, #ad1a72); }
.docs-process-outline__flow { display:flex; flex-direction:column; gap:var(--po-root-gap); }
/* a root step is a panel: one frame, a head strip naming it, the steps below */
.docs-process-outline__node--root {
  min-width:0;
  border:var(--docs-process-outline-border-width, 1px) solid var(--docs-process-outline-border, #e6e5e3);
  border-radius:var(--radius, 2px); background:var(--docs-process-outline-bg, #f8f8f7);
}
.docs-process-outline__head {
  display:flex; align-items:flex-start; gap:var(--ds-space-2); min-height:var(--ds-space-8); padding:7px var(--po-pad-x);
  background:var(--docs-process-outline-header-bg, #f8f8f7);
}
.docs-process-outline__node--root:has(> .docs-process-outline__children) > .docs-process-outline__head { border-bottom:var(--ds-border-width-hairline) solid var(--docs-rule-soft, #efeeec); }
.docs-process-outline__tile {
  display:inline-flex; flex:none; align-items:center; justify-content:center; width:var(--ds-space-4); height:var(--ds-space-4); margin-top:1px;
  border-radius:var(--ds-radius-base); background:var(--docs-fam-flow-solid, #287c55); color:var(--docs-tile-glyph, #ffffff);
}
.docs-process-outline__tile svg { display:block; width:11px; height:11px; }
.docs-process-outline__head > .docs-process-outline__line {
  min-width:0; color:var(--po-title);
  font-size:max(var(--ds-font-size-ui-sm),var(--docs-process-outline-root-text-size, 13.5px));
  font-weight:var(--docs-process-outline-root-weight, 600); line-height:18px;
}
.docs-process-outline__line { position:relative; max-width:var(--ds-layout-lane-text); min-width:0; overflow-wrap:anywhere; line-height:var(--po-line); }
.docs-process-outline__node>.docs-process-outline__line { font-weight:var(--docs-process-outline-step-weight, 400); }
/* a phase (first level, with substeps) reads in ink at the branch weight, so each phase group starts strong;
   depth below that reads from indent only */
.docs-process-outline__node--depth-one:has(> .docs-process-outline__children)>.docs-process-outline__line { color:var(--po-title); font-weight:var(--docs-process-outline-branch-weight, 600); }
.docs-process-outline__node--deep>.docs-process-outline__line { color:var(--docs-process-outline-deep-ink, #2a2a2a); }
.docs-process-outline__children {
  --po-gap: var(--po-row-gap);
  position:relative; display:flex; flex-direction:column; gap:var(--po-gap);
  margin-left:var(--po-rail-x); padding-top:var(--po-gap); padding-left:calc(var(--po-indent) - var(--po-rail-x));
}
/* the root's children are the panel body; phases breathe, but only when they have substeps */
.docs-process-outline__node--root>.docs-process-outline__children {
  margin-left:0; padding:var(--po-pad-y) var(--po-pad-x) calc(var(--po-pad-y) + var(--ds-space-1)) calc(var(--po-pad-x) + var(--po-indent));
}
.docs-process-outline__node--root>.docs-process-outline__children:has(> .docs-process-outline__node > .docs-process-outline__children) { --po-gap: var(--po-branch-gap); }
.docs-process-outline__children>.docs-process-outline__node { position:relative; }
/* rails + elbows: one neutral for every depth, square corners */
.docs-process-outline__children>.docs-process-outline__node::before {
  position:absolute; box-sizing:border-box; top:calc(-1 * var(--po-gap)); left:calc(var(--po-rail-x) - var(--po-indent));
  width:max(0px, calc(var(--po-indent) - var(--po-rail-x) - var(--po-arrow-gap)));
  height:calc(var(--po-gap) + var(--po-line)/2 + var(--po-stroke)/2);
  border-bottom:var(--po-stroke) solid var(--po-rail); border-left:var(--po-stroke) solid var(--po-rail); content:"";
}
/* the trunk continues only toward a later step (a trailing note hangs free) */
.docs-process-outline__children>.docs-process-outline__node:has(~.docs-process-outline__node:not(.docs-process-outline__node--note))::after {
  position:absolute; top:calc(-1 * var(--po-gap)); bottom:0;
  left:calc(var(--po-rail-x) - var(--po-indent)); border-left:var(--po-stroke) solid var(--po-rail); content:"";
}
/* the first phase hangs from the head rule */
.docs-process-outline__node--root>.docs-process-outline__children>.docs-process-outline__node:first-child::before { top:calc(-1 * var(--po-pad-y)); height:calc(var(--po-pad-y) + var(--po-line)/2 + var(--po-stroke)/2); }
.docs-process-outline__node--root>.docs-process-outline__children>.docs-process-outline__node:first-child::after { top:calc(-1 * var(--po-pad-y)); }
/* loop keywords: control flow (the syntax control color, VS Code Light+ / Dark+) at a medium weight (coloured OR bold, not both) */
.docs-process-outline__keyword { color:var(--docs-process-outline-keyword-fg, #af00db); font-weight:var(--docs-process-outline-keyword-weight, 500); }
/* typed chips: one soft neutral chip, the text colour says what the code is */
.docs-process-outline__code {
  border-radius:var(--ds-radius-base); background:var(--docs-process-outline-code-bg, #ebebe9); padding:.1em .3em;
  font-family:var(--docs-font-code, ui-monospace, "SF Mono", Menlo, monospace); font-size:var(--ds-font-size-ui-xs); font-weight:var(--ds-font-weight-regular);
  box-decoration-break:clone; -webkit-box-decoration-break:clone;
}
/* chips colour like code in VS Code: Light+ on the light page, Dark+ on the dark page */
${typedChipVsCodeColorCss(".docs-process-outline__code")}
/* trace: a quiet mono tag after the text */
.docs-process-outline__trace {
  margin-left:var(--ds-space-2); vertical-align:1px; color:var(--docs-muted, #666562); white-space:nowrap;
  font-family:var(--docs-font-code, ui-monospace, "SF Mono", Menlo, monospace);
  font-size:max(var(--ds-font-size-ui-xs),var(--docs-process-outline-trace-text-size, 12px)); font-weight:var(--ds-font-weight-regular); line-height:1;
}
/* notes: italic comment-coloured asides at the step indent, a // comment marker where an elbow would be */
.docs-process-outline__note-card {
  --po-line:var(--po-note-line); display:block; max-width:var(--ds-layout-lane-text); margin-left:var(--po-note-inset);
  border:var(--docs-process-outline-note-border-width, 0px) solid var(--docs-process-outline-note-border, #e6e5e3);
  border-left:var(--docs-process-outline-note-rule-width, 0px) solid color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-note-accent, 0) * 1%),var(--po-note-rule));
  background:var(--docs-process-outline-note-bg, transparent);
  padding:var(--docs-process-outline-note-pad-y, 2px) var(--docs-process-outline-note-pad-x, 0px) var(--docs-process-outline-note-pad-y, 2px) calc(var(--po-note-rule-gap) + var(--docs-process-outline-note-pad-x, 0px));
  color:var(--po-note-fg); font-style:italic;
  font-size:max(var(--ds-font-size-ui-xs),var(--docs-process-outline-note-text-size, 13.5px)); font-weight:var(--ds-font-weight-regular); line-height:var(--po-line);
}
.docs-process-outline__note-bullet { position:relative; overflow-wrap:anywhere; }
.docs-process-outline__note-bullet::before {
  position:absolute; top:0; right:calc(100% + 3px); content:"//";
  color:color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-note-accent, 0) * 1%),var(--po-note-bullet));
  font-family:var(--docs-font-code, ui-monospace, "SF Mono", Menlo, monospace); font-size:var(--ds-font-size-ui-xs); font-style:normal; letter-spacing:-0.15em;
  line-height:var(--po-line); white-space:nowrap; user-select:none;
}
.docs-process-outline__flow>.docs-process-outline__node--note { padding-left:var(--ds-space-3); }
.docs-process-outline__children>.docs-process-outline__node--note::before,
.docs-process-outline__children>.docs-process-outline__node--note>.docs-process-outline__line::before { display:none; }
.docs-process-outline [data-process-outline-step-editing="true"] { border-radius:var(--radius, 2px); outline:var(--docs-process-outline-focus-ring, 1px) solid var(--docs-focus-ring, #0078df); outline-offset:var(--ds-focus-ring-offset); }
.docs-process-outline [data-process-outline-step-selected="true"] {
  border-radius:var(--radius, 2px); background:color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-select-tint, 15) * 1%),var(--docs-process-outline-select-bg, transparent));
  box-shadow:0 0 0 var(--docs-process-outline-select-pad, 2px) color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-select-tint, 15) * 1%),var(--docs-process-outline-select-bg, transparent));
}
.docs-process-outline__empty { color:var(--docs-muted, #666562); font-size:max(var(--ds-font-size-ui-xs),var(--docs-process-outline-empty-text-size, 12px)); }
@media(max-width:520px) {
  .docs-process-outline {
    --po-indent: min(var(--ds-space-5), var(--docs-process-outline-indent, 28px));
    --po-row-gap: min(var(--ds-space-1), var(--docs-process-outline-row-gap, 4px));
    --po-branch-gap: min(var(--ds-space-2), var(--docs-process-outline-branch-gap, 16px));
    --po-root-gap: min(var(--ds-space-3), var(--docs-process-outline-root-gap, 12px));
    --po-pad-y: min(10px, var(--docs-process-outline-pad-y, 12px));
    --po-pad-x: min(var(--ds-space-2), var(--docs-process-outline-pad-x, 12px));
    --po-note-inset: min(var(--ds-space-0-5), var(--docs-process-outline-note-inset, 0px));
    --po-note-rule-gap: min(var(--ds-space-1-5), var(--docs-process-outline-note-rule-gap, 0px));
  }
  .docs-process-outline__line { max-width:100%; }
}
@media(prefers-reduced-motion:reduce) { .docs-process-outline * { transition:none!important; scroll-behavior:auto!important; } }
`;

function injectProcessOutlineStyles(): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(STYLE_ID);
  if (existing) { if (existing.textContent !== PROCESS_OUTLINE_CSS) existing.textContent = PROCESS_OUTLINE_CSS; return; }
  const style = document.createElement("style"); style.id = STYLE_ID; style.textContent = PROCESS_OUTLINE_CSS; document.head.appendChild(style);
}

const KEYWORD_PATTERN = /^(Repeat|While|For each)\b|\b(until)\b/g;
function renderPlainText(text: string, segmentIndex: number): ReactNode[] {
  const output: ReactNode[] = []; let cursor = 0;
  for (const match of text.matchAll(KEYWORD_PATTERN)) {
    const index = match.index ?? 0; if (index > cursor) output.push(text.slice(cursor,index));
    output.push(<strong key={`${segmentIndex}-${index}`} className="docs-process-outline__keyword" data-process-outline-keyword={match[0]}>{match[0]}</strong>);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) output.push(text.slice(cursor)); return output;
}
function renderText(text: string): ReactNode[] {
  return text.split("`").map((segment,index) => index % 2
    ? <span key={index} className="docs-process-outline__code" data-process-outline-code="true" data-chip-kind={chipKind(segment)}>{chipBreaks(segment)}</span>
    : <span key={index}>{renderPlainText(segment,index)}</span>);
}
export const renderProcessOutlineText = renderText;

export type ProcessOutlineEditHooks = {
  renderLine: (node: ProcessOutlineNode, path: readonly number[]) => ReactNode;
  renderEmpty?: () => ReactNode;
};
function lineContent(node: ProcessOutlineNode, path: readonly number[], edit?: ProcessOutlineEditHooks): ReactNode {
  return edit ? edit.renderLine(node,path) : renderText(node.text);
}
function renderNoteCard(group: ProcessOutlineNode[], path: string, start: number, indexPath: readonly number[], edit?: ProcessOutlineEditHooks): ReactNode {
  return <div key={path} className="docs-process-outline__node docs-process-outline__node--note" data-process-outline-depth={group[0].depth} data-process-outline-note="true">
    <div className="docs-process-outline__line"><div className="docs-process-outline__note-card">
      {group.map((note,index)=><div key={index} className="docs-process-outline__note-bullet" data-process-outline-note-item="true">{lineContent(note,[...indexPath,start+index],edit)}</div>)}
    </div></div>
  </div>;
}
function renderNodes(nodes: readonly ProcessOutlineNode[], basePath: string, indexPath: readonly number[], edit?: ProcessOutlineEditHooks): ReactNode[] {
  const output: ReactNode[] = [];
  for (let index=0; index<nodes.length; index+=1) {
    if (!nodes[index].note) { output.push(renderNode(nodes[index],`${basePath}-${index}`,[...indexPath,index],edit)); continue; }
    const start=index, group: ProcessOutlineNode[]=[];
    while(index<nodes.length && nodes[index].note) { group.push(nodes[index]); index+=1; }
    index-=1; output.push(renderNoteCard(group,`${basePath}-${start}`,start,indexPath,edit));
  }
  return output;
}
/** Tabler `list-tree`: the flow family's process-outline glyph. */
const TILE_GLYPH = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h11"/><path d="M12 12h8"/><path d="M15 18h5"/><path d="M5 6v.01"/><path d="M8 12v.01"/><path d="M11 18v.01"/></svg>;
function renderNode(node: ProcessOutlineNode, path: string, indexPath: readonly number[], edit?: ProcessOutlineEditHooks): ReactNode {
  const root=node.depth===0;
  const depthClass=root?" docs-process-outline__node--root":node.depth===1?" docs-process-outline__node--depth-one":node.depth>=3?" docs-process-outline__node--deep":"";
  const line=<div className="docs-process-outline__line">{lineContent(node,indexPath,edit)}{node.trace?<span className="docs-process-outline__trace" data-process-outline-trace-pill="true">trace</span>:null}</div>;
  return <div key={path} className={`docs-process-outline__node${depthClass}`} data-process-outline-depth={node.depth} data-process-outline-node="true" {...(node.trace?{"data-process-outline-trace":"true"}:{})}>
    {/* A root step names its panel: the family tile, then the root text as the title. */}
    {root?<div className="docs-process-outline__head"><span className="docs-process-outline__tile" aria-hidden="true">{TILE_GLYPH}</span>{line}</div>:line}
    {node.children.length>0?<div className="docs-process-outline__children">{renderNodes(node.children,path,indexPath,edit)}</div>:null}
  </div>;
}

export function ProcessOutlineDocsBlock({ id, steps, edit }: { id:string; steps:ProcessOutlineNode[]; edit?:ProcessOutlineEditHooks }) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(()=>{ injectProcessOutlineStyles(); },[]);
  // Consecutive outlines share the widest natural width of their run (equal-width.ts).
  useEffect(()=>trackProcessOutline(sectionRef.current),[]);
  useEffect(()=>{ scheduleProcessOutlineEqualize(); },[steps]);
  return <section ref={sectionRef} className="not-prose my-4 w-full overflow-x-auto" data-docs-block-type="process-outline" data-source-id={id}>
    <div className="docs-process-outline" data-fam="flow">
      {steps.length>0?<div className="docs-process-outline__flow" data-process-outline-flow="true">{renderNodes(steps,"root",[],edit)}</div>:(edit?.renderEmpty?.()??<div className="docs-process-outline__empty" data-process-outline-empty="true">empty process outline — no steps yet</div>)}
    </div>
  </section>;
}
