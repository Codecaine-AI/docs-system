"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Field } from "@codecaine-ai/docs-model";
import { LinkTarget } from "../linked-panels";
import { DESCRIPTION_LINE_STYLE, DescriptionLine } from "../described-name";

/**
 * The one field row of the structured-reference family (theme lab,
 * 2026-10-01). State Shape fields, Interaction Surface parameters and an
 * operation's returned fields all render through this ledger, so every field
 * row in the corpus has the same columns: a fixed name column (name in the
 * property color, a muted `?` when optional) and a definition column (type in
 * the type color with muted union pipes, then the description printed inline
 * in small muted sans; never tooltip-only). Nesting steps the name in by one
 * indent per level behind a thin guide.
 *
 * The sheet reads only `--fl-*` locals. Each host block maps its own
 * `--docs-<block>-*` knobs (with literal fallbacks) onto them, so the rail
 * tunes each block separately while the geometry stays shared.
 */

export type LedgerField = { field: Field; depth: number; path: string };

/** Depth-first flattening of a field tree; `path` is the dot-path of names. */
export function flattenFieldRows(fields: readonly Field[], depth = 0, parent = ""): LedgerField[] {
  return fields.flatMap((field) => {
    const path = parent ? `${parent}.${field.name}` : field.name;
    return [{ field, depth, path }, ...flattenFieldRows(field.fields ?? [], depth + 1, path)];
  });
}

export type TypeTextClassification = { kind: "union"; parts: string[] } | { kind: "token" } | { kind: "prose" };
const UNION_TYPE_MEMBER_PATTERN = /^[\w.$<>\[\]"'`-]+$/;
const SINGLE_TYPE_TOKEN_PATTERN = /^[\w.$<>\[\],]+(\[\])*$/;
/** Coarse shape of a type string: a union of plain members, one machine token, or free text. */
export function classifyTypeText(type: string): TypeTextClassification {
  const parts = type.split(/(\s*\|\s*)/);
  const members = parts.filter((_, index) => index % 2 === 0);
  if (members.length > 1 && members.every((member) => UNION_TYPE_MEMBER_PATTERN.test(member))) return { kind: "union", parts };
  if (!type.includes("|") && SINGLE_TYPE_TOKEN_PATTERN.test(type)) return { kind: "token" };
  return { kind: "prose" };
}

/**
 * Splits a type at its TOP-LEVEL `|` only (a pipe inside (), [], {} or <> is
 * part of its member), alternating member / separator. `string | { a | b }`
 * gives ["string", " | ", "{ a | b }"]; a type without a top-level pipe is
 * one part.
 */
export function splitTypeUnion(type: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < type.length; index += 1) {
    const char = type[index]!;
    if ("([{<".includes(char)) depth += 1;
    else if (")]}>".includes(char) && depth > 0 && type[index - 1] !== "=") depth -= 1;
    else if (char === "|" && depth === 0) {
      let left = index;
      while (left > start && type[left - 1] === " ") left -= 1;
      let right = index + 1;
      while (right < type.length && type[right] === " ") right += 1;
      parts.push(type.slice(start, left), type.slice(left, right));
      start = right;
      index = right - 1;
    }
  }
  parts.push(type.slice(start));
  return parts;
}

/** Type text in the type color; union pipes are muted punctuation. */
export function FieldType({ value }: { value?: string }) {
  if (!value) return null;
  const parts = splitTypeUnion(value);
  return <span data-field-token="type">{parts.length === 1 ? value : parts.map((part, index) => index % 2 === 0 ? <span key={index} data-type-member>{part}</span> : <span key={index} data-type-sep>{part}</span>)}</span>;
}

type DataAttributes = { [Key in `data-${string}`]?: string | number | boolean | undefined };

export type FieldLedgerRow = {
  /** Stable React key and the row's dot-path. */
  path: string;
  field: Field;
  depth: number;
  /** LinkGroup key (or chain) when the row pairs with code lines; omitted rows stay inert. */
  linkKey?: string | readonly string[];
  /** Extra hooks the host puts on the row (data-shape-path, data-param-note, ...). */
  attrs?: DataAttributes;
};

function FieldRow({ row }: { row: FieldLedgerRow }) {
  const { field, depth } = row;
  const content: ReactNode = <>
    <span data-field-name-cell>
      <span data-field-token="name">{field.name}</span>
      {field.required === false && <span data-field-token="optional"><span aria-hidden="true">?</span><span data-sr-only> (optional)</span></span>}
    </span>
    <span data-field-def>
      <FieldType value={field.type} />
      {field.description && <DescriptionLine data-field-token="description">{field.description}</DescriptionLine>}
    </span>
  </>;
  const props = { ...row.attrs, "data-field-row": row.path, "data-field-depth": depth, style: { "--field-depth": depth } as CSSProperties };
  return row.linkKey ? <LinkTarget linkKey={row.linkKey} {...props}>{content}</LinkTarget> : <div {...props}>{content}</div>;
}

/** A field ledger: one row per field, in document order. */
export function FieldLedger({ rows, ...rest }: { rows: readonly FieldLedgerRow[] } & DataAttributes) {
  return <div {...rest} data-field-ledger>{rows.map((row) => <FieldRow key={row.path} row={row} />)}</div>;
}

/**
 * Shared ledger geometry. Every value is a `--fl-*` local the host sets from
 * its own knobs. The row separator is an inset shadow painted under the
 * cells so the nesting guides run through it; a lit (linked) row keeps the
 * linking engine's rail shadow instead.
 */
export const FIELD_LEDGER_STYLE = DESCRIPTION_LINE_STYLE + `
[data-field-ledger]{min-width:0}
[data-field-row]{position:relative;display:grid;grid-template-columns:min(var(--fl-name-w),38%) minmax(0,1fr);column-gap:16px;min-height:var(--fl-row-min-h);padding:0 var(--fl-pad-x)}
[data-field-row]:not([data-lit]){box-shadow:inset 0 var(--fl-rule-w) 0 0 var(--fl-rule)}
[data-field-ledger]>[data-field-row]:first-child:not([data-lit]){box-shadow:none}
[data-field-row]:focus-visible{outline:2px solid var(--docs-focus-ring,#0078df);outline-offset:-2px}
[data-field-name-cell]{min-width:0;padding:var(--fl-row-pad) 0 var(--fl-row-pad) calc(var(--field-depth,0)*var(--fl-indent));background:repeating-linear-gradient(to right,var(--fl-guide) 0 var(--fl-guide-w),transparent var(--fl-guide-w) var(--fl-indent)) 5px 0/calc(var(--field-depth,0)*var(--fl-indent)) 100% no-repeat;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--fl-name-size);line-height:1.5;overflow-wrap:anywhere}
[data-field-token="name"]{font-weight:var(--fl-name-weight);color:var(--fl-name)}
[data-field-token="optional"]{color:var(--fl-optional)}
[data-field-def]{min-width:0;padding:var(--fl-row-pad) 0}
[data-field-token="type"]{display:block;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--fl-type-size);line-height:1.5;color:var(--fl-type);overflow-wrap:break-word}
[data-field-token="type"] [data-type-sep]{color:var(--fl-muted)}
[data-sr-only]{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (max-width:639px){[data-field-row]{grid-template-columns:minmax(0,1fr);row-gap:0}[data-field-def]{padding-top:0;padding-left:calc(var(--field-depth,0)*var(--fl-indent))}}
`;
