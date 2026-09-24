"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { printJsonLines, type Field } from "@codecaine-ai/docs-model";
import { cn } from "../../ui/cn";
import { DescribedName, DESCRIBED_NAME_STYLE } from "../described-name";
import { CodeLines, LinkGroup, LinkTarget, type LinkedCodeLine } from "../linked-panels";

export const STATE_SHAPE_LABEL = "State Shape";
export const STATE_SHAPE_AGENT_DESCRIPTION = "A bounded, two-column field inspector with a separately textured object header and linked JSON companion. Descriptions open from the dotted-underlined name after a delayed hover or keyboard focus, then print inline beneath it. Persistent branch rules clarify nesting, and hover, focus, click, Enter, Space, and Escape coordinate field paths with every matching JSON occurrence.";
export type StateShapeSourceProps = { path: string; symbol?: string };

export const FIELD_TOKEN_CLASS = {
  name: "text-foreground",
  type: "text-[color:var(--docs-shape-type,#0a5779)] dark:text-[color:var(--docs-shape-type,#a5d3f0)]",
  typeBg: "bg-[color:var(--docs-shape-type-bg,color-mix(in_srgb,#0a5779_9%,transparent))] dark:bg-[color:var(--docs-shape-type-bg,color-mix(in_srgb,#a5d3f0_14%,transparent))]",
  optionalFg: "text-[color:var(--docs-shape-optional-fg,#6b4708)] dark:text-[color:var(--docs-shape-optional-fg,#e8c27a)]",
  muted: "text-[color:var(--docs-shape-muted,var(--muted-foreground))]",
  description: "text-[color:var(--docs-shape-desc-fg,color-mix(in_srgb,var(--foreground)_72%,transparent))]",
} as const;

export type TypeTextClassification = { kind: "union"; parts: string[] } | { kind: "token" } | { kind: "prose" };
const UNION_TYPE_MEMBER_PATTERN = /^[\w.$<>\[\]"'`-]+$/;
const SINGLE_TYPE_TOKEN_PATTERN = /^[\w.$<>\[\],]+(\[\])*$/;
export function classifyTypeText(type: string): TypeTextClassification {
  const parts = type.split(/(\s*\|\s*)/);
  const members = parts.filter((_, index) => index % 2 === 0);
  if (members.length > 1 && members.every((member) => UNION_TYPE_MEMBER_PATTERN.test(member))) return { kind: "union", parts };
  if (!type.includes("|") && SINGLE_TYPE_TOKEN_PATTERN.test(type)) return { kind: "token" };
  return { kind: "prose" };
}

const JSON_TOKEN_CLASS = {
  key: "text-[color:var(--syntax-key,#0e7490)] dark:text-[color:var(--syntax-key,#67e8f9)]",
  string: "text-[color:var(--syntax-string,#15803d)] dark:text-[color:var(--syntax-string,#86efac)]",
  number: "text-[color:var(--syntax-number,#1d4ed8)] dark:text-[color:var(--syntax-number,#93c5fd)]",
  boolean: "text-[color:var(--syntax-boolean,#b45309)] dark:text-[color:var(--syntax-boolean,#fcd34d)]",
  null: "text-[color:var(--syntax-null,#b91c1c)] dark:text-[color:var(--syntax-null,#fca5a5)]",
  punct: "text-muted-foreground",
} as const;
type JsonTokenKind = keyof typeof JSON_TOKEN_CLASS;
const JSON_LEXEME_PATTERN = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:]/g;
function jsonTokenKind(token: string, rest: string): JsonTokenKind {
  if (token.startsWith('"')) return /^\s*:/.test(rest) ? "key" : "string";
  if (token === "true" || token === "false") return "boolean";
  if (token === "null") return "null";
  if (token.length === 1 && "{}[],:".includes(token)) return "punct";
  return "number";
}
export function jsonLineTokens(line: string): ReactNode[] {
  const output: ReactNode[] = [];
  let cursor = 0;
  for (const match of line.matchAll(JSON_LEXEME_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) output.push(line.slice(cursor, index));
    const token = match[0];
    const kind = jsonTokenKind(token, line.slice(index + token.length));
    output.push(<span key={index} data-json-token={kind} className={JSON_TOKEN_CLASS[kind]}>{token}</span>);
    cursor = index + token.length;
  }
  if (cursor < line.length) output.push(line.slice(cursor));
  return output;
}

