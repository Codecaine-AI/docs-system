"use client";

import { useEffect, type ReactNode } from "react";
import type { ProcessOutlineNode } from "@codecaine-ai/docs-model";

export const LABEL = "Process Outline";
export const AGENT_DESCRIPTION =
  "An ordered process outline rendered from a typed recursive step tree: { steps: { text; kind?: 'step' | 'note'; steps? }[] }. Children are ordered substeps, `kind: \"note\"` leaves are clarification notes (plain bullet lines off the rail), and backticks in text render as code chips. Use it to explain how a process decomposes from phases into substeps; a heading above carries any title, canvas covers spatial relationships, and sequence covers exact exchanges.";

const STYLE_ID = "docs-process-outline-style";
/*
 * Every tunable value below rides a style-rail token (workbench
 * theme/theme-folders.ts "process-outline") and carries the token's DEFAULT as
 * its literal fallback, so the block renders the same with or without
 * semantic.css. Nothing here is !important and no token is re-declared inside
 * the block: a rail or theme override set on :root must always win.
 *   --po-c     the current nesting level's colour. Depth 0 takes the rail
 *              token; depths 1..6 each take their own cycle token (the approved
 *              depth palette); deeper levels inherit depth 6. Rail, elbow,
 *              arrowhead, chips, trace pill and selection all resolve from it.
 *   --po-gap   vertical gap between sibling rows, re-declared per __children
 *              level so the branch gap (children of a root step) never leaks
 *              into deeper levels and the elbow math matches the gap it sits in.
 * The -tint / -mix / -accent tokens are unitless percentages multiplied by 1%
 * at the use site, where --po-c exists. Step, note, trace and empty text keep
 * the approved 12px floor (13px for the root line).
 * At <=520px the spacing tokens are CAPPED (min()) rather than replaced, so a
 * knob set below the compact value still applies on a narrow screen.
 */
