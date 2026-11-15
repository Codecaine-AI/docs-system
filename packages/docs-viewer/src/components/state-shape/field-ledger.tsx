"use client";

import { Fragment, useId, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
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
 * text lexed into code roles). Descriptions are hidden by default: a row with
 * a description is a toggle (a button with aria-expanded, and a chevron on
 * hover) that opens its own description under its type, and the page-wide
 * Descriptions switch ({@link DescriptionsSwitch}) opens every description in
 * every ledger on the page. Static markup has no JS to run a toggle, so there
 * a host's static fallback stands: `inlineNotes` prints every description,
 * otherwise a described name opens it as a hover / focus tooltip
 * (../described-name). Print shows every description. Nesting steps the name in
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

/** A collapsed string-literal union shows this many members, then a muted `+N`. */
const COLLAPSED_UNION_MEMBERS = 2;
const STRING_LITERAL_PATTERN = /^(["'`]).*\1$/;

/** How many members a collapsed row hides: the members past the first two of a string-literal union of 4 or more. */
function hiddenUnionMembers(parts: readonly string[]): number {
  const members = parts.filter((_, index) => index % 2 === 0);
  if (members.length <= COLLAPSED_UNION_MEMBERS + 1 || !members.every((member) => STRING_LITERAL_PATTERN.test(member))) return 0;
  return members.length - COLLAPSED_UNION_MEMBERS;
}

/**
 * Type text in the type color; union pipes are muted punctuation. With
 * `collapsed`, a long string-literal union shows its first two members and a
 * muted `+N`; the other members stay in the markup as `hidden`, so print
 * shows the whole union.
 */
export function FieldType({ value, collapsed = false }: { value?: string; collapsed?: boolean }) {
  if (!value) return null;
  const parts = splitTypeUnion(value);
  const hidden = collapsed ? hiddenUnionMembers(parts) : 0;
  const shownParts = COLLAPSED_UNION_MEMBERS * 2;
  return <span data-field-token="type">{parts.length === 1 ? <TypeMemberTokens text={value} camel={!/\s/.test(value)} /> : <>
    {parts.map((part, index) => {
      const extra = hidden > 0 && index >= shownParts - 1 ? { hidden: true, "data-type-extra": "" } : {};
      return index % 2 === 0 ? <span key={index} data-type-member {...extra}><TypeMemberTokens text={part} /></span> : <span key={index} data-type-sep {...extra}>{part}</span>;
    })}
    {hidden > 0 && <><span data-type-sep data-type-more-sep>{parts[shownParts - 1]}</span><span data-type-more title={value}><span aria-hidden="true">+{hidden}</span><span data-sr-only>and {hidden} more</span></span></>}
  </>}</span>;
}

/*
 * The page-wide Descriptions switch. One value for the whole page (every
 * ledger in every block reads it), held in memory only: it starts off and a
 * reload resets it.
 */
let showAllDescriptions = false;
const switchListeners = new Set<() => void>();
function subscribeSwitch(listener: () => void) {
  switchListeners.add(listener);
  return () => { switchListeners.delete(listener); };
}
function setShowAllDescriptions(on: boolean) {
  showAllDescriptions = on;
  for (const listener of switchListeners) listener();
}
/** True when the page-wide Descriptions switch is on. Static markup reads false. */
function useShowAllDescriptions(): boolean {
  return useSyncExternalStore(subscribeSwitch, () => showAllDescriptions, () => false);
}
const subscribeNothing = () => () => {};
/** True in a live React tree; false in static markup, which has no JS to run a toggle. */
function useInteractive(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

/**
 * The block-head switch that shows every field description on the page. It
 * renders only in a live React tree; static markup keeps its fallback.
 */
export function DescriptionsSwitch() {
  const interactive = useInteractive();
  const on = useShowAllDescriptions();
  if (!interactive) return null;
  return <button type="button" role="switch" aria-checked={on} data-descriptions-switch="" onClick={() => setShowAllDescriptions(!on)}>
    <span data-switch-track="" aria-hidden="true" />Descriptions
  </button>;
}

/** True when any row has a description, so its block head shows the Descriptions switch. */
export function hasDescribedRows(rows: readonly Pick<FieldLedgerRow, "field">[]): boolean {
  return rows.some((row) => Boolean(row.field.description));
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

/** Renders a field description's text. A host without one prints the description as plain text. */
export type NoteRenderer = (description: string) => ReactNode;

/** Enter / Space on the row toggle stay on the button, so the row's link handler cannot cancel its click. */
function keepToggleKeys(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
}

function ToggleFieldRow({ row, guides, noteId, showAll, renderNote }: { row: FieldLedgerRow; guides: readonly TreeGuide[]; noteId: string; showAll: boolean; renderNote?: NoteRenderer }) {
  const { field, depth } = row;
  const [open, setOpen] = useState(false);
  const described = Boolean(field.description);
  const expanded = described && (open || showAll);
  const optional = field.required === false && <span data-field-token="optional"><span aria-hidden="true">?</span><span data-sr-only> (optional)</span></span>;
  const name = <span data-field-token="name">{monoBreaks(field.name, { underscore: true })}</span>;
  const content: ReactNode = <>
    <TreeGuides guides={guides} />
    <span data-field-name-cell>
      {described
        ? <button type="button" data-field-toggle="" aria-expanded={expanded} aria-controls={noteId} onKeyDown={keepToggleKeys}><ChevronRight aria-hidden="true" data-field-chevron="" />{name}{optional}</button>
        : <>{name}{optional}</>}
    </span>
    <span data-field-def>
      <FieldType value={field.type} collapsed={described && !expanded} />
      {described && <span data-field-token="note" id={noteId} hidden={!expanded}>{renderNote ? renderNote(field.description!) : field.description}</span>}
    </span>
  </>;
  // A click anywhere on the row but its open description toggles it. The switch holds every row open, so a click then changes nothing.
  const toggle = (event: MouseEvent) => {
    if (showAll || (event.target as Element).closest('[data-field-token="note"]')) return;
    setOpen((value) => !value);
  };
  const props = { ...row.attrs, "data-field-row": row.path, "data-field-depth": depth, "data-field-open": expanded ? "true" : undefined, onClickCapture: described ? toggle : undefined, style: { "--field-depth": depth } as CSSProperties };
  return row.linkKey ? <LinkTarget linkKey={row.linkKey} {...props}>{content}</LinkTarget> : <div {...props}>{content}</div>;
}

function StaticFieldRow({ row, guides, tipId, inline, renderNote }: { row: FieldLedgerRow; guides: readonly TreeGuide[]; tipId: string; inline: boolean; renderNote?: NoteRenderer }) {
  const { field, depth } = row;
  const optional = field.required === false && <span data-field-token="optional"><span aria-hidden="true">?</span><span data-sr-only> (optional)</span></span>;
  const content: ReactNode = <>
    <TreeGuides guides={guides} />
    <span data-field-name-cell>
      {field.description && !inline
        ? <DescribedName id={tipId} name={monoBreaks(field.name, { underscore: true })} tip={field.description} nameAttrs={{ "data-field-token": "name" }} tipAttrs={{ "data-field-token": "description" }}>{optional}</DescribedName>
        : <><span data-field-token="name">{monoBreaks(field.name, { underscore: true })}</span>{optional}</>}
    </span>
    <span data-field-def>
      <FieldType value={field.type} />
      {inline && field.description && <span data-field-token="note">{renderNote ? renderNote(field.description) : field.description}</span>}
    </span>
  </>;
  const props = { ...row.attrs, "data-field-row": row.path, "data-field-depth": depth, style: { "--field-depth": depth } as CSSProperties };
  return row.linkKey ? <LinkTarget linkKey={row.linkKey} {...props}>{content}</LinkTarget> : <div {...props}>{content}</div>;
}

/**
 * A field ledger: one row per field, in document order. A row shows the name
 * and type only. In a live React tree, a described row toggles its own
 * description open under its type, and the page-wide Descriptions switch
 * opens them all. Static markup cannot toggle, so it keeps the static
 * fallback: with `inlineNotes` each description prints under its type,
 * otherwise it opens as a tooltip on the name (DescribedName). Print shows
 * every description.
 */
export function FieldLedger({ rows, inlineNotes = false, renderNote, ...rest }: { rows: readonly FieldLedgerRow[]; inlineNotes?: boolean; renderNote?: NoteRenderer } & DataAttributes) {
  const idBase = useId();
  const interactive = useInteractive();
  const showAll = useShowAllDescriptions();
  const guides = ledgerGuides(rows);
  return <div {...rest} data-field-ledger data-field-toggles={interactive ? "true" : undefined}>{rows.map((row, index) => interactive
    ? <ToggleFieldRow key={row.path} row={row} guides={guides[index]!} noteId={`${idBase}-note-${index}`} showAll={showAll} renderNote={renderNote} />
    : <StaticFieldRow key={row.path} row={row} guides={guides[index]!} tipId={`${idBase}-tip-${index}`} inline={inlineNotes} renderNote={renderNote} />)}</div>;
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
[data-field-name-cell]{flex:0 0 calc(var(--fl-name-w) - var(--field-depth,0)*var(--fl-indent));min-width:0;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--fl-name-size);line-height:var(--ds-line-height-ui);overflow-wrap:break-word}
[data-field-name-cell]>[data-described]{display:inline-flex;align-items:baseline}
[data-field-name-cell] [data-has-description]{min-width:0}
[data-field-token="name"]{font-weight:var(--fl-name-weight);color:var(--fl-name)}
[data-field-token="optional"]{margin-left:var(--ds-space-0-5);color:var(--fl-optional)}
[data-field-def]{flex:1 1 0;min-width:0}
[data-field-token="type"]{display:block;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--fl-type-size);line-height:var(--ds-line-height-ui);color:var(--fl-type);overflow-wrap:anywhere;word-break:normal}
[data-field-token="type"] [data-type-sep]{color:var(--fl-muted)}
[data-field-token="note"]{display:block;margin-top:var(--ds-space-0-5);font-family:var(--docs-font-body,var(--font-sans,ui-sans-serif,system-ui,sans-serif));font-size:var(--fl-desc-size,13.5px);line-height:var(--ds-line-height-ui);color:var(--fl-desc,var(--docs-muted,#666562));overflow-wrap:break-word}
[data-field-ledger]:has([data-field-token="note"]){container-type:inline-size}
@container (min-width:600px){[data-field-def]:has(>[data-field-token="note"]:not([hidden])){display:flex;align-items:baseline;column-gap:var(--ds-space-6)}[data-field-def]>[data-field-token="type"]{flex:0 0 var(--fl-type-w,20ch);min-width:0}[data-field-def]>[data-field-token="note"]{flex:1 1 0;min-width:0;margin-top:0}}
[data-type-tok="string"]{color:var(--fl-type-string,inherit)}
[data-type-tok="number"]{color:var(--fl-type-number,inherit)}
[data-type-tok="keyword"]{color:var(--fl-type-keyword,inherit)}
[data-type-tok="key"]{color:var(--fl-type-key,inherit)}
[data-type-tok="punct"]{color:var(--fl-type-punct,inherit)}
[data-field-toggle]{position:relative;display:inline-flex;align-items:baseline;max-width:100%;margin:0;padding:0;border:0;border-radius:var(--ds-radius-base);background:none;color:inherit;font:inherit;line-height:inherit;text-align:left;cursor:pointer}
[data-field-toggle]:focus-visible{outline:var(--ds-border-width-focus) solid var(--docs-focus-ring,#0078df);outline-offset:var(--ds-focus-ring-offset)}
[data-field-chevron]{position:absolute;right:calc(100% + var(--ds-space-0-5));top:calc((1lh - var(--ds-space-3)) / 2);width:var(--ds-space-3);height:var(--ds-space-3);color:var(--fl-muted);transition:opacity 120ms var(--ds-motion-easing-standard),rotate 120ms var(--ds-motion-easing-standard)}
[data-field-ledger] [data-field-toggle]>svg[data-field-chevron]{opacity:0}
[data-field-ledger] [data-field-row]:is(:hover,[data-field-open]) [data-field-toggle]>svg[data-field-chevron],[data-field-ledger] [data-field-toggle]:focus-visible>svg[data-field-chevron]{opacity:1}
[data-field-open] [data-field-chevron]{rotate:90deg}
[data-field-toggles] [data-field-row]:has([data-field-toggle]){cursor:pointer}
[data-field-token="type"] [data-type-more]{color:var(--fl-muted)}
[data-descriptions-switch]{display:inline-flex;flex:none;align-items:center;gap:var(--ds-space-1-5);margin:0;padding:var(--ds-space-0-5) var(--ds-space-2) var(--ds-space-0-5) var(--ds-space-1);border:var(--ds-border-width-hairline) solid var(--docs-rule,#e6e5e3);border-radius:var(--ds-radius-pill);background:none;font-family:var(--docs-font-body,var(--font-sans,ui-sans-serif,system-ui,sans-serif));font-size:var(--ds-font-size-ui-xs);line-height:1.4;color:var(--docs-muted,#666562);cursor:pointer}
[data-descriptions-switch]:hover,[data-descriptions-switch][aria-checked="true"]{color:var(--docs-ink,#1f1f1f)}
[data-descriptions-switch]:focus-visible{outline:var(--ds-border-width-focus) solid var(--docs-focus-ring,#0078df);outline-offset:var(--ds-focus-ring-offset)}
[data-switch-track]{position:relative;width:22px;height:var(--ds-space-3);border-radius:var(--ds-radius-pill);background:var(--docs-rule,#e6e5e3)}
[data-switch-track]::after{content:"";position:absolute;left:2px;top:2px;width:8px;height:8px;border-radius:50%;background:var(--docs-muted,#666562);transition:left 120ms var(--ds-motion-easing-standard)}
[data-descriptions-switch][aria-checked="true"] [data-switch-track]{background:color-mix(in srgb,var(--docs-accent,#0078df) 35%,transparent)}
[data-descriptions-switch][aria-checked="true"] [data-switch-track]::after{left:12px;background:var(--docs-accent,#0078df)}
@media (prefers-reduced-motion:reduce){[data-field-chevron],[data-switch-track]::after{transition:none}}
@media print{[data-field-token="note"][hidden]{display:block}[data-field-token="type"] [data-type-extra][hidden]{display:inline}[data-type-more],[data-type-more-sep],[data-field-chevron],[data-descriptions-switch]{display:none}}
[data-sr-only]{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;
