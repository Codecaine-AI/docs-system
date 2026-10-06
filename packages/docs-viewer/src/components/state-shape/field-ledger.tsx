"use client";

import { Fragment, useId, type CSSProperties, type ReactNode } from "react";
import type { Field } from "@codecaine-ai/docs-model";
import { LinkTarget } from "../linked-panels";
import { DESCRIBED_NAME_STYLE, DescribedName } from "../described-name";
import { elbowGuides, TREE_GUIDES_CSS, TreeGuides, type TreeGuide } from "../outline-rows/tree-rows";
import { tokenizeSigType } from "../interaction-surface/signature-tokens";
import { monoBreaks } from "../mono-breaks";

/**
 * The one field row of the structured-reference family (theme lab,
 * 2026-10-01). State Shape fields, Interaction Surface parameters and an
 * operation's returned fields all render through this ledger, so every field
 * row in the corpus has the same columns: a fixed name column (name in the
 * property color, a punctuation `?` when optional) and a type column (type
 * text lexed into code roles). A described name has a dotted underline and
 * opens its description as a hover / focus tooltip (../described-name),
 * printed inline beneath the name in print media. Nesting steps the name in
 * by one indent per level, joined to its parent by the file tree's elbow
 * connectors (../outline-rows/tree-rows `elbowGuides` / `TreeGuides`).
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

/**
 * One union member as role-tagged spans, lexed like a signature's type text
 * (../interaction-surface/signature-tokens): a type name keeps the type
 * color, and string / number literals, literal keywords, object keys and
 * punctuation each carry `data-type-tok` so a host can color them as its code
 * theme colors a TypeScript type. Unset roles inherit the type color.
 */
function TypeMemberTokens({ text, camel = false }: { text: string; camel?: boolean }) {
  return <>{tokenizeSigType(text).map((token, index) => {
    if (token.kind === "space") return token.text;
    if (token.kind === "type-name") return <Fragment key={index}>{monoBreaks(token.text, { camel })}</Fragment>;
    const role = token.kind === "boolean" || token.kind === "null" ? "keyword" : token.kind;
    return <span key={index} data-type-tok={role}>{monoBreaks(token.text)}</span>;
  })}</>;
}

