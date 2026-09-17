"use client";

import { useEffect, type ReactNode } from "react";
import type { ProcessOutlineNode } from "@codecaine-ai/docs-model";

export const LABEL = "Process Outline";
export const AGENT_DESCRIPTION =
  "An ordered process outline rendered from a typed recursive step tree: { steps: { text; kind?: 'step' | 'note'; steps? }[] }. Children are ordered substeps, `kind: \"note\"` leaves are clarification notes (plain bullet lines off the rail), and backticks in text render as code chips. Use it to explain how a process decomposes from phases into substeps; a heading above carries any title, canvas covers spatial relationships, and sequence covers exact exchanges.";

const STYLE_ID = "docs-process-outline-style";
const PROCESS_OUTLINE_CSS = `
.docs-process-outline {
  --po-line: var(--docs-process-outline-line-height, 21px);
  --po-note-line: var(--docs-process-outline-note-line-height, 18px);
  --po-gap: var(--docs-process-outline-row-gap, 9px);
  --po-root-gap: var(--docs-process-outline-root-gap, 22px);
  --po-indent: var(--docs-process-outline-indent, 36px);
  --po-c: var(--docs-process-outline-rail, color-mix(in srgb, var(--foreground) 35%, var(--border)));
  width:100%; min-width:0; color:var(--docs-process-outline-ink,var(--foreground));
  font-family:var(--docs-font-code,ui-monospace,"SF Mono",SFMono-Regular,Menlo,monospace);
  font-size:max(12px,var(--docs-process-outline-text-size,13px)); line-height:var(--po-line);
}
.docs-process-outline__flow {
  position:relative; padding:14px 16px 15px;
  border-block:1px solid color-mix(in srgb,var(--border) 72%,transparent);
  border-radius:calc(var(--radius) * .65);
  background:linear-gradient(90deg,color-mix(in srgb,var(--muted) 18%,transparent),transparent 24%);
}
.docs-process-outline__flow>.docs-process-outline__node+.docs-process-outline__node { margin-top:var(--po-root-gap); }
.docs-process-outline__line { position:relative; max-width:min(92ch,100%); min-width:0; overflow-wrap:anywhere; line-height:var(--po-line); }
.docs-process-outline__node>.docs-process-outline__line { font-weight:var(--docs-process-outline-step-weight,400); }
.docs-process-outline__flow>.docs-process-outline__node>.docs-process-outline__line {
  font-size:max(13px,var(--docs-process-outline-root-text-size,14px));
  font-weight:var(--docs-process-outline-root-weight,680); letter-spacing:-.012em;
}
.docs-process-outline__node--depth-one>.docs-process-outline__line { font-weight:var(--docs-process-outline-branch-weight,560); }
.docs-process-outline__node--deep>.docs-process-outline__line { color:var(--docs-process-outline-deep-ink,color-mix(in srgb,currentColor 78%,transparent)); }
.docs-process-outline__children {
  position:relative; display:flex; flex-direction:column; gap:var(--po-gap);
  margin-left:5px; padding-top:var(--po-gap); padding-left:var(--po-indent);
}
.docs-process-outline__children>.docs-process-outline__node { position:relative; }
.docs-process-outline__children>.docs-process-outline__node::before {
  position:absolute; top:calc(-1 * var(--po-gap)); left:calc(-1 * var(--po-indent));
  width:calc(var(--po-indent) - 8px); height:calc(var(--po-gap) + var(--po-line)/2);
  border-bottom:1px solid var(--po-c); border-left:1px solid var(--po-c);
  border-bottom-left-radius:calc(var(--radius) * .5); content:"";
}
.docs-process-outline__children>.docs-process-outline__node:not(:last-child)::after {
  position:absolute; top:calc(-1 * var(--po-gap)); bottom:calc(-1 * var(--po-gap));
  left:calc(-1 * var(--po-indent)); border-left:1px solid var(--po-c); content:"";
}
.docs-process-outline__children>.docs-process-outline__node>.docs-process-outline__line { padding-left:2px; }
.docs-process-outline__children>.docs-process-outline__node>.docs-process-outline__line::before {
  position:absolute; top:calc(var(--po-line)/2 - 3px); left:-10px; width:6px; height:6px;
  border-top:1px solid var(--po-c); border-right:1px solid var(--po-c); content:""; transform:rotate(45deg);
}
.docs-process-outline__keyword { color:var(--docs-process-outline-keyword-fg,inherit); font-weight:700; }
.docs-process-outline__code {
  border:1px solid color-mix(in srgb,var(--po-c) 20%,transparent); border-radius:calc(var(--radius) * .45);
  background:color-mix(in srgb,var(--po-c) 10%,var(--docs-process-outline-code-bg,transparent));
  padding:1px 4px; color:color-mix(in srgb,var(--po-c) 64%,currentColor);
  box-decoration-break:clone; -webkit-box-decoration-break:clone;
}
.docs-process-outline__trace {
  display:inline-block; margin-left:7px; border:1px solid color-mix(in srgb,var(--po-c) 28%,transparent);
  border-radius:999px; background:color-mix(in srgb,var(--po-c) 10%,var(--docs-process-outline-trace-bg,transparent));
  padding:0 5px; vertical-align:.08em; color:color-mix(in srgb,var(--po-c) 70%,currentColor);
  font-size:max(12px,var(--docs-process-outline-trace-text-size,12px)); font-weight:550; line-height:1.35;
  text-transform:lowercase; letter-spacing:.025em;
}
.docs-process-outline__node--note { margin:0 0 1px; }
.docs-process-outline__note-card {
  --po-line:var(--po-note-line); display:block; max-width:min(82ch,100%); margin-left:8px;
  padding:1px 0 1px 8px; border-left:1px solid color-mix(in srgb,var(--po-c) 35%,transparent);
  color:var(--docs-process-outline-note-fg,color-mix(in srgb,var(--docs-process-outline-ink,var(--foreground)) 72%,transparent));
  font-size:max(12px,var(--docs-process-outline-note-text-size,12px)); font-weight:400; line-height:var(--po-line);
}
.docs-process-outline__note-bullet { position:relative; padding-left:12px; overflow-wrap:anywhere; }
.docs-process-outline__note-bullet+.docs-process-outline__note-bullet { margin-top:3px; }
.docs-process-outline__note-bullet::before {
  position:absolute; top:calc(var(--po-line)/2 - 1.5px); left:1px; width:3px; height:3px;
  border-radius:50%; background:color-mix(in srgb,var(--po-c) 58%,currentColor); content:"";
}
.docs-process-outline__children>.docs-process-outline__node--note::before,
.docs-process-outline__children>.docs-process-outline__node--note>.docs-process-outline__line::before { display:none; }
.docs-process-outline__children>.docs-process-outline__node:not(:has(~.docs-process-outline__node:not(.docs-process-outline__node--note)))::after { display:none; }
.docs-process-outline [data-process-outline-step-editing="true"] { border-radius:3px; outline:1px solid color-mix(in srgb,var(--po-c) 45%,transparent); outline-offset:2px; }
.docs-process-outline [data-process-outline-step-selected="true"] {
  border-radius:3px; background:color-mix(in srgb,var(--po-c) 15%,transparent);
  box-shadow:0 0 0 2px color-mix(in srgb,var(--po-c) 15%,transparent);
}
.docs-process-outline__empty { color:var(--muted-foreground); font-size:max(12px,var(--docs-process-outline-empty-text-size,12px)); }
@media(max-width:520px) {
  .docs-process-outline { --po-indent:22px; --po-gap:8px; --po-root-gap:18px; }
  .docs-process-outline__flow { padding:12px 8px 13px; }
  .docs-process-outline__line { max-width:100%; }
  .docs-process-outline__note-card { margin-left:2px; padding-left:6px; }
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
  return <section className="not-prose my-4 w-full overflow-x-auto" data-docs-block-type="process-outline" data-source-id={id}><style data-variator-tokens>{"[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) [data-process-outline-depth=\"1\"]{--po-c:#527b9d !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) [data-process-outline-depth=\"2\"]{--po-c:#568365 !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) [data-process-outline-depth=\"3\"]{--po-c:#876797 !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) [data-process-outline-depth=\"4\"]{--po-c:#99723f !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) [data-process-outline-depth=\"5\"]{--po-c:#438285 !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) [data-process-outline-depth=\"6\"]{--po-c:#94646f !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) .docs-process-outline__note-bullet::before{background-color:#737373 !important;}\n.dark [data-docs-block-type=\"process-outline\"] [data-process-outline-depth=\"1\"]{--po-c:#8ab5d8 !important;}\n.dark [data-docs-block-type=\"process-outline\"] [data-process-outline-depth=\"2\"]{--po-c:#92bd9c !important;}\n.dark [data-docs-block-type=\"process-outline\"] [data-process-outline-depth=\"3\"]{--po-c:#bca0cf !important;}\n.dark [data-docs-block-type=\"process-outline\"] [data-process-outline-depth=\"4\"]{--po-c:#d1b180 !important;}\n.dark [data-docs-block-type=\"process-outline\"] [data-process-outline-depth=\"5\"]{--po-c:#83bdc0 !important;}\n.dark [data-docs-block-type=\"process-outline\"] [data-process-outline-depth=\"6\"]{--po-c:#d0a0ac !important;}\n.dark [data-docs-block-type=\"process-outline\"] .docs-process-outline{--docs-process-outline-note-fg:#dedbd5 !important;}\n.dark [data-docs-block-type=\"process-outline\"] .docs-process-outline__note-bullet::before{background-color:#dedbd5 !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) .docs-process-outline__children > .docs-process-outline__node::before{border-left-width:1.5px !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) .docs-process-outline__children > .docs-process-outline__node::before{border-bottom-width:1.5px !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) .docs-process-outline__children > .docs-process-outline__node::after{border-left-width:1.5px !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) .docs-process-outline__children > .docs-process-outline__node > .docs-process-outline__line::before{border-top-width:1.5px !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) .docs-process-outline__children > .docs-process-outline__node > .docs-process-outline__line::before{border-right-width:1.5px !important;}[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) .docs-process-outline{--docs-process-outline-stroke:1.5px !important;}\n.dark [data-docs-block-type=\"process-outline\"] .docs-process-outline__children > .docs-process-outline__node::before{border-left-width:1.5px !important;}\n.dark [data-docs-block-type=\"process-outline\"] .docs-process-outline__children > .docs-process-outline__node::before{border-bottom-width:1.5px !important;}\n.dark [data-docs-block-type=\"process-outline\"] .docs-process-outline__children > .docs-process-outline__node::after{border-left-width:1.5px !important;}\n.dark [data-docs-block-type=\"process-outline\"] .docs-process-outline__children > .docs-process-outline__node > .docs-process-outline__line::before{border-top-width:1.5px !important;}\n.dark [data-docs-block-type=\"process-outline\"] .docs-process-outline__children > .docs-process-outline__node > .docs-process-outline__line::before{border-right-width:1.5px !important;}.dark [data-docs-block-type=\"process-outline\"] .docs-process-outline{--docs-process-outline-stroke:1.5px !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) .docs-process-outline__note-card{border-left-color:#737373 !important;}\n.dark [data-docs-block-type=\"process-outline\"] .docs-process-outline__note-card{border-left-color:#bca0cf !important;}\n[data-docs-block-type=\"process-outline\"]:not(.dark [data-docs-block-type=\"process-outline\"]) .docs-process-outline{--docs-process-outline-note-fg:#302f2c !important;}"}</style>
    <div className="docs-process-outline font-mono">
      {steps.length>0?<div className="docs-process-outline__flow" data-process-outline-flow="true">{renderNodes(steps,"root",[],edit)}</div>:(edit?.renderEmpty?.()??<div className="docs-process-outline__empty" data-process-outline-empty="true">empty process outline — no steps yet</div>)}
    </div>
  </section>;
}
