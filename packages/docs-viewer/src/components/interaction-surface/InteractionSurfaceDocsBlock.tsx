"use client";

import type { ReactNode, CSSProperties } from "react";
import type { Field } from "@codecaine-ai/docs-model";
import { StateShapeBlock, FIELD_TOKEN_CLASS, classifyTypeText } from "../state-shape/StateShapeDocsBlock";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import { CodeLines, LinkGroup, LinkTarget, type LinkedCodeLine } from "../linked-panels";
import { DescribedName, DESCRIBED_NAME_STYLE } from "../described-name";
import { tokenizeSigType } from "./signature-tokens";

export const INTERACTION_SURFACE_LABEL = "Interaction Surface";
export const INTERACTION_SURFACE_AGENT_DESCRIPTION =
  'Operations on state, each in a separate card with an explicit kind badge: amber Action, green-teal Query, and violet Event. State Shape content styling; Field and Type left, Signature right, and a separate softly tinted returned object with fields and example. Parameter descriptions live in delayed hover and keyboard-focus tooltips on dotted-underlined names, and print inline; the operation purpose stays inline. Typed props: { title?: string; operations: Array<{ name: string; description?: string; params?: Array<{ name: string; type?: string; required?: boolean; description?: string; fields?: Param[] }>; returns?: string; returnShape?: { fields: Field[]; example?: string }; kind?: "action" | "query" | "event" }> }.';

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

// Every tunable value below reads a --docs-interaction-* token (the style
// rail's Interaction surface knobs, THEME_TOKEN_REGISTRY["interaction-surface"])
// with a literal fallback equal to the semantic.css default, so the block
// renders the same in a static export where semantic.css is absent. Most of
// the block is styled by the inline <style> below, which is unlayered and so
// beats Tailwind utilities: a value set there must be tokenized THERE, since a
// utility class on the element would lose. Class names stay complete
// literals because Tailwind scans this file's text.
const NOTE_NAME_CLASS = "break-all font-mono text-[length:var(--docs-interaction-note-name-text-size,13px)] [font-weight:var(--docs-interaction-note-name-weight,600)] text-[color:var(--docs-interaction-note-name,var(--docs-shape-name,var(--foreground)))]";
// Plain padded cells ("No parameters", a bare return type) share the row inset.
const PLAIN_CELL_CLASS = "px-[var(--docs-interaction-pad-x,16px)] py-[var(--docs-interaction-row-pad,12px)]";

// Signature pane tokens wear the code-block syntax roles (VS Code Dark+ /
// Light+ --syntax-* tokens, re-declared on the dark code-panel island), with
// role font-style / weight like styles/code.css. The rail's sig knobs
// (--docs-interaction-sig-name / -type / -punct) sit in front of their role;
// the var() chains after them equal code.css's, so hosts without the theme
// layer still color the pane like their code blocks. Plain CSS in the block's
// <style>, keyed on data-sig-token, so nested type tokens need no classes.
function sigRole(role: string, color: string): string {
  return `color:${color};font-style:var(--syntax-${role}-font-style,normal);font-weight:var(--syntax-${role}-font-weight,inherit)`;
}
const SIG_PUNCT_COLOR = "var(--docs-interaction-sig-punct,var(--syntax-punctuation,var(--docs-code-fg,var(--docs-text-secondary,var(--color-text-default,inherit)))))";
const SIG_TYPE_COLOR = "var(--docs-interaction-sig-type,var(--syntax-type,var(--syntax-string,var(--color-text-green,#448361))))";
export const SIG_TOKEN_STYLE = [
  `[data-op-sig] [data-sig-token="name"]{${sigRole("function", "var(--docs-interaction-sig-name,var(--syntax-function,var(--syntax-string,var(--color-text-green,#448361))))")}}`,
  `[data-op-sig] :is([data-sig-token="param"],[data-sig-token="key"]){${sigRole("key", "var(--syntax-key,var(--color-text-purple,#9065b0))")}}`,
  `[data-op-sig] :is([data-sig-token="type"],[data-sig-token="type-name"]){${sigRole("type", SIG_TYPE_COLOR)}}`,
  `[data-op-sig] [data-sig-token="string"]{${sigRole("string", "var(--syntax-string,var(--color-text-green,#448361))")}}`,
  `[data-op-sig] [data-sig-token="number"]{${sigRole("number", "var(--syntax-number,var(--color-text-blue,#337ea9))")}}`,
  `[data-op-sig] [data-sig-token="boolean"]{${sigRole("boolean", "var(--syntax-boolean,var(--color-text-orange,#d9730d))")}}`,
  `[data-op-sig] [data-sig-token="null"]{${sigRole("null", "var(--syntax-null,var(--color-text-red,#d44c47))")}}`,
  `[data-op-sig] [data-sig-token="keyword"]{${sigRole("keyword", "var(--syntax-keyword,var(--syntax-key,var(--color-text-purple,#9065b0)))")}}`,
  // Dark+ prints the optional `?` and the `->` arrow as plain punctuation.
  `[data-op-sig] :is([data-sig-token="punct"],[data-sig-token="optional"],[data-sig-token="returns"]){${sigRole("punctuation", SIG_PUNCT_COLOR)}}`,
].join("\n");