type FlatField = { field: Field; depth: number; path: string; last: boolean; rails: number[] };
function flattenFields(fields: readonly Field[], depth = 0, parent = "", rails: number[] = []): FlatField[] {
  return fields.flatMap((field, index) => {
    const path = parent ? `${parent}.${field.name}` : field.name;
    const last = index === fields.length - 1; return [{ field, depth, path, last, rails }, ...flattenFields(field.fields ?? [], depth + 1, path, depth > 0 && !last ? [...rails, depth] : rails)];
  });
}
function normalizeRangePath(path: string) { return path.replace(/\[\d+\]/g, "").replace(/^\.+/, ""); }
type ExampleModel = { lines: readonly string[]; matched: ReadonlySet<string>; keysByLine: readonly (readonly string[] | undefined)[] };
function mapExample(example: string | undefined, fieldPaths: readonly string[]): ExampleModel | undefined {
  if (!example) return undefined;
  let value: unknown;
  try { value = JSON.parse(example); } catch { return undefined; }
  const { lines, ranges } = printJsonLines(value);
  const paths = new Set(fieldPaths);
  const matched = new Set<string>();
  const keysByLine = new Array<string[] | undefined>(lines.length);
  for (const range of ranges) {
    const path = normalizeRangePath(range.path);
    if (!paths.has(path)) continue;
    matched.add(path);
    for (let line = range.start; line <= range.end; line += 1) {
      const chain = (keysByLine[line - 1] ??= []);
      if (chain[0] !== path) chain.unshift(path);
    }
  }
  return { lines, matched, keysByLine };
}

function TypeValue({ value }: { value?: string }) {
  if (!value) return <span className={cn("text-xs", FIELD_TOKEN_CLASS.muted)}>—</span>;
  const type = classifyTypeText(value);
  if (type.kind === "union") return <span data-field-token="type" className={cn("flex flex-wrap items-center gap-1 font-mono text-xs", FIELD_TOKEN_CLASS.type)}>{type.parts.map((part, i) => i % 2 === 0 ? <span key={i} data-type-chip className={cn("rounded px-1.5 py-0.5", FIELD_TOKEN_CLASS.typeBg)}>{part}</span> : <span key={i} data-type-sep className="opacity-40">|</span>)}</span>;
  return <span data-field-token="type" className={cn("break-words font-mono text-xs", FIELD_TOKEN_CLASS.type)}>{type.kind === "token" ? <span data-type-chip className={cn("rounded px-1.5 py-0.5", FIELD_TOKEN_CLASS.typeBg)}>{value}</span> : value}</span>;
}