const PROCESS_OUTLINE_CSS = `
.docs-process-outline {
  --po-line: var(--docs-process-outline-line-height, 22px);
  --po-note-line: var(--docs-process-outline-note-line-height, 17px);
  --po-row-gap: var(--docs-process-outline-row-gap, 12px);
  --po-branch-gap: var(--docs-process-outline-branch-gap, 12px);
  --po-root-gap: var(--docs-process-outline-root-gap, 30px);
  --po-indent: var(--docs-process-outline-indent, 46px);
  --po-arrow-gap: var(--docs-process-outline-arrow-gap, 2px);
  --po-arrow: var(--docs-process-outline-arrow-size, 6px);
  --po-stroke: var(--docs-process-outline-stroke, 1.5px);
  --po-pad-y: var(--docs-process-outline-pad-y, 14px);
  --po-pad-x: var(--docs-process-outline-pad-x, 16px);
  --po-note-inset: var(--docs-process-outline-note-inset, 8px);
  --po-note-rule-gap: var(--docs-process-outline-note-rule-gap, 8px);
  --po-note-fg: var(--docs-process-outline-note-fg, #302f2c);
  --po-note-rule: var(--docs-process-outline-note-rule, #737373);
  --po-note-bullet: var(--docs-process-outline-note-bullet, #737373);
  --po-gap: var(--po-row-gap);
  --po-c: var(--docs-process-outline-rail, color-mix(in srgb, var(--foreground) 35%, var(--border)));
  width:100%; min-width:0; color:var(--docs-process-outline-ink,var(--foreground));
  font-family:var(--docs-font-code,ui-monospace,"SF Mono",SFMono-Regular,Menlo,monospace);
  font-size:max(12px,var(--docs-process-outline-text-size, 12.5px)); line-height:var(--po-line);
}
.dark .docs-process-outline {
  --po-note-fg: var(--docs-process-outline-note-fg, #dedbd5);
  --po-note-rule: var(--docs-process-outline-note-rule, #bca0cf);
  --po-note-bullet: var(--docs-process-outline-note-bullet, #dedbd5);
}
.docs-process-outline [data-process-outline-depth="1"] { --po-c: var(--docs-process-outline-cycle-1, #527b9d); }
.docs-process-outline [data-process-outline-depth="2"] { --po-c: var(--docs-process-outline-cycle-2, #568365); }
.docs-process-outline [data-process-outline-depth="3"] { --po-c: var(--docs-process-outline-cycle-3, #876797); }
.docs-process-outline [data-process-outline-depth="4"] { --po-c: var(--docs-process-outline-cycle-4, #99723f); }
.docs-process-outline [data-process-outline-depth="5"] { --po-c: var(--docs-process-outline-cycle-5, #438285); }
.docs-process-outline [data-process-outline-depth="6"] { --po-c: var(--docs-process-outline-cycle-6, #94646f); }
.dark .docs-process-outline [data-process-outline-depth="1"] { --po-c: var(--docs-process-outline-cycle-1, #8ab5d8); }
.dark .docs-process-outline [data-process-outline-depth="2"] { --po-c: var(--docs-process-outline-cycle-2, #92bd9c); }
.dark .docs-process-outline [data-process-outline-depth="3"] { --po-c: var(--docs-process-outline-cycle-3, #bca0cf); }
.dark .docs-process-outline [data-process-outline-depth="4"] { --po-c: var(--docs-process-outline-cycle-4, #d1b180); }
.dark .docs-process-outline [data-process-outline-depth="5"] { --po-c: var(--docs-process-outline-cycle-5, #83bdc0); }
.dark .docs-process-outline [data-process-outline-depth="6"] { --po-c: var(--docs-process-outline-cycle-6, #d0a0ac); }
.docs-process-outline__flow {
  position:relative; padding:var(--po-pad-y) var(--po-pad-x) calc(var(--po-pad-y) + 1px);
  border-block:var(--docs-process-outline-border-width, 1px) solid var(--docs-process-outline-border,color-mix(in srgb,var(--border) 72%,transparent));
  border-radius:var(--radius);
  background:linear-gradient(90deg,color-mix(in srgb,var(--muted) 18%,transparent),transparent 24%);
}
.docs-process-outline__flow>.docs-process-outline__node+.docs-process-outline__node { margin-top:var(--po-root-gap); }
.docs-process-outline__line { position:relative; max-width:min(92ch,100%); min-width:0; overflow-wrap:anywhere; line-height:var(--po-line); }
.docs-process-outline__node>.docs-process-outline__line { font-weight:var(--docs-process-outline-step-weight, 400); }
.docs-process-outline__flow>.docs-process-outline__node>.docs-process-outline__line {
  font-size:max(13px,var(--docs-process-outline-root-text-size, 13.5px));
  font-weight:var(--docs-process-outline-root-weight, 650); letter-spacing:-.012em;
}
.docs-process-outline__node--depth-one>.docs-process-outline__line { font-weight:var(--docs-process-outline-branch-weight, 400); }
.docs-process-outline__node--deep>.docs-process-outline__line { color:var(--docs-process-outline-deep-ink,color-mix(in srgb,currentColor 78%,transparent)); }
.docs-process-outline__children {
  --po-gap: var(--po-row-gap);
  position:relative; display:flex; flex-direction:column; gap:var(--po-gap);
  margin-left:5px; padding-top:var(--po-gap); padding-left:var(--po-indent);
}
.docs-process-outline__flow>.docs-process-outline__node>.docs-process-outline__children { --po-gap: var(--po-branch-gap); }
.docs-process-outline__children>.docs-process-outline__node { position:relative; }
.docs-process-outline__children>.docs-process-outline__node::before {
  position:absolute; top:calc(-1 * var(--po-gap)); left:calc(-1 * var(--po-indent));
  width:calc(var(--po-indent) - 8px); height:calc(var(--po-gap) + var(--po-line)/2);
  border-bottom:var(--po-stroke) solid var(--po-c); border-left:var(--po-stroke) solid var(--po-c);
  border-bottom-left-radius:calc(var(--radius) * .5); content:"";
}
.docs-process-outline__children>.docs-process-outline__node:not(:last-child)::after {
  position:absolute; top:calc(-1 * var(--po-gap)); bottom:calc(-1 * var(--po-gap));
  left:calc(-1 * var(--po-indent)); border-left:var(--po-stroke) solid var(--po-c); content:"";
}
.docs-process-outline__children>.docs-process-outline__node>.docs-process-outline__line { padding-left:var(--po-arrow-gap); }
.docs-process-outline__children>.docs-process-outline__node>.docs-process-outline__line::before {
  position:absolute; top:calc(var(--po-line)/2 - var(--po-arrow)/2); left:calc(-1.2 * var(--po-arrow) - 2.8px);
  width:var(--po-arrow); height:var(--po-arrow);
  border-top:var(--po-stroke) solid var(--po-c); border-right:var(--po-stroke) solid var(--po-c); content:""; transform:rotate(45deg);
}
.docs-process-outline__keyword { color:var(--docs-process-outline-keyword-fg,inherit); font-weight:var(--docs-process-outline-keyword-weight, 700); }
.docs-process-outline__code {
  border:1px solid color-mix(in srgb,var(--po-c) 20%,transparent); border-radius:var(--radius);
  background:color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-chip-tint, 10) * 1%),var(--docs-process-outline-code-bg,transparent));
  padding:1px 4px; color:color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-chip-ink-mix, 64) * 1%),currentColor);
  box-decoration-break:clone; -webkit-box-decoration-break:clone;
}
.docs-process-outline__trace {
  display:inline-block; margin-left:7px; border:1px solid color-mix(in srgb,var(--po-c) 28%,transparent);
  border-radius:999px; background:color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-trace-tint, 10) * 1%),var(--docs-process-outline-trace-bg,transparent));
  padding:0 5px; vertical-align:.08em; color:color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-trace-ink-mix, 70) * 1%),currentColor);
  font-size:max(12px,var(--docs-process-outline-trace-text-size, 12px)); font-weight:550; line-height:1.35;
  text-transform:lowercase; letter-spacing:.025em;
}
.docs-process-outline__node--note { margin:0 0 1px; }
.docs-process-outline__note-card {
  --po-line:var(--po-note-line); display:block; max-width:min(82ch,100%); margin-left:var(--po-note-inset);
  border:var(--docs-process-outline-note-border-width, 0px) solid var(--docs-process-outline-note-border,var(--border));
  border-left:var(--docs-process-outline-note-rule-width, 1px) solid color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-note-accent, 0) * 1%),var(--po-note-rule));
  background:var(--docs-process-outline-note-bg,transparent);
  padding:var(--docs-process-outline-note-pad-y, 1px) var(--docs-process-outline-note-pad-x, 0px) var(--docs-process-outline-note-pad-y, 1px) calc(var(--po-note-rule-gap) + var(--docs-process-outline-note-pad-x, 0px));
  color:var(--po-note-fg);
  font-size:max(12px,var(--docs-process-outline-note-text-size, 12px)); font-weight:400; line-height:var(--po-line);
}
.docs-process-outline__note-bullet { position:relative; padding-left:12px; overflow-wrap:anywhere; }
.docs-process-outline__note-bullet+.docs-process-outline__note-bullet { margin-top:3px; }
.docs-process-outline__note-bullet::before {
  position:absolute; top:calc(var(--po-line)/2 - 1.5px); left:1px; width:3px; height:3px;
  border-radius:50%; background:color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-note-accent, 0) * 1%),var(--po-note-bullet)); content:"";
}
.docs-process-outline__children>.docs-process-outline__node--note::before,
.docs-process-outline__children>.docs-process-outline__node--note>.docs-process-outline__line::before { display:none; }
.docs-process-outline__children>.docs-process-outline__node:not(:has(~.docs-process-outline__node:not(.docs-process-outline__node--note)))::after { display:none; }
.docs-process-outline [data-process-outline-step-editing="true"] { border-radius:var(--radius); outline:var(--docs-process-outline-focus-ring, 1px) solid color-mix(in srgb,var(--po-c) 45%,transparent); outline-offset:2px; }
.docs-process-outline [data-process-outline-step-selected="true"] {
  border-radius:var(--radius); background:color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-select-tint, 15) * 1%),var(--docs-process-outline-select-bg,transparent));
  box-shadow:0 0 0 var(--docs-process-outline-select-pad, 2px) color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-select-tint, 15) * 1%),var(--docs-process-outline-select-bg,transparent));
}
.docs-process-outline__empty { color:var(--muted-foreground); font-size:max(12px,var(--docs-process-outline-empty-text-size, 12px)); }
@media(max-width:520px) {
  .docs-process-outline {
    --po-indent: min(22px, var(--docs-process-outline-indent, 46px));
    --po-row-gap: min(8px, var(--docs-process-outline-row-gap, 12px));
    --po-branch-gap: min(8px, var(--docs-process-outline-branch-gap, 12px));
    --po-root-gap: min(18px, var(--docs-process-outline-root-gap, 30px));
    --po-pad-y: min(12px, var(--docs-process-outline-pad-y, 14px));
    --po-pad-x: min(8px, var(--docs-process-outline-pad-x, 16px));
    --po-note-inset: min(2px, var(--docs-process-outline-note-inset, 8px));
    --po-note-rule-gap: min(6px, var(--docs-process-outline-note-rule-gap, 8px));
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
    ? <span key={index} className="docs-process-outline__code" data-process-outline-code="true">{segment}</span>
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
function renderNode(node: ProcessOutlineNode, path: string, indexPath: readonly number[], edit?: ProcessOutlineEditHooks): ReactNode {
  const depthClass=node.depth===1?" docs-process-outline__node--depth-one":node.depth>=3?" docs-process-outline__node--deep":"";
  return <div key={path} className={`docs-process-outline__node${depthClass}`} data-process-outline-depth={node.depth} data-process-outline-node="true" {...(node.trace?{"data-process-outline-trace":"true"}:{})}>
    <div className="docs-process-outline__line">{lineContent(node,indexPath,edit)}{node.trace?<span className="docs-process-outline__trace" data-process-outline-trace-pill="true">trace</span>:null}</div>
    {node.children.length>0?<div className="docs-process-outline__children">{renderNodes(node.children,path,indexPath,edit)}</div>:null}
  </div>;
}

export function ProcessOutlineDocsBlock({ id, steps, edit }: { id:string; steps:ProcessOutlineNode[]; edit?:ProcessOutlineEditHooks }) {
  useEffect(()=>{ injectProcessOutlineStyles(); },[]);
  return <section className="not-prose my-4 w-full overflow-x-auto" data-docs-block-type="process-outline" data-source-id={id}>
    <div className="docs-process-outline font-mono">
      {steps.length>0?<div className="docs-process-outline__flow" data-process-outline-flow="true">{renderNodes(steps,"root",[],edit)}</div>:(edit?.renderEmpty?.()??<div className="docs-process-outline__empty" data-process-outline-empty="true">empty process outline — no steps yet</div>)}
    </div>
  </section>;
}
