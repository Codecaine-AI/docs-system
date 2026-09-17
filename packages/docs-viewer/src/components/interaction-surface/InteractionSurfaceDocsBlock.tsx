"use client";

import type { ReactNode, CSSProperties } from "react";
import type { Field } from "@codecaine-ai/docs-model";
import { StateShapeBlock, FIELD_TOKEN_CLASS, classifyTypeText } from "../state-shape/StateShapeDocsBlock";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import { CodeLines, LinkGroup, LinkTarget, type LinkedCodeLine } from "../linked-panels";

export const INTERACTION_SURFACE_LABEL = "Interaction Surface";
export const INTERACTION_SURFACE_AGENT_DESCRIPTION =
  'Operations on state, each in a separate card with an explicit kind badge: amber Action, green-teal Query, and violet Event. State Shape content styling; Field and Type left, Signature right, and a separate softly tinted returned object with fields and example. Typed props: { title?: string; operations: Array<{ name: string; description?: string; params?: Array<{ name: string; type?: string; required?: boolean; description?: string; fields?: Param[] }>; returns?: string; returnShape?: { fields: Field[]; example?: string }; kind?: "action" | "query" | "event" }> }.';

export type InteractionSurfaceParam = Field;
export type InteractionSurfaceOperation = {
  name: string;
  description?: string;
  params?: InteractionSurfaceParam[];
  returns?: string;
  /** Explicit documentation of output fields and a JSON example; never inferred from the type name. */
  returnShape?: { fields: Field[]; example?: string };
  kind?: "action" | "query" | "event";
};

const KIND_BADGE_CLASS: Record<NonNullable<InteractionSurfaceOperation["kind"]>, string> = {
 action: "border-border bg-muted/20 text-muted-foreground",
 query: "border-border bg-muted/20 text-muted-foreground",
 event: "border-border bg-muted/20 text-muted-foreground",
};

const SIG_TOKEN_CLASS = {
  name: "font-medium text-[color:var(--docs-operations-accent)]",
  punct: "text-[color:var(--docs-interaction-sig-punct,var(--muted-foreground))]",
  optional: "text-[color:var(--docs-operations-optional)]",
  type: "text-[color:var(--docs-interaction-sig-type,var(--docs-shape-type,#0a5779))] dark:text-[color:var(--docs-interaction-sig-type,var(--docs-shape-type,#a5d3f0))]",
  returns: "text-[color:var(--docs-interaction-sig-type,var(--docs-shape-type,#0a5779))] dark:text-[color:var(--docs-interaction-sig-type,var(--docs-shape-type,#a5d3f0))]",
} as const;

function PunctToken({ text }: { text: string }) { return <span data-sig-token="punct" className={SIG_TOKEN_CLASS.punct}>{text}</span>; }