function descriptionId(...parts: string[]) {
  return parts.join("-").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function FieldRow({ id, row, linked }: { id: string; row: FlatField; linked: boolean }) {
  const { field, depth, path } = row;
  const style = { "--ledger-depth": depth } as CSSProperties;
  const content = <>
    <div data-shape-name-cell data-child={depth > 0 ? "true" : "false"} style={style}>
      {depth > 0 && <><span aria-hidden data-tree-line data-tree-vertical data-last={row.last ? "true" : "false"} style={{"--tree-level":depth} as CSSProperties}/><span aria-hidden data-tree-line data-tree-tick/>{row.rails.map(level => <span key={level} aria-hidden data-tree-line data-tree-vertical style={{"--tree-level":level} as CSSProperties}/>)}</>}
      <div data-name-row="true" className="flex min-w-0 items-baseline gap-1.5">
        {field.description ? <DescribedName id={descriptionId(id, path, "description")} label={field.name} description={field.description} nameAttrs={{ "data-field-token": "name" }} className={cn("break-all font-mono text-[13px] font-semibold", FIELD_TOKEN_CLASS.name)} descriptionAttrs={{ "data-field-token": "description" }} descriptionClassName={FIELD_TOKEN_CLASS.description} /> : <span data-field-token="name" className={cn("break-all font-mono text-[13px] font-semibold", FIELD_TOKEN_CLASS.name)}>{field.name}</span>}
        {field.required === false && <span data-field-token="optional" title="Optional field" aria-label="optional" className={cn("font-mono text-[11px] font-medium", FIELD_TOKEN_CLASS.optionalFg)}>?</span>}
      </div>
    </div>
    <div className="min-w-0 pt-0.5"><TypeValue value={field.type} /></div>
  </>;
  const props = { "data-shape-field": field.name, "data-shape-path": path, "data-shape-depth": depth, className: cn("grid min-w-0 gap-2 border-b border-solid border-[color:var(--docs-shape-rule,var(--border))] px-4 py-3 motion-reduce:transition-none sm:grid-cols-[minmax(10rem,1.25fr)_minmax(8rem,0.75fr)] sm:gap-5", depth > 0 && "bg-[color:color-mix(in_srgb,var(--muted)_7%,transparent)]") } as const;
  return linked ? <LinkTarget linkKey={path} {...props}>{content}</LinkTarget> : <div {...props}>{content}</div>;
}

export function StateShapeBlock({ id, name, description, source, fields, example }: { id: string; name?: string; description?: string; source?: StateShapeSourceProps; fields: Field[]; example?: string }) {
  const flat = useMemo(() => flattenFields(fields), [fields]);
  const model = useMemo(() => mapExample(example, flat.map((row) => row.path)), [example, flat]);
  const sourceRef = source ? source.symbol ? `${source.path}#${source.symbol}` : source.path : undefined;
  const exampleLines: LinkedCodeLine[] | undefined = model?.lines.map((line, index) => ({ content: jsonLineTokens(line), linkKey: model.keysByLine[index] }));
  return <section className="not-prose my-4 w-full min-w-0 overflow-hidden rounded-lg border-2 border-solid border-[color:var(--docs-shape-header-rule,color-mix(in_srgb,var(--foreground)_65%,var(--border)))] bg-[color:var(--docs-shape-bg,var(--background))]" data-shape-column-rules="true" data-shape-tree-geometry="true" data-docs-block-type="state-shape" data-source-id={id} data-shape-source={sourceRef}>
    <style data-variator-tokens>{"[data-docs-block-type=\"state-shape\"]:not(.dark [data-docs-block-type=\"state-shape\"]){border-width:1px !important;}\n[data-docs-block-type=\"state-shape\"]:not(.dark [data-docs-block-type=\"state-shape\"]){border-radius:4px !important;}\n[data-docs-block-type=\"state-shape\"]:not(.dark [data-docs-block-type=\"state-shape\"]) [data-shape-header],[data-docs-block-type=\"state-shape\"]:not(.dark [data-docs-block-type=\"state-shape\"]) [data-shape-header] + div:not([data-shape-grid]){border-bottom-width:1px !important;}\n[data-docs-block-type=\"state-shape\"]:not(.dark [data-docs-block-type=\"state-shape\"]) [data-shape-header]::before{opacity:0.1 !important;}\n[data-docs-block-type=\"state-shape\"]:not(.dark [data-docs-block-type=\"state-shape\"]) [data-shape-example-pane]{border-left-width:1px !important;}\n[data-docs-block-type=\"state-shape\"]:not(.dark [data-docs-block-type=\"state-shape\"]){--tree-length:8px !important;}\n[data-docs-block-type=\"state-shape\"]:not(.dark [data-docs-block-type=\"state-shape\"]){--tree-start:6px !important;}\n[data-docs-block-type=\"state-shape\"]:not(.dark [data-docs-block-type=\"state-shape\"]){--tree-width:1px !important;}[data-docs-block-type=\"state-shape\"]:not(.dark [data-docs-block-type=\"state-shape\"]) [data-shape-field] [data-tree-line]{border-width:1px !important;}"}</style><style>{DESCRIBED_NAME_STYLE}</style><LinkGroup><style>{"\n [data-shape-tree-geometry]{--tree-width:1px;--tree-start:8px;--tree-indent:22px;--tree-length:10px;--tree-gap:6px;--tree-y:0px;--tree-row-y:12px;--tree-row-border:1px}\n [data-shape-tree-geometry] [data-shape-name-cell]{position:relative;min-width:0;font-size:13px}\n [data-shape-tree-geometry] [data-shape-name-cell][data-child=\"true\"]{padding-left:calc(var(--tree-start) + (var(--ledger-depth) - 1)*var(--tree-indent) + var(--tree-length) + var(--tree-gap))}\n [data-shape-tree-geometry] [data-tree-line]{position:absolute;pointer-events:none;border-color:var(--docs-shape-child-rule,color-mix(in srgb,var(--foreground) 35%,var(--border)));border-width:var(--tree-width)}\n [data-shape-tree-geometry] [data-tree-vertical]{left:calc(var(--tree-start) + (var(--tree-level) - 1)*var(--tree-indent));top:calc(-1*var(--tree-row-y));bottom:calc(-1*(var(--tree-row-y) + var(--tree-row-border)));border-left-style:solid}\n [data-shape-tree-geometry] [data-tree-vertical][data-last=\"true\"]{bottom:auto;height:calc(var(--tree-row-y) + .65em + var(--tree-y) + var(--tree-width))}\n [data-shape-tree-geometry] [data-tree-tick]{left:calc(var(--tree-start) + (var(--ledger-depth) - 1)*var(--tree-indent) + var(--tree-width));top:calc(.65em + var(--tree-y));width:max(0px,calc(var(--tree-length) - var(--tree-width)));border-top-style:solid}\n "}</style><style>{".review-wide [data-shape-column-rules] [data-shape-grid]{column-gap:0;align-items:start}.review-wide [data-shape-column-rules] [data-shape-example-pane]{border-top-width:0;border-left-width:2px;align-self:start}"}</style>
      <header data-shape-header="true" className="relative border-b-2 border-solid border-[color:var(--docs-shape-header-rule,color-mix(in_srgb,var(--foreground)_65%,var(--border)))] bg-[color:color-mix(in_srgb,var(--docs-shape-type,#0a5779)_7%,var(--background))] px-4 py-4 before:pointer-events-none before:absolute before:inset-0 before:opacity-40 before:[background-image:radial-gradient(ellipse_at_15%_120%,transparent_55%,color-mix(in_srgb,var(--docs-shape-type,#0a5779)_14%,transparent)_56%,transparent_63%),radial-gradient(ellipse_at_75%_-35%,transparent_58%,color-mix(in_srgb,var(--docs-shape-type,#0a5779)_10%,transparent)_59%,transparent_68%)] dark:bg-[color:color-mix(in_srgb,var(--docs-shape-type,#a5d3f0)_9%,var(--background))]">
        <div className="relative min-w-0">{name && description ? <DescribedName id={descriptionId(id, "shape-description")} label={name} description={description} as="h3" nameAttrs={{ "data-shape-name": "true" }} className="m-0 break-all font-mono text-sm font-bold text-foreground" descriptionAttrs={{ "data-shape-description": "true" }} descriptionClassName={FIELD_TOKEN_CLASS.description} /> : name ? <h3 data-shape-name="true" className="m-0 break-all font-mono text-sm font-bold text-foreground">{name}</h3> : null}</div>
      </header>
      <div data-shape-grid="true" className={cn("grid min-w-0 grid-cols-1", model && "xl:grid-cols-[minmax(0,var(--docs-pane-split,46%))_minmax(0,1fr)] xl:items-start")}>
        <div data-shape-tree="true" className="min-w-0 overflow-hidden">
          {fields.length > 0 ? <><div aria-hidden data-shape-ledger-head="true" className={cn("hidden border-b-2 border-solid border-[color:var(--docs-shape-rule,var(--border))] bg-[color:color-mix(in_srgb,var(--muted)_18%,transparent)] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] sm:grid sm:grid-cols-[minmax(10rem,1.25fr)_minmax(8rem,0.75fr)] sm:gap-5", FIELD_TOKEN_CLASS.muted)}><span>Field</span><span>Type</span></div><div data-shape-ledger="true">{flat.map((row) => <FieldRow key={row.path} id={id} row={row} linked={model?.matched.has(row.path) ?? false} />)}</div></> : <div className={cn("px-4 py-3 text-xs", FIELD_TOKEN_CLASS.muted)}>(no fields)</div>}
        </div>
        {exampleLines && <div data-shape-example-pane="true" className="min-w-0 border-t-2 border-solid border-[color:var(--docs-shape-header-rule,color-mix(in_srgb,var(--foreground)_65%,var(--border)))] xl:self-start xl:border-l-2 xl:border-t-0"><div className={cn("border-b-2 border-solid border-[color:var(--docs-shape-rule,var(--border))] bg-[color:color-mix(in_srgb,var(--muted)_18%,transparent)] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]", FIELD_TOKEN_CLASS.muted)}>Example</div><CodeLines data-shape-example="true" lines={exampleLines} className="max-h-[calc(100vh-8rem)] overflow-y-auto pb-3" /></div>}
      </div>
    </LinkGroup>
  </section>;
}