/** Type text in the type color; union pipes are muted punctuation. */
export function FieldType({ value }: { value?: string }) {
  if (!value) return null;
  const parts = splitTypeUnion(value);
  return <span data-field-token="type">{parts.length === 1 ? <TypeMemberTokens text={value} camel={!/\s/.test(value)} /> : parts.map((part, index) => index % 2 === 0 ? <span key={index} data-type-member><TypeMemberTokens text={part} /></span> : <span key={index} data-type-sep>{part}</span>)}</span>;
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

/**
 * The tree connectors for each row, in document order, the way the file
 * tree and call stack draw them (outline-rows/tree-rows.tsx `elbowGuides`):
 * a row is the last child when no later sibling follows before the list
 * climbs out of its parent; each ancestor below the root contributes a pipe
 * (it has later siblings) or a blank, then the row's own tee / end elbow.
 */
export function ledgerGuides(rows: readonly Pick<FieldLedgerRow, "depth">[]): TreeGuide[][] {
  const last = rows.map((row, index) => {
    for (let next = index + 1; next < rows.length; next += 1) {
      if (rows[next]!.depth < row.depth) return true;
      if (rows[next]!.depth === row.depth) return false;
    }
    return true;
  });
  const ancestorsLast: boolean[] = [];
  return rows.map((row, index) => {
    ancestorsLast.length = Math.min(ancestorsLast.length, row.depth);
    const guides = elbowGuides(ancestorsLast, last[index]!);
    ancestorsLast.push(last[index]!);
    return guides;
  });
}

function FieldRow({ row, guides, tipId }: { row: FieldLedgerRow; guides: readonly TreeGuide[]; tipId: string }) {
  const { field, depth } = row;
  const optional = field.required === false && <span data-field-token="optional"><span aria-hidden="true">?</span><span data-sr-only> (optional)</span></span>;
  const content: ReactNode = <>
    <TreeGuides guides={guides} />
    <span data-field-name-cell>
      {field.description
        ? <DescribedName id={tipId} name={monoBreaks(field.name, { underscore: true })} tip={field.description} nameAttrs={{ "data-field-token": "name" }} tipAttrs={{ "data-field-token": "description" }}>{optional}</DescribedName>
        : <><span data-field-token="name">{monoBreaks(field.name, { underscore: true })}</span>{optional}</>}
    </span>
    <span data-field-def>
      <FieldType value={field.type} />
    </span>
  </>;
  const props = { ...row.attrs, "data-field-row": row.path, "data-field-depth": depth, style: { "--field-depth": depth } as CSSProperties };
  return row.linkKey ? <LinkTarget linkKey={row.linkKey} {...props}>{content}</LinkTarget> : <div {...props}>{content}</div>;
}

/**
 * A field ledger: one row per field, in document order. A row shows the name
 * and type; a field's description opens as a tooltip on its name
 * (DescribedName) and prints inline in print media.
 */
export function FieldLedger({ rows, ...rest }: { rows: readonly FieldLedgerRow[] } & DataAttributes) {
  const tipBase = useId();
  const guides = ledgerGuides(rows);
  return <div {...rest} data-field-ledger>{rows.map((row, index) => <FieldRow key={row.path} row={row} guides={guides[index]!} tipId={`${tipBase}-tip-${index}`} />)}</div>;
}

/**
 * Shared ledger geometry. A row is ONE flex line (never wrapping): a fixed
 * name column, --fl-name-w (24ch of the mono name font by default), a 24px
 * gap, then the type column taking the rest. The column is the same in every
 * ledger on the page, so the type column starts at the same x in every
 * stacked State Shape and Interaction Surface ledger, and a type never moves
 * under its name: it starts in the type column on the name's first line and
 * wraps INSIDE that column. Names wrap inside their column at the `<wbr>`s
 * monoBreaks puts after `/ . - _ | ,`; the described-name wrapper is an
 * inline-flex so the row's baseline (and the type beside it) stays on the
 * name's first line. Types wrap at spaces and after `/ . - | ,` (never at
 * `_`, so `"funding_change"` stays whole); a lone identifier type also
 * breaks between camel humps (`Noncommercial` / `Topic[]`) when it cannot fit
 * whole, and any run still too long breaks anywhere as a last resort. The
 * row's left padding carries the nesting indent and the name cell is that
 * much narrower, so the indent eats into the column and the type column x
 * never moves. The tree connectors' elbow sits on the name's first line (--tr-row is twice its centre: the cell's top padding plus half the
 * 1.5 line height), not on the row box, so a row's min-height (a theme may
 * set it to 0) or a wrapped type never moves it. Every value is a `--fl-*`
 * local the host sets from its own knobs. The row separator is an inset shadow painted under the
 * cells so the nesting guides run through it; a lit (linked) row keeps the
 * linking engine's rail shadow instead.
 */
export const FIELD_LEDGER_STYLE = DESCRIBED_NAME_STYLE + TREE_GUIDES_CSS + `
[data-field-ledger]{min-width:0;--tr-x0:var(--fl-pad-x);--tr-indent:var(--fl-indent);--tr-guide-x:var(--ds-space-1);--tr-row:calc(2*var(--fl-row-pad) + 1.5*var(--fl-name-size));--tr-guide:var(--fl-guide)}
[data-field-ledger] .docs-tree__guides>i::before{border-left-width:var(--fl-guide-w)}
[data-field-ledger] .docs-tree__guides>i::after{border-top-width:var(--fl-guide-w)}
[data-field-row]:has([data-described]:hover),[data-field-row]:has([data-has-description]:focus-visible){z-index:3}
[data-field-ledger]>[data-field-row]:nth-last-child(-n+2):not(:first-child) [data-description-tip]{top:auto;bottom:calc(100% + var(--ds-space-1-5))}
[data-field-row]{position:relative;display:flex;flex-wrap:nowrap;align-items:baseline;column-gap:var(--ds-space-6);box-sizing:border-box;min-height:var(--fl-row-min-h);padding:var(--fl-row-pad) var(--fl-pad-x) var(--fl-row-pad) calc(var(--fl-pad-x) + var(--field-depth,0)*var(--fl-indent))}
[data-field-row]:not([data-lit]){box-shadow:inset 0 var(--fl-rule-w) 0 0 var(--fl-rule)}
[data-field-ledger]>[data-field-row]:first-child:not([data-lit]){box-shadow:none}
[data-field-row]:focus-visible{outline:var(--ds-border-width-focus) solid var(--docs-focus-ring,#0078df);outline-offset:calc(-1 * var(--ds-border-width-focus))}
[data-field-name-cell]{flex:0 0 calc(var(--fl-name-w) - var(--field-depth,0)*var(--fl-indent));min-width:0;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--fl-name-size);line-height:1.5;overflow-wrap:break-word}
[data-field-name-cell]>[data-described]{display:inline-flex;align-items:baseline}
[data-field-name-cell] [data-has-description]{min-width:0}
[data-field-token="name"]{font-weight:var(--fl-name-weight);color:var(--fl-name)}
[data-field-token="optional"]{margin-left:var(--ds-space-0-5);color:var(--fl-optional)}
[data-field-def]{flex:1 1 0;min-width:0}
[data-field-token="type"]{display:block;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--fl-type-size);line-height:1.5;color:var(--fl-type);overflow-wrap:anywhere;word-break:normal}
[data-field-token="type"] [data-type-sep]{color:var(--fl-muted)}
[data-type-tok="string"]{color:var(--fl-type-string,inherit)}
[data-type-tok="number"]{color:var(--fl-type-number,inherit)}
[data-type-tok="keyword"]{color:var(--fl-type-keyword,inherit)}
[data-type-tok="key"]{color:var(--fl-type-key,inherit)}
[data-type-tok="punct"]{color:var(--fl-type-punct,inherit)}
[data-sr-only]{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;