type ParamNote = { key: string; name: string; type?: string; required?: boolean; description?: string; start: number; end: number; children: ParamNote[] };
function bareVerb(name: string): string { return name.slice(name.lastIndexOf(".") + 1); }
function humanizeOperationName(name: string): string { return name.replace(/[.\-_]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }

function buildOperation(operation: InteractionSurfaceOperation, displayName: string): { lines: LinkedCodeLine[]; notes: ParamNote[] } {
  const params = operation.params ?? []; const lines: LinkedCodeLine[] = []; const notes: ParamNote[] = [];
  const nameToken = <span key="name" data-sig-token="name" className={SIG_TOKEN_CLASS.name}>{displayName}</span>;
  const returnsToken = operation.returns ? <span key="returns" data-sig-token="returns" className={SIG_TOKEN_CLASS.returns}> {"->"} {operation.returns}</span> : null;
  if (params.length === 0) { lines.push({ content: [nameToken, <PunctToken key="()" text="()" />, returnsToken] }); return { lines, notes }; }
  const emitParams = (fields: Field[], depth: number, keyPrefix: string, ancestors: readonly string[], into: ParamNote[]): void => {
    const indent = "  ".repeat(depth);
    for (const param of fields) {
      const key = `${keyPrefix}.${param.name}`; const lineKey = [key, ...ancestors]; const start = lines.length + 1;
      const note: ParamNote = { key, name: param.name, required: param.required, ...(param.type ? { type: param.type } : {}), ...(param.description ? { description: param.description } : {}), start, end: start, children: [] }; into.push(note);
      const head: ReactNode[] = [indent, <span key={key} data-sig-token="param">{param.name}</span>];
      if (param.required === false) head.push(<span key={`${key}?`} data-sig-token="optional" className={SIG_TOKEN_CLASS.optional}>?</span>);
      if (param.fields) { head.push(<PunctToken key={`${key}{`} text=": {" />); lines.push({ content: head, linkKey: lineKey }); emitParams(param.fields, depth + 1, key, lineKey, note.children); lines.push({ content: [indent, <PunctToken key={`${key}}`} text="}," />], linkKey: lineKey }); }
      else { if (param.type) head.push(<PunctToken key={`${key}:`} text=": " />, <span key={`${key}t`} data-sig-token="type" className={SIG_TOKEN_CLASS.type}>{param.type}</span>); head.push(<PunctToken key={`${key},`} text="," />); lines.push({ content: head, linkKey: lineKey }); }
      note.end = lines.length;
    }
  };
  lines.push({ content: [nameToken, <PunctToken key="(" text="(" />] }); emitParams(params, 1, operation.name, [], notes); lines.push({ content: [<PunctToken key=")" text=")" />, returnsToken] }); return { lines, notes };
}

function NoteType({ value }: { value?: string }) {
  if (!value) return <span data-note-type className={cn("text-xs", FIELD_TOKEN_CLASS.muted)}>\u2014</span>;
  const type=classifyTypeText(value);
  if(type.kind==='union')return <span data-note-type className={cn("flex flex-wrap items-center gap-1 font-mono text-xs",FIELD_TOKEN_CLASS.type)}>{type.parts.map((part,i)=>i%2===0?<span data-note-type-chip key={i} className={cn("rounded px-1.5 py-0.5",FIELD_TOKEN_CLASS.typeBg)}>{part}</span>:<span key={i} className="opacity-40">{part}</span>)}</span>;
  return <span data-note-type className={cn("break-words font-mono text-xs",FIELD_TOKEN_CLASS.type)}>{type.kind==='token'?<span data-note-type-chip className={cn("rounded px-1.5 py-0.5",FIELD_TOKEN_CLASS.typeBg)}>{value}</span>:value}</span>;
}
function NoteRow({ note, depth, last, rails }: { note: ParamNote; depth: number; last:boolean; rails:number[] }) {
  return <LinkTarget linkKey={note.key} data-param-note={note.key} data-note-indent={depth} className="relative min-w-0 px-3 py-3 text-xs motion-reduce:transition-none">
    <div data-note-name-cell style={{'--note-depth':depth} as CSSProperties}>
      {depth>0 && <><span aria-hidden data-note-branch data-note-vertical data-last={last} style={{'--note-level':depth} as CSSProperties}/><span aria-hidden data-note-branch data-note-tick/>{rails.map(level=><span key={level} aria-hidden data-note-branch data-note-vertical style={{'--note-level':level} as CSSProperties}/>)}</>}
      <div className="flex min-w-0 items-baseline gap-1.5"><span data-note-name className={cn("break-all font-mono text-[13px] font-semibold", FIELD_TOKEN_CLASS.name)}>{note.name}</span>{note.required===false && <span title="Optional field" aria-label="optional" className={cn("font-mono text-[11px] font-medium", FIELD_TOKEN_CLASS.optionalFg)}>?</span>}</div>
      {note.description && <div data-note-description className={cn("mt-1 min-w-0 text-xs leading-5", FIELD_TOKEN_CLASS.description)}>{note.description}</div>}
    </div><div data-note-type-cell className="min-w-0 pt-0.5"><NoteType value={note.type}/></div>
  </LinkTarget>;
}
function NoteGroup({ note, depth = 0, last=true, rails=[] }: { note: ParamNote; depth?: number; last?:boolean; rails?:number[] }) {
  return <div data-note-group={note.key} data-tree-depth={depth}><NoteRow note={note} depth={depth} last={last} rails={rails}/>{note.children.length>0 && <div data-note-children>{note.children.map((child,index)=><NoteGroup key={child.key} note={child} depth={depth+1} last={index===note.children.length-1} rails={depth>0&&!last?[...rails,depth]:rails}/>)}</div>}</div>;
}

function headerTitleCase(value: string): string {
  const minor = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs']);
  const acronyms = new Set(['api', 'css', 'html', 'http', 'https', 'id', 'ids', 'json', 'sdk', 'sql', 'ui', 'url', 'urls']);
  const text = value.trim().replace(/\s+/g, ' ');
  const words = [...text.matchAll(/\p{L}[\p{L}\p{N}'’]*/gu)];
  let index = 0;
  return text.replace(/\p{L}[\p{L}\p{N}'’]*/gu, (word) => {
    const lower = word.toLocaleLowerCase('en-US'), position = index++;
    if (acronyms.has(lower)) return lower.toLocaleUpperCase('en-US');
    if (position > 0 && position < words.length - 1 && minor.has(lower)) return lower;
    return lower.charAt(0).toLocaleUpperCase('en-US') + lower.slice(1);
  });
}

export function InteractionSurfaceBlock({ id, title, operations }: { id: string; title?: string; operations: InteractionSurfaceOperation[] }) {
  const bare = operations.map((operation) => bareVerb(operation.name)); const useBare = new Set(bare).size === operations.length;
  return <section data-operations-card-layout className="not-prose my-4 min-w-0 w-full overflow-hidden rounded-xl border border-solid border-[color:var(--docs-operations-rule)] bg-[color:var(--docs-interaction-bg,var(--background))]" data-docs-block-type="interaction-surface" data-source-id={id}>
    <style>{`
      [data-docs-block-type="interaction-surface"]{--docs-operations-accent:#87511e;--docs-operations-header-bg:#fbf6ee;--docs-operations-header-fg:#3f2b19;--docs-operations-rule:#d8c5ad;--docs-operations-tree:#c8a477;--docs-operations-texture:#a96e31;--docs-operations-code:#f7f7f6}
      .dark [data-docs-block-type="interaction-surface"]{--docs-operations-accent:#e0b47e;--docs-operations-header-bg:#30271e;--docs-operations-header-fg:#f3e1ca;--docs-operations-rule:#64503a;--docs-operations-tree:#806342;--docs-operations-texture:#c08a50;--docs-operations-code:#20201f}
      [data-operations-header]::before,[data-operations-header]::after{content:"";position:absolute;inset:0;pointer-events:none;mask-image:linear-gradient(90deg,transparent 22%,rgba(0,0,0,.2) 45%,#000 76%)}
      [data-operations-header]::before{opacity:.3;background:linear-gradient(105deg,transparent 46%,color-mix(in srgb,var(--docs-operations-texture) 13%,transparent) 47%,transparent 49%),repeating-radial-gradient(ellipse at 94% 52%,transparent 0 13px,color-mix(in srgb,var(--docs-operations-texture) 48%,transparent) 14px 15px,transparent 16px 24px)}
      [data-operations-header]::after{opacity:.22;background:radial-gradient(ellipse at 79% -70%,transparent 58%,var(--docs-operations-texture) 59%,transparent 63%),radial-gradient(ellipse at 88% 160%,transparent 58%,var(--docs-operations-texture) 59%,transparent 64%)}
      [data-op-sig]{background:var(--docs-operations-code)}


      [data-docs-block-type="interaction-surface"]{--note-indent:22px;--note-gap:6px;--note-y:12px;--note-x:12px}
      [data-note-group],[data-note-children]{display:contents}
      [data-note-children]{margin-left:var(--note-indent);padding-left:var(--note-gap)}
      [data-param-note],[data-note-ledger-head]{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:12px}
      [data-param-note]{padding:var(--note-y) var(--note-x);border-bottom:1px solid var(--docs-operations-rule)}
      [data-note-ledger-head]{padding:8px var(--note-x);border-bottom:1px solid var(--docs-operations-rule);font:500 10px/16px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.04em;color:var(--muted-foreground)}
      [data-note-name-cell]{position:relative;min-width:0;padding-left:calc(var(--note-depth)*var(--note-indent))}
      [data-note-name-cell]:has([data-note-tick]){padding-left:calc((var(--note-depth) - 1)*var(--note-indent) + 14px + var(--note-gap))}
      [data-note-branch]{position:absolute;pointer-events:none;border-color:var(--docs-operations-tree);border-style:solid;border-width:0}
      [data-note-vertical]{left:calc((var(--note-level) - 1)*var(--note-indent) + 6px);top:calc(-1*var(--note-y) - 1px);bottom:calc(-1*var(--note-y));border-left-width:1px}
      [data-note-vertical][data-last="true"]{bottom:auto;height:calc(var(--note-y) + 11px)}
      [data-note-tick]{left:calc((var(--note-depth) - 1)*var(--note-indent) + 6px);top:10px;width:8px;border-top-width:1px}
      [data-note-type]{color:var(--docs-operations-type);overflow-wrap:anywhere}
      [data-note-type-chip]{border-radius:4px;padding:2px 6px;background:var(--docs-operations-type-bg);box-decoration-break:clone;-webkit-box-decoration-break:clone}

      [data-docs-block-type="interaction-surface"]{--docs-operations-rule:var(--docs-shape-rule,var(--border));--docs-operations-tree:var(--docs-shape-child-rule,color-mix(in srgb,var(--foreground) 35%,var(--border)));--docs-operations-code:var(--docs-shape-bg,var(--background));--docs-operations-accent:var(--syntax-key,#0e7490);--docs-operations-type:var(--docs-shape-type,#0a5779);--docs-operations-type-bg:var(--docs-shape-type-bg,color-mix(in srgb,#0a5779 9%,transparent));--docs-operations-optional:var(--docs-shape-optional-fg,#6b4708)}
      .dark [data-docs-block-type="interaction-surface"]{--docs-operations-rule:var(--docs-shape-rule,var(--border));--docs-operations-tree:var(--docs-shape-child-rule,color-mix(in srgb,var(--foreground) 35%,var(--border)));--docs-operations-code:var(--docs-shape-bg,var(--background));--docs-operations-accent:var(--syntax-key,#67e8f9);--docs-operations-type:var(--docs-shape-type,#a5d3f0);--docs-operations-type-bg:var(--docs-shape-type-bg,color-mix(in srgb,#a5d3f0 14%,transparent));--docs-operations-optional:var(--docs-shape-optional-fg,#e8c27a)}
      [data-note-ledger-head]{background:color-mix(in srgb,var(--muted) 18%,transparent);font-weight:600;letter-spacing:.1em}
      [data-param-note]:not([data-note-indent="0"]){background:color-mix(in srgb,var(--muted) 7%,transparent)}
      [data-note-description],[data-operation-purpose]{color:var(--docs-shape-desc-fg,color-mix(in srgb,var(--foreground) 72%,transparent))}

      [data-docs-block-type="interaction-surface"]{--docs-operations-rule:var(--docs-shape-rule,var(--border));--docs-operations-tree:var(--docs-shape-child-rule,color-mix(in srgb,var(--foreground) 35%,var(--border)));--docs-operations-code:var(--docs-shape-bg,var(--background));--docs-operations-accent:var(--syntax-key,#0e7490);--docs-interaction-sig-type:var(--docs-operations-type);--docs-interaction-sig-punct:var(--muted-foreground);--docs-operations-type:var(--docs-shape-type,#0a5779);--docs-operations-type-bg:var(--docs-shape-type-bg,color-mix(in srgb,#0a5779 9%,transparent));--docs-operations-optional:var(--docs-shape-optional-fg,#6b4708)}
      .dark [data-docs-block-type="interaction-surface"]{--docs-operations-rule:var(--docs-shape-rule,var(--border));--docs-operations-tree:var(--docs-shape-child-rule,color-mix(in srgb,var(--foreground) 35%,var(--border)));--docs-operations-code:var(--docs-shape-bg,var(--background));--docs-operations-accent:var(--syntax-key,#67e8f9);--docs-interaction-sig-type:var(--docs-operations-type);--docs-interaction-sig-punct:var(--muted-foreground);--docs-operations-type:var(--docs-shape-type,#a5d3f0);--docs-operations-type-bg:var(--docs-shape-type-bg,color-mix(in srgb,#a5d3f0 14%,transparent));--docs-operations-optional:var(--docs-shape-optional-fg,#e8c27a)}
      [data-note-ledger-head]{background:color-mix(in srgb,var(--muted) 18%,transparent);font-weight:600;letter-spacing:.1em}
      [data-param-note]:not([data-note-indent="0"]){background:color-mix(in srgb,var(--muted) 7%,transparent)}
      [data-note-description],[data-operation-purpose]{color:var(--docs-shape-desc-fg,color-mix(in srgb,var(--foreground) 72%,transparent))}

      [data-operation-content]{display:grid;grid-template-columns:minmax(0,1fr);border-top:1px solid var(--docs-operations-rule)}
      [data-signature-head]{padding:8px var(--note-x);border-bottom:1px solid var(--docs-operations-rule);background:color-mix(in srgb,var(--muted) 18%,transparent);font:600 10px/16px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em;color:var(--muted-foreground)}
      [data-operation-content][data-has-fields="true"]>[data-op-sig]{border-top:1px solid var(--docs-operations-rule)}
      @media(min-width:768px){[data-operation-content][data-has-fields="true"]{grid-template-columns:minmax(0,var(--docs-pane-split,46%)) minmax(0,1fr)}[data-operation-content][data-has-fields="true"]>[data-op-sig]{align-self:start;border-top:0;border-left:1px solid var(--docs-shape-header-rule,color-mix(in srgb,var(--foreground) 65%,var(--border)))}}

      [data-docs-block-type="interaction-surface"]{--note-x:16px;border-color:var(--docs-shape-header-rule,color-mix(in srgb,var(--foreground) 65%,var(--border)));background:var(--docs-shape-bg,var(--background))}
      [data-operations-header]{border-bottom-color:var(--docs-shape-header-rule,color-mix(in srgb,var(--foreground) 65%,var(--border)));padding-inline:16px}
      [data-operations-title],[data-interaction-operation] h4{font-family:var(--font-mono,ui-monospace,monospace);font-size:14px;font-weight:700;color:var(--foreground)}
      [data-param-note],[data-note-ledger-head]{column-gap:20px}
      [data-note-name-cell]{font-size:13px}
      [data-note-ledger-head],[data-signature-head],[data-return-head]{padding:8px var(--note-x);font-family:var(--font-mono,ui-monospace,monospace);font-size:10px;font-weight:600;line-height:15px;letter-spacing:.1em;text-transform:uppercase;color:var(--docs-shape-muted,var(--muted-foreground));background:color-mix(in srgb,var(--muted) 18%,transparent);border-bottom:2px solid var(--docs-shape-rule,var(--border))}
      [data-note-type-chip]{box-decoration-break:slice;-webkit-box-decoration-break:slice}
      [data-op-sig] [data-sig-token="param"]{color:var(--syntax-key)}
      [data-op-sig] [data-code-line]{font-family:var(--font-mono,ui-monospace,monospace)}

      [data-operation-output]{margin-top:20px;border-top:1px solid var(--docs-operations-rule)}
      [data-operation-output]>[data-docs-block-type="state-shape"]{margin:0;border:0!important;border-radius:0!important}
      [data-operation-output] [data-shape-header]{padding:8px 16px;border-bottom:1px solid var(--docs-shape-rule,var(--border));background:color-mix(in srgb,var(--muted) 18%,transparent)}
      [data-operation-output] [data-shape-header]::before{display:none}
      [data-operation-output] [data-shape-name]{font-size:10px;line-height:15px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--docs-shape-muted,var(--muted-foreground))}
      [data-operation-output] [data-shape-example]{max-height:none}
      @media(min-width:768px){[data-operation-output] [data-shape-grid]:has([data-shape-example-pane]){grid-template-columns:minmax(0,var(--docs-pane-split,46%)) minmax(0,1fr);column-gap:0;align-items:start}[data-operation-output] [data-shape-example-pane]{border-top:0;border-left:1px solid var(--docs-shape-header-rule,color-mix(in srgb,var(--foreground) 65%,var(--border)))}}

      [data-operations-card-layout]{--operation-card-radius:12px;--operation-card-border:1px;--operation-action-bg:var(--docs-operation-action-header-bg,#fbf6ee);--operation-query-bg:var(--docs-operation-query-header-bg,#eef7f2);--operation-event-bg:var(--docs-operation-event-header-bg,#f4f0f8);--operation-action-ink:var(--docs-operation-action-header-ink,#87511e);--operation-query-ink:var(--docs-operation-query-header-ink,#276c50);--operation-event-ink:var(--docs-operation-event-header-ink,#65507d);border-width:0!important;background:transparent}
      .dark [data-operations-card-layout]{--operation-action-bg:var(--docs-operation-action-header-bg,#30271e);--operation-query-bg:var(--docs-operation-query-header-bg,#203029);--operation-event-bg:var(--docs-operation-event-header-bg,#2b2434);--operation-action-ink:var(--docs-operation-action-header-ink,#e0b47e);--operation-query-ink:var(--docs-operation-query-header-ink,#a1d5ba);--operation-event-ink:var(--docs-operation-event-header-ink,#d0bce8)}
      [data-operations-card-layout]>[data-operations-header]{padding:0 0 12px;background:var(--background);color:var(--foreground);border:0}
      [data-operations-card-layout]>[data-operations-header]::before,[data-operations-card-layout]>[data-operations-header]::after{display:none}
      [data-operations-card-layout] [data-interaction-operation]{border:var(--operation-card-border) solid var(--docs-shape-header-rule,color-mix(in srgb,var(--foreground) 65%,var(--border)));border-radius:var(--operation-card-radius);background:var(--docs-shape-bg,var(--background))}
      [data-operation-kind="action"]{--operation-kind-bg:var(--operation-action-bg);--operation-kind-ink:var(--operation-action-ink)}
      [data-operation-kind="query"]{--operation-kind-bg:var(--operation-query-bg);--operation-kind-ink:var(--operation-query-ink)}
      [data-operation-kind="event"]{--operation-kind-bg:var(--operation-event-bg);--operation-kind-ink:var(--operation-event-ink)}
      [data-operation-card-header]{position:relative;overflow:hidden;padding:16px;border-bottom:1px solid var(--docs-shape-header-rule,color-mix(in srgb,var(--foreground) 65%,var(--border)));background:var(--operation-kind-bg);color:var(--foreground)}
      [data-operation-card-header]::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.1;background:radial-gradient(ellipse at 15% 120%,transparent 55%,color-mix(in srgb,var(--operation-kind-ink) 14%,transparent) 56%,transparent 63%),radial-gradient(ellipse at 75% -35%,transparent 58%,color-mix(in srgb,var(--operation-kind-ink) 10%,transparent) 59%,transparent 68%)}
      [data-operation-content]{border-top:0}
      [data-operation-output]{margin-top:20px;border-top:1px solid var(--docs-shape-header-rule,color-mix(in srgb,var(--foreground) 65%,var(--border)))}
      [data-operation-output] [data-shape-header]{padding:12px 16px;background:color-mix(in srgb,var(--muted) 18%,transparent)}
      [data-operation-output] [data-shape-name]{font-size:13px;line-height:20px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--foreground)}

      [data-operation-output]{--operation-return-bg:color-mix(in srgb,var(--operation-kind-bg) 48%,var(--background))}
      [data-operation-output] [data-shape-header],[data-operation-output]>[data-return-head]{background:var(--operation-return-bg)}
      [data-operation-output] [data-shape-name]::before,[data-operation-output]>[data-return-head]::before{content:"\u21B3";display:inline-block;margin-right:8px;color:var(--operation-kind-ink);font-size:14px;font-weight:500}

      [data-operation-card-header]::before,[data-operation-card-header]::after{content:"";position:absolute;inset:0;pointer-events:none;mask-image:linear-gradient(90deg,transparent 22%,rgba(0,0,0,.2) 45%,#000 76%)}
      [data-operation-card-header]::before{opacity:.3;background:linear-gradient(105deg,transparent 46%,color-mix(in srgb,var(--operation-kind-ink) 13%,transparent) 47%,transparent 49%),repeating-radial-gradient(ellipse at 94% 52%,transparent 0 13px,color-mix(in srgb,var(--operation-kind-ink) 48%,transparent) 14px 15px,transparent 16px 24px)}
      [data-operation-card-header]::after{opacity:.22;background:radial-gradient(ellipse at 79% -70%,transparent 58%,var(--operation-kind-ink) 59%,transparent 63%),radial-gradient(ellipse at 88% 160%,transparent 58%,var(--operation-kind-ink) 59%,transparent 64%)}
      [data-operation-card-header]>div,[data-operation-card-header]>p{z-index:1}
      @media(prefers-reduced-motion:reduce){[data-docs-block-type="interaction-surface"] *{scroll-behavior:auto!important;transition-duration:.01ms!important}}
    `}</style>
    <style data-variator-tokens>{"[data-docs-block-type=\"interaction-surface\"]:not(.dark [data-docs-block-type=\"interaction-surface\"]){--operation-card-radius:4px !important;}[data-docs-block-type=\"interaction-surface\"]:not(.dark [data-docs-block-type=\"interaction-surface\"]){border-radius:4px !important;}"}</style><header data-operations-header="true" className="relative overflow-hidden border-b border-solid border-[color:var(--docs-operations-rule)] bg-[color:var(--docs-operations-header-bg)] px-5 py-4 text-[color:var(--docs-operations-header-fg)]">
      <h3 data-operations-title="true" className="relative m-0 break-words text-sm font-semibold text-[color:var(--docs-operations-header-fg)]">{headerTitleCase(title?.trim() || "Operations")}</h3>
    </header>
    <div data-operations-list="true" className="grid gap-6">
      {operations.map((operation, index) => { const displayName = useBare ? bare[index]! : operation.name; const { lines, notes } = buildOperation(operation, displayName); const kind = operation.kind ?? "action";
        return <LinkGroup key={operation.name}><article data-interaction-operation={operation.name} data-operation-kind={kind} className="min-w-0 overflow-hidden">
 <header data-operation-card-header><div className="relative flex min-w-0 flex-wrap items-center gap-2"><h4 className="m-0 break-words font-mono text-sm font-bold">{humanizeOperationName(displayName)}</h4><Badge variant="outline" className="border-current/20 bg-transparent px-1.5 py-0 font-mono text-[10px] leading-4 text-current">{kind}</Badge></div>{operation.description && <p data-operation-purpose className="relative m-0 mt-1 max-w-[76ch] text-xs leading-5">{operation.description}</p>}</header>
 <div data-operation-body><div data-operation-content data-has-fields={notes.length>0 || Boolean(operation.returns)} className="min-w-0">
 {(notes.length>0 || operation.returns) && <div data-op-notes={notes.length>0 ? "true" : undefined} data-op-params={notes.length>0 ? "true" : undefined} className="min-w-0 content-start overflow-hidden"><div data-note-ledger-head><span>Field</span><span>Type</span></div>{notes.length>0 ? notes.map(note=><NoteGroup key={note.key} note={note}/>) : <div className="px-4 py-3 text-xs text-[color:var(--docs-shape-muted)]">No parameters</div>}</div>}
 <div data-op-sig="true" className="min-w-0 overflow-hidden"><div data-signature-head>Signature</div><CodeLines className="min-h-0" lines={lines}/></div>
 </div>{(operation.returns || operation.returnShape) && <section data-operation-output aria-label="Returned value">
 {operation.returnShape ? <StateShapeBlock id={id+":"+operation.name+":return"} name={operation.returns || "Result"} fields={operation.returnShape.fields} example={operation.returnShape.example}/> : <><div data-return-head>Returns</div><div data-return-value className="px-4 py-3"><NoteType value={operation.returns}/></div></>}
 </section>}</div></article></LinkGroup>;
      })}
    </div>
  </section>;
}