function PunctToken({ text }: { text: string }) { return <span data-sig-token="punct">{text}</span>; }

/** Type text as role-tagged spans inside one `data-sig-token="type"` wrapper. */
function TypeToken({ text }: { text: string }) {
  return <span data-sig-token="type">{tokenizeSigType(text).map((token, index) => token.kind === "space" ? token.text : <span key={index} data-sig-token={token.kind}>{token.text}</span>)}</span>;
}

type ParamNote = { key: string; name: string; type?: string; required?: boolean; description?: string; start: number; end: number; children: ParamNote[] };
function bareVerb(name: string): string { return name.slice(name.lastIndexOf(".") + 1); }
function humanizeOperationName(name: string): string { return name.replace(/[.\-_]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
function descriptionTipId(blockId: string, noteKey: string): string {
  const safe = `${blockId}-${noteKey}`.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `interaction-${safe || "param"}-description`;
}

function buildOperation(operation: InteractionSurfaceOperation, displayName: string): { lines: LinkedCodeLine[]; notes: ParamNote[] } {
  const params = operation.params ?? []; const lines: LinkedCodeLine[] = []; const notes: ParamNote[] = [];
  const nameToken = <span key="name" data-sig-token="name">{displayName}</span>;
  const returnsToken = operation.returns ? <span key="returns" data-sig-token="returns"> {"->"} <TypeToken text={operation.returns} /></span> : null;
  if (params.length === 0) { lines.push({ content: [nameToken, <PunctToken key="()" text="()" />, returnsToken] }); return { lines, notes }; }
  const emitParams = (fields: Field[], depth: number, keyPrefix: string, ancestors: readonly string[], into: ParamNote[]): void => {
    const indent = "  ".repeat(depth);
    for (const param of fields) {
      const key = `${keyPrefix}.${param.name}`; const lineKey = [key, ...ancestors]; const start = lines.length + 1;
      const note: ParamNote = { key, name: param.name, required: param.required, ...(param.type ? { type: param.type } : {}), ...(param.description ? { description: param.description } : {}), start, end: start, children: [] }; into.push(note);
      const head: ReactNode[] = [indent, <span key={key} data-sig-token="param">{param.name}</span>];
      if (param.required === false) head.push(<span key={`${key}?`} data-sig-token="optional">?</span>);
      if (param.fields) { head.push(<PunctToken key={`${key}{`} text=": {" />); lines.push({ content: head, linkKey: lineKey }); emitParams(param.fields, depth + 1, key, lineKey, note.children); lines.push({ content: [indent, <PunctToken key={`${key}}`} text="}," />], linkKey: lineKey }); }
      else { if (param.type) head.push(<PunctToken key={`${key}:`} text=": " />, <TypeToken key={`${key}t`} text={param.type} />); head.push(<PunctToken key={`${key},`} text="," />); lines.push({ content: head, linkKey: lineKey }); }
      note.end = lines.length;
    }
  };
  lines.push({ content: [nameToken, <PunctToken key="(" text="(" />] }); emitParams(params, 1, operation.name, [], notes); lines.push({ content: [<PunctToken key=")" text=")" />, returnsToken] }); return { lines, notes };
}

function NoteType({ value }: { value?: string }) {
  if (!value) return <span data-note-type className={cn("text-xs", FIELD_TOKEN_CLASS.muted)}>{"\u2014"}</span>;
  const type=classifyTypeText(value);
  if(type.kind==='union')return <span data-note-type className={cn("flex flex-wrap items-center gap-1 font-mono text-xs",FIELD_TOKEN_CLASS.type)}>{type.parts.map((part,i)=>i%2===0?<span data-note-type-chip key={i} className={cn("rounded px-1.5 py-0.5",FIELD_TOKEN_CLASS.typeBg)}>{part}</span>:<span key={i} className="opacity-40">{part}</span>)}</span>;
  return <span data-note-type className={cn("break-words font-mono text-xs",FIELD_TOKEN_CLASS.type)}>{type.kind==='token'?<span data-note-type-chip className={cn("rounded px-1.5 py-0.5",FIELD_TOKEN_CLASS.typeBg)}>{value}</span>:value}</span>;
}
function NoteRow({ blockId, note, depth, last, rails }: { blockId: string; note: ParamNote; depth: number; last:boolean; rails:number[] }) {
  return <LinkTarget linkKey={note.key} data-param-note={note.key} data-note-indent={depth} className="relative min-w-0 text-xs motion-reduce:transition-none">
    <div data-note-name-cell style={{'--note-depth':depth} as CSSProperties}>
      {depth>0 && <><span aria-hidden data-note-branch data-note-vertical data-last={last} style={{'--note-level':depth} as CSSProperties}/><span aria-hidden data-note-branch data-note-tick/>{rails.map(level=><span key={level} aria-hidden data-note-branch data-note-vertical style={{'--note-level':level} as CSSProperties}/>)}</>}
      <div data-name-row="true" className="flex min-w-0 items-baseline gap-1.5">{note.description ? <DescribedName id={descriptionTipId(blockId, note.key)} label={note.name} description={note.description} nameAttrs={{ "data-note-name": "true" }} className={NOTE_NAME_CLASS} descriptionAttrs={{ "data-note-description": true }} descriptionClassName={FIELD_TOKEN_CLASS.description}>{note.name}</DescribedName> : <span data-note-name className={NOTE_NAME_CLASS}>{note.name}</span>}{note.required===false && <span title="Optional field" aria-label="optional" className={cn("font-mono text-[11px] font-medium", FIELD_TOKEN_CLASS.optionalFg)}>?</span>}</div>
    </div><div data-note-type-cell className="min-w-0 pt-0.5"><NoteType value={note.type}/></div>
  </LinkTarget>;
}
function NoteGroup({ blockId, note, depth = 0, last=true, rails=[] }: { blockId: string; note: ParamNote; depth?: number; last?:boolean; rails?:number[] }) {
  return <div data-note-group={note.key} data-tree-depth={depth}><NoteRow blockId={blockId} note={note} depth={depth} last={last} rails={rails}/>{note.children.length>0 && <div data-note-children>{note.children.map((child,index)=><NoteGroup key={child.key} blockId={blockId} note={child} depth={depth+1} last={index===note.children.length-1} rails={depth>0&&!last?[...rails,depth]:rails}/>)}</div>}</div>;
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

// The signature pane's code lines (CodeLines) are a code surface. Under
// [data-code-panels="dark"] the block's `.dark` var rules below also land ON
// that pane, so the --docs-operations-* vars it reads resolve dark there while
// the rest of the block stays on the page theme.
export function InteractionSurfaceBlock({ id, title, operations }: { id: string; title?: string; operations: InteractionSurfaceOperation[] }) {
  const bare = operations.map((operation) => bareVerb(operation.name)); const useBare = new Set(bare).size === operations.length;
  return <section data-operations-card-layout className="not-prose my-4 min-w-0 w-full overflow-hidden" data-docs-block-type="interaction-surface" data-source-id={id}>
    <style>{`
      ${DESCRIBED_NAME_STYLE}
      [data-docs-block-type="interaction-surface"]{--docs-operations-accent:#87511e;--docs-operations-header-bg:#fbf6ee;--docs-operations-header-fg:#3f2b19;--docs-operations-rule:#d8c5ad;--docs-operations-tree:#c8a477;--docs-operations-texture:#a96e31;--docs-operations-code:#f7f7f6}
      .dark [data-docs-block-type="interaction-surface"],[data-code-panels="dark"] [data-docs-block-type="interaction-surface"] [data-code-surface]{--docs-operations-accent:#e0b47e;--docs-operations-header-bg:#30271e;--docs-operations-header-fg:#f3e1ca;--docs-operations-rule:#64503a;--docs-operations-tree:#806342;--docs-operations-texture:#c08a50;--docs-operations-code:#20201f}
      [data-operations-header]::before,[data-operations-header]::after{content:"";position:absolute;inset:0;pointer-events:none;mask-image:linear-gradient(90deg,transparent 22%,rgba(0,0,0,.2) 45%,#000 76%)}
      [data-operations-header]::before{opacity:.3;background:linear-gradient(105deg,transparent 46%,color-mix(in srgb,var(--docs-operations-texture) 13%,transparent) 47%,transparent 49%),repeating-radial-gradient(ellipse at 94% 52%,transparent 0 13px,color-mix(in srgb,var(--docs-operations-texture) 48%,transparent) 14px 15px,transparent 16px 24px)}
      [data-operations-header]::after{opacity:.22;background:radial-gradient(ellipse at 79% -70%,transparent 58%,var(--docs-operations-texture) 59%,transparent 63%),radial-gradient(ellipse at 88% 160%,transparent 58%,var(--docs-operations-texture) 59%,transparent 64%)}
      [data-op-sig]{background:var(--docs-operations-code)}


      [data-docs-block-type="interaction-surface"]{--note-indent:var(--docs-interaction-indent,22px);--note-gap:6px;--note-y:var(--docs-interaction-row-pad,12px);--note-x:var(--docs-interaction-pad-x,16px);--note-rule:var(--docs-interaction-rule-width,1px)}
      [data-note-group],[data-note-children]{display:contents}
      [data-note-children]{margin-left:var(--note-indent);padding-left:var(--note-gap)}
      [data-param-note],[data-note-ledger-head]{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:12px}
      [data-param-note]{padding:var(--note-y) var(--note-x);border-bottom:var(--note-rule) solid var(--docs-operations-rule)}
      [data-note-ledger-head]{padding:8px var(--note-x);border-bottom:1px solid var(--docs-operations-rule);font:500 10px/16px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.04em;color:var(--muted-foreground)}
      [data-note-name-cell]{position:relative;min-width:0;padding-left:calc(var(--note-depth)*var(--note-indent))}
      [data-note-name-cell]:has([data-note-tick]){padding-left:calc((var(--note-depth) - 1)*var(--note-indent) + 14px + var(--note-gap))}
      [data-note-branch]{position:absolute;pointer-events:none;border-color:var(--docs-operations-tree);border-style:solid;border-width:0}
      [data-note-vertical]{left:calc((var(--note-level) - 1)*var(--note-indent) + 6px);top:calc(-1*var(--note-y) - var(--note-rule));bottom:calc(-1*var(--note-y));border-left-width:1px}
      [data-note-vertical][data-last="true"]{bottom:auto;height:calc(var(--note-y) + 11px)}
      [data-note-tick]{left:calc((var(--note-depth) - 1)*var(--note-indent) + 6px);top:10px;width:8px;border-top-width:1px}
      [data-note-type]{color:var(--docs-operations-type);font-size:var(--docs-interaction-note-type-text-size,12px);overflow-wrap:anywhere}
      [data-note-type-chip]{border-radius:var(--radius,2px);padding:2px 6px;background:var(--docs-operations-type-bg);box-decoration-break:clone;-webkit-box-decoration-break:clone}

      [data-op-params] > [data-note-group]:last-child [data-description-tip]{top:auto;bottom:calc(100% + 8px);translate:0 3px}
      [data-op-params] > [data-note-group]:last-child [data-description-tip]::before{top:auto;bottom:-5px;border:0;border-right:1px solid color-mix(in srgb,var(--foreground) 22%,var(--border));border-bottom:1px solid color-mix(in srgb,var(--foreground) 22%,var(--border))}
      [data-op-params] > [data-note-group]:last-child [data-described]:hover > [data-description-tip],[data-op-params] > [data-note-group]:last-child [data-described]:has(:focus-visible) > [data-description-tip]{translate:0 0}

      [data-docs-block-type="interaction-surface"]{--docs-operations-rule:var(--docs-interaction-rule,var(--docs-shape-rule,var(--border)));--docs-operations-tree:var(--docs-interaction-child-rule,var(--docs-shape-child-rule,color-mix(in srgb,var(--foreground) 35%,var(--border))));--docs-operations-code:var(--docs-interaction-bg,var(--docs-shape-bg,var(--background)));--docs-operations-accent:var(--syntax-key,#0e7490);--docs-operations-type:var(--docs-interaction-note-type,var(--docs-shape-type,#0a5779));--docs-operations-type-bg:var(--docs-interaction-note-type-bg,var(--docs-shape-type-bg,color-mix(in srgb,#0a5779 9%,transparent)));--docs-operations-optional:var(--docs-shape-optional-fg,#6b4708)}
      .dark [data-docs-block-type="interaction-surface"],[data-code-panels="dark"] [data-docs-block-type="interaction-surface"] [data-code-surface]{--docs-operations-rule:var(--docs-interaction-rule,var(--docs-shape-rule,var(--border)));--docs-operations-tree:var(--docs-interaction-child-rule,var(--docs-shape-child-rule,color-mix(in srgb,var(--foreground) 35%,var(--border))));--docs-operations-code:var(--docs-interaction-bg,var(--docs-shape-bg,var(--background)));--docs-operations-accent:var(--syntax-key,#67e8f9);--docs-operations-type:var(--docs-interaction-note-type,var(--docs-shape-type,#a5d3f0));--docs-operations-type-bg:var(--docs-interaction-note-type-bg,var(--docs-shape-type-bg,color-mix(in srgb,#a5d3f0 14%,transparent)));--docs-operations-optional:var(--docs-shape-optional-fg,#e8c27a)}
      [data-param-note]:not([data-note-indent="0"]){background:color-mix(in srgb,var(--muted) 7%,transparent)}
      [data-note-description],[data-operation-purpose]{color:var(--docs-interaction-note-fg,var(--docs-shape-desc-fg,color-mix(in srgb,var(--foreground) 72%,transparent)))}
      [data-param-note] [data-described]>[data-description-tip]{font-size:var(--docs-interaction-desc-text-size,12px)}

      [data-operation-content]{display:grid;grid-template-columns:minmax(0,1fr);border-top:1px solid var(--docs-operations-rule)}
      [data-signature-head]{padding:8px var(--note-x);border-bottom:1px solid var(--docs-operations-rule);background:color-mix(in srgb,var(--muted) 18%,transparent);font:600 10px/16px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em;color:var(--muted-foreground)}
      [data-operation-content][data-has-fields="true"]>[data-op-sig]{border-top:var(--note-rule) solid var(--docs-operations-rule)}
      @media(min-width:768px){[data-operation-content][data-has-fields="true"]{grid-template-columns:minmax(0,var(--docs-pane-split,46%)) minmax(0,1fr)}[data-operation-content][data-has-fields="true"]>[data-op-sig]{align-self:start;border-top:0;border-left:var(--operation-card-border) solid var(--operation-frame)}}

      [data-operations-title]{font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--docs-interaction-title-text-size,14px);font-weight:var(--docs-interaction-title-weight,700);color:var(--docs-interaction-title-fg,var(--foreground))}
      [data-interaction-operation] h4{font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--docs-interaction-header-text-size,14px);font-weight:var(--docs-interaction-header-weight,700);color:var(--docs-interaction-header-fg,var(--foreground))}
      [data-param-note],[data-note-ledger-head]{column-gap:20px}
      [data-note-name-cell]{font-size:var(--docs-interaction-note-name-text-size,13px)}
      [data-note-ledger-head],[data-signature-head],[data-return-head]{padding:var(--docs-interaction-column-head-pad-y,8px) var(--note-x);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--docs-interaction-column-head-text-size,10px);font-weight:600;line-height:1.5;letter-spacing:.1em;text-transform:uppercase;color:var(--docs-interaction-column-head-fg,var(--docs-shape-muted,var(--muted-foreground)));background:var(--docs-interaction-column-head-bg,color-mix(in srgb,var(--muted) 18%,transparent));border-bottom:var(--docs-interaction-column-head-rule-width,2px) solid var(--docs-operations-rule)}
      [data-note-type-chip]{box-decoration-break:slice;-webkit-box-decoration-break:slice}
      ${SIG_TOKEN_STYLE}
      [data-op-sig] [data-code-line]{font-family:var(--font-mono,ui-monospace,monospace)}

      [data-operation-output]{margin-top:20px;border-top:1px solid var(--docs-operations-rule)}
      [data-operation-output]>[data-docs-block-type="state-shape"]{margin:0;border:0!important;border-radius:0!important}
      [data-operation-output] [data-shape-header]{padding:8px 16px;border-bottom:1px solid var(--docs-shape-rule,var(--border));background:color-mix(in srgb,var(--muted) 18%,transparent)}
      [data-operation-output] [data-shape-header]::before{display:none}
      [data-operation-output] [data-shape-name]{font-size:10px;line-height:15px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--docs-shape-muted,var(--muted-foreground))}
      [data-operation-output] [data-shape-example]{max-height:none}
      @media(min-width:768px){[data-operation-output] [data-shape-grid]:has([data-shape-example-pane]){grid-template-columns:minmax(0,var(--docs-pane-split,46%)) minmax(0,1fr);column-gap:0;align-items:start}[data-operation-output] [data-shape-example-pane]{border-top:0;border-left:1px solid var(--docs-shape-header-rule,color-mix(in srgb,var(--foreground) 65%,var(--border)))}}

      [data-operations-card-layout]{--operation-card-radius:var(--docs-interaction-radius,var(--radius,2px));--operation-card-border:var(--docs-interaction-border-width,1px);--operation-frame:var(--docs-interaction-border,var(--docs-shape-header-rule,color-mix(in srgb,var(--foreground) 65%,var(--border))));--operation-action-bg:var(--docs-operation-action-header-bg,#fbf6ee);--operation-query-bg:var(--docs-operation-query-header-bg,#eef7f2);--operation-event-bg:var(--docs-operation-event-header-bg,#f4f0f8);--operation-action-ink:var(--docs-operation-action-header-ink,#87511e);--operation-query-ink:var(--docs-operation-query-header-ink,#276c50);--operation-event-ink:var(--docs-operation-event-header-ink,#65507d);border-width:0!important;border-radius:var(--operation-card-radius);background:transparent}
      .dark [data-operations-card-layout]{--operation-action-bg:var(--docs-operation-action-header-bg,#30271e);--operation-query-bg:var(--docs-operation-query-header-bg,#203029);--operation-event-bg:var(--docs-operation-event-header-bg,#2b2434);--operation-action-ink:var(--docs-operation-action-header-ink,#e0b47e);--operation-query-ink:var(--docs-operation-query-header-ink,#a1d5ba);--operation-event-ink:var(--docs-operation-event-header-ink,#d0bce8)}
      [data-operations-card-layout]>[data-operations-header]{padding:0 0 var(--docs-interaction-title-gap,12px);background:var(--background);color:var(--foreground);border:0}
      [data-operations-card-layout]>[data-operations-header]::before,[data-operations-card-layout]>[data-operations-header]::after{display:none}
      [data-operations-card-layout] [data-interaction-operation]{border:var(--operation-card-border) solid var(--operation-frame);border-radius:var(--operation-card-radius);background:var(--docs-interaction-bg,var(--docs-shape-bg,var(--background)))}
      [data-operation-kind="action"]{--operation-kind-bg:var(--operation-action-bg);--operation-kind-ink:var(--operation-action-ink)}
      [data-operation-kind="query"]{--operation-kind-bg:var(--operation-query-bg);--operation-kind-ink:var(--operation-query-ink)}
      [data-operation-kind="event"]{--operation-kind-bg:var(--operation-event-bg);--operation-kind-ink:var(--operation-event-ink)}
      [data-operation-card-header]{position:relative;overflow:hidden;padding:var(--docs-interaction-header-pad-y,16px) var(--note-x);border-bottom:var(--operation-card-border) solid var(--operation-frame);background:var(--operation-kind-bg);color:var(--docs-interaction-header-fg,var(--foreground))}
      [data-operation-card-header]::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.1;background:radial-gradient(ellipse at 15% 120%,transparent 55%,color-mix(in srgb,var(--operation-kind-ink) 14%,transparent) 56%,transparent 63%),radial-gradient(ellipse at 75% -35%,transparent 58%,color-mix(in srgb,var(--operation-kind-ink) 10%,transparent) 59%,transparent 68%)}
      [data-operation-content]{border-top:0}
      [data-operation-output]{margin-top:20px;border-top:var(--operation-card-border) solid var(--operation-frame)}
      [data-operation-output] [data-shape-header]{padding:12px var(--note-x);background:color-mix(in srgb,var(--muted) 18%,transparent)}
      [data-operation-output] [data-shape-name]{font-size:13px;line-height:20px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--foreground)}

      [data-operation-output]{--operation-return-bg:color-mix(in srgb,var(--operation-kind-bg) 48%,var(--background));--docs-shape-pad-x:var(--note-x)}
      [data-operation-output] [data-shape-header],[data-operation-output]>[data-return-head]{background:var(--operation-return-bg)}
      [data-operation-output] [data-shape-name]::before,[data-operation-output]>[data-return-head]::before{content:"\u21B3";display:inline-block;margin-right:8px;color:var(--operation-kind-ink);font-size:14px;font-weight:500}

      [data-operation-card-header]::before,[data-operation-card-header]::after{content:"";position:absolute;inset:0;pointer-events:none;mask-image:linear-gradient(90deg,transparent 22%,rgba(0,0,0,.2) 45%,#000 76%)}
      [data-operation-card-header]::before{opacity:.3;background:linear-gradient(105deg,transparent 46%,color-mix(in srgb,var(--operation-kind-ink) 13%,transparent) 47%,transparent 49%),repeating-radial-gradient(ellipse at 94% 52%,transparent 0 13px,color-mix(in srgb,var(--operation-kind-ink) 48%,transparent) 14px 15px,transparent 16px 24px)}
      [data-operation-card-header]::after{opacity:.22;background:radial-gradient(ellipse at 79% -70%,transparent 58%,var(--operation-kind-ink) 59%,transparent 63%),radial-gradient(ellipse at 88% 160%,transparent 58%,var(--operation-kind-ink) 59%,transparent 64%)}
      [data-operation-card-header]>div,[data-operation-card-header]>p{z-index:1}
      @media(prefers-reduced-motion:reduce){[data-docs-block-type="interaction-surface"] *{scroll-behavior:auto!important;transition-duration:.01ms!important}}
    `}</style>
    <header data-operations-header="true" className="relative overflow-hidden">
      <h3 data-operations-title="true" className="relative m-0 break-words text-sm">{headerTitleCase(title?.trim() || "Operations")}</h3>
    </header>
    <div data-operations-list="true" className="grid gap-[var(--docs-interaction-op-gap,24px)]">
      {operations.map((operation, index) => { const displayName = useBare ? bare[index]! : operation.name; const { lines, notes } = buildOperation(operation, displayName); const kind = operation.kind ?? "action";
        return <LinkGroup key={operation.name}><article data-interaction-operation={operation.name} data-operation-kind={kind} className="min-w-0 overflow-hidden">
 <header data-operation-card-header><div className="relative flex min-w-0 flex-wrap items-center gap-2"><h4 className="m-0 break-words font-mono text-sm font-bold">{humanizeOperationName(displayName)}</h4><Badge variant="outline" className="border-current/20 bg-transparent px-1.5 py-0 font-mono text-[length:var(--docs-interaction-badge-text-size,10px)] leading-4 text-current">{kind}</Badge></div>{operation.description && <p data-operation-purpose className="relative m-0 mt-1 max-w-[76ch] text-[length:var(--docs-interaction-desc-text-size,12px)] leading-[var(--docs-interaction-desc-line-height,20px)]">{operation.description}</p>}</header>
 <div data-operation-body><div data-operation-content data-has-fields={notes.length>0 || Boolean(operation.returns)} className="min-w-0">
 {(notes.length>0 || operation.returns) && <div data-op-notes={notes.length>0 ? "true" : undefined} data-op-params={notes.length>0 ? "true" : undefined} className="min-w-0 content-start overflow-hidden"><div data-note-ledger-head><span>Field</span><span>Type</span></div>{notes.length>0 ? notes.map(note=><NoteGroup key={note.key} blockId={id} note={note}/>) : <div className={cn(PLAIN_CELL_CLASS, "text-xs text-[color:var(--docs-shape-muted)]")}>No parameters</div>}</div>}
 <div data-op-sig="true" className="min-w-0 overflow-hidden"><div data-signature-head>Signature</div><CodeLines className="min-h-0" lines={lines}/></div>
 </div>{(operation.returns || operation.returnShape) && <section data-operation-output aria-label="Returned value">
 {operation.returnShape ? <StateShapeBlock id={id+":"+operation.name+":return"} name={operation.returns || "Result"} fields={operation.returnShape.fields} example={operation.returnShape.example}/> : <><div data-return-head>Returns</div><div data-return-value className={PLAIN_CELL_CLASS}><NoteType value={operation.returns}/></div></>}
 </section>}</div></article></LinkGroup>;
      })}
    </div>
  </section>;
}
