"use client";

import { Fragment, useId, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Braces, ChevronRight } from "lucide-react";
import { printJsonLines, type Field } from "@codecaine-ai/docs-model";
import { DescribedName } from "../described-name";
import { CodeLines, LinkGroup, type LinkedCodeLine } from "../linked-panels";
import { monoBreaks } from "../mono-breaks";
import { DescriptionsSwitch, FIELD_LEDGER_STYLE, FieldLedger, flattenFieldRows, hasDescribedRows, useInteractive, type FieldLedgerRow } from "./field-ledger";

export { classifyTypeText, splitTypeUnion, type TypeTextClassification } from "./field-ledger";

export const STATE_SHAPE_LABEL = "State Shape";
export const STATE_SHAPE_AGENT_DESCRIPTION = "A bounded field inspector with a linked JSON companion. A plain panel head shows the reference family tile, the shape name in mono, and, at the right, the source as a muted basename#Symbol source reference whose full path#Symbol opens in a tooltip on hover or focus; the shape's own description prints beneath the head. The whole panel is a dark code panel colored like a TypeScript type in VS Code Dark+. Every field is one ledger row: the name in the property color with a punctuation ? when optional (a name of several words, such as kind \"command\" adds, colors a quoted word as a string literal and each other word after the first as a keyword), then the type (type names teal, string literals orange, punctuation plain). A string-literal union of 4 or more values shows its first 2 values and a muted +N while its row is closed. Field descriptions are hidden by default: clicking a described row (a button with aria-expanded and a chevron on hover) opens its description under its type, and clicking again closes it. A Descriptions switch at the right of the head shows only its track until hover or focus slides out the word Descriptions; it shows every description in every ledger on the page; it is not saved and resets on reload. A shown description sits in a third column when the ledger is 600px wide or more, and under the type when it is narrower. Static markup without JS prints every description beside its type. Nested fields hang off their parent with file-tree elbow connectors. The JSON example sits in a code pane beside the fields, as wide as its widest line up to 48 columns and never more than 56% of the block; the fields take the rest. An array of 3 or more items whose items after the first take 8 or more lines starts folded: it shows its first item, then a … N more button line; that button or the chevron on the array's opening line opens it, and the chevron closes it again; static markup prints every line. Hover, focus, click, Enter, Space, and Escape coordinate field paths with every matching JSON occurrence. The shape is always open.";
export type StateShapeSourceProps = { path: string; symbol?: string };

/**
 * Plain panel per the theme lab (2026-10-01): no tinted or textured header,
 * no column heads. The whole panel is a code surface
 * ([data-code-surface]), so it renders as the dark code panel in both page
 * modes and the field list reads the way the editor colors a TypeScript
 * type: names --syntax-key, types --syntax-type, string-literal types
 * --syntax-string, the ? marker and type punctuation --syntax-punctuation
 * (VS Code Dark+ by default; each literal fallback is the Dark+ value).
 * Field descriptions are hidden until a reader opens a row or turns on the
 * head's page-wide Descriptions switch; static markup prints them beside
 * their types (the ledger's inlineNotes fallback). The head's source shows basename#Symbol with
 * the full path in a tooltip (../described-name). Nested fields use the file tree's elbow connectors, colored by
 * --docs-shape-child-rule. Every visual value reads a --docs-shape-*
 * knob (the style rail's State shape pane, THEME_TOKEN_REGISTRY
 * ["state-shape"]) with a fallback equal to its default; the shared field
 * ledger (./field-ledger) reads the `--fl-*` locals mapped here.
 */
export const STATE_SHAPE_STYLE = `
[data-docs-block-type="state-shape"]{container-type:inline-size;margin:var(--ds-space-4) 0;overflow:hidden;color:var(--docs-text,#2a2a2a);background:var(--docs-shape-bg,var(--docs-panel,#f8f8f7));border:var(--docs-shape-border-width,1px) solid var(--docs-shape-border,var(--docs-rule,#e6e5e3));border-radius:var(--docs-shape-radius,var(--radius,2px));--fl-pad-x:var(--docs-shape-pad-x,16px);--fl-row-pad:var(--docs-shape-row-pad,5px);--fl-row-min-h:var(--docs-shape-row-min-height,28px);--fl-rule:var(--docs-shape-rule,var(--docs-rule-soft,#efeeec));--fl-rule-w:var(--docs-shape-rule-width,1px);--fl-name-w:min(calc(var(--docs-shape-name-width,24ch) + 8ch),var(--shape-name-fit,24ch));--fl-indent:var(--docs-shape-indent,16px);--fl-guide:var(--docs-shape-child-rule,color-mix(in srgb,var(--docs-ink,#1f1f1f) 75%,transparent));--fl-guide-w:var(--docs-shape-child-rule-width,1px);--fl-name:var(--docs-shape-name,var(--syntax-key,#9cdcfe));--fl-name-weight:var(--docs-shape-name-weight,500);--fl-name-size:var(--docs-shape-text-size,13px);--fl-type:var(--docs-shape-type,var(--syntax-type,#4ec9b0));--fl-type-size:var(--docs-shape-type-text-size,13px);--fl-muted:var(--docs-shape-muted,var(--syntax-punctuation,#d4d4d4));--fl-optional:var(--docs-shape-optional-fg,var(--syntax-punctuation,#d4d4d4));--fl-type-string:var(--syntax-string,#ce9178);--fl-type-number:var(--syntax-number,#b5cea8);--fl-type-keyword:var(--syntax-keyword,#569cd6);--fl-type-key:var(--fl-name);--fl-type-punct:var(--fl-muted);--fl-desc:var(--docs-shape-desc-fg,var(--docs-muted,#666562));--fl-desc-size:var(--docs-shape-desc-text-size,13.5px)}
[data-shape-header]{display:flex;align-items:center;gap:var(--ds-space-2);min-height:var(--ds-space-8);padding:var(--docs-shape-header-pad-y,6px) var(--docs-shape-pad-x,16px);background:var(--docs-shape-header-bg,var(--docs-panel,#f8f8f7));border-bottom:var(--docs-shape-header-rule-width,1px) solid var(--docs-shape-header-rule,var(--docs-rule-soft,#efeeec))}
[data-shape-name]{margin:0;min-width:0;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--docs-shape-header-text-size,13px);font-weight:var(--docs-shape-header-weight,600);line-height:var(--ds-line-height-tight);color:var(--docs-shape-header-fg,var(--docs-ink,#1f1f1f));overflow-wrap:normal}
[data-shape-header]>[data-described]{margin-left:auto;min-width:0}
[data-shape-header]>[data-descriptions-switch]{margin-left:auto}
[data-shape-header]>[data-described]+[data-descriptions-switch]{margin-left:var(--ds-space-3)}
[data-shape-source-ref]{display:inline-block;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--ds-font-size-ui-xs);line-height:1.4;color:var(--docs-muted,#666562);overflow-wrap:normal}
[data-shape-header] [data-description-tip]{left:auto;right:calc(-1 * var(--ds-space-2));max-width:min(var(--ds-layout-lane-text),calc(100cqi - var(--ds-space-6)));font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--ds-font-size-ui-xs);color:var(--docs-text,#2a2a2a);overflow-wrap:anywhere}
@media print{[data-shape-header] [data-description-tip]{display:none}}
[data-shape-description]{margin:0;padding:var(--ds-space-2) var(--docs-shape-pad-x,16px);max-width:calc(var(--ds-layout-lane-text) + 2*var(--docs-shape-pad-x,16px));font-size:var(--ds-font-size-ui-md);line-height:var(--ds-line-height-ui);color:var(--docs-text,#2a2a2a);border-bottom:var(--docs-shape-rule-width,1px) solid var(--docs-shape-rule,var(--docs-rule-soft,#efeeec))}
[data-shape-grid]{display:grid;grid-template-columns:minmax(0,1fr)}
[data-shape-tree]{min-width:0;padding:var(--ds-space-1) 0}
[data-shape-empty]{margin:0;padding:var(--ds-space-1-5) var(--docs-shape-pad-x,16px);font-size:var(--ds-font-size-ui-md);color:var(--docs-shape-desc-fg,var(--docs-muted,#666562))}
[data-shape-example-pane]{min-width:0;background:var(--docs-code-block-bg,color-mix(in srgb,var(--muted) 30%,transparent));border-top:var(--docs-shape-pane-rule-width,1px) solid var(--docs-shape-border,var(--docs-rule,#e6e5e3))}
@container (min-width:560px){[data-shape-grid][data-has-example]{grid-template-columns:minmax(min(360px,calc(100% - 260px)),var(--docs-pane-split,44%)) minmax(260px,1fr)}[data-shape-grid][data-has-example] [data-shape-example-pane]{border-top:0;border-left:var(--docs-shape-pane-rule-width,1px) solid var(--docs-shape-border,var(--docs-rule,#e6e5e3))}}
.review-wide [data-shape-grid][data-has-example]{grid-template-columns:minmax(min(360px,calc(100% - 260px)),var(--docs-pane-split,44%)) minmax(260px,1fr)}
@container (min-width:560px){[data-shape-grid][data-has-example][data-example-fit]{grid-template-columns:minmax(min(360px,calc(100% - 260px)),1fr) minmax(260px,min(var(--shape-example-w),56%))}}
@container (max-width:559px){[data-shape-ledger]{--fl-name-w:min(var(--docs-shape-name-width,24ch),var(--shape-name-fit,24ch))}}
[data-docs-block-type="state-shape"] [data-type-tok="string"]{white-space:nowrap}
[data-docs-block-type="state-shape"] [data-json-seg]{display:inline-block;max-width:100%;text-indent:0;white-space:pre-wrap;overflow-wrap:anywhere}
[data-docs-block-type="state-shape"] [data-json-pair]{white-space:pre}[data-docs-block-type="state-shape"] [data-json-pair]>[data-json-token]:last-child{white-space:pre-wrap}[data-docs-block-type="state-shape"] [data-json-glue]{white-space:nowrap}[data-docs-block-type="state-shape"] [data-field-token="optional"]{margin-left:0}[data-docs-block-type="state-shape"] [data-field-token="note"]{margin-top:var(--ds-space-1);text-wrap:pretty}
[data-docs-block-type="state-shape"] [data-note-code]{font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);color:var(--docs-shape-name,var(--syntax-key,#9cdcfe));white-space:nowrap;padding:0;background:none;border:0}[data-docs-block-type="state-shape"] [data-note-code="long"]{white-space:normal;overflow-wrap:anywhere}
`;

/**
 * The structured-reference family tile (theme lab): a 16px tile in the
 * family's solid color with the block glyph in the tile-glyph color. State
 * Shape and Interaction Surface are the reference family (violet).
 */
export const REF_TILE_STYLE = `
[data-ref-tile]{display:inline-flex;flex:none;align-items:center;justify-content:center;width:var(--ds-space-4);height:var(--ds-space-4);border-radius:var(--ds-radius-base);background:var(--docs-fam-ref-solid,#6940a5);color:var(--docs-tile-glyph,#ffffff)}
[data-ref-tile]>svg{display:block;width:11px;height:11px;stroke-width:2.25}
`;

/**
 * Code panes beside a ledger (a JSON example, an operation signature). The
 * pane is a code surface, so it renders as the dark code panel the code
 * theme drives; the lab drops the line-number gutter and the zebra, keeps
 * the linking wash, and makes the pane a focusable region. Unlike a code
 * block, these panes SOFT-WRAP: a long JSON string continues on the next
 * visual line instead of scrolling the pane sideways. Each line's content is
 * a {@link hangingLine} span, so continuation lines hang 2ch past the line's
 * own indent (under its value, not at column 0). String literals may break
 * anywhere; everything else breaks at spaces first. The line row grows with
 * its wrapped text, so a lit (linked) line's wash and rail cover every
 * visual line of it. Text insets follow the host's --fl-pad-x.
 */
export const REF_CODE_PANE_STYLE = `
[data-ref-code] [data-line-number],[data-ref-code] [data-code-lines-filler]{display:none}
[data-ref-code] [data-code-line]:not([data-lit]){background:none}
[data-ref-code] [data-code-lines]{padding:var(--ds-space-2) 0}
[data-ref-code] [data-code-lines]>:first-child{width:auto}
[data-ref-code] [data-code-line]{height:auto;white-space:pre-wrap;tab-size:2}
[data-ref-code] [data-line-text]{flex:1 1 auto;min-width:0;padding:0 var(--fl-pad-x,16px);overflow-wrap:break-word}
[data-ref-code] [data-hang]{display:block;padding-left:calc(var(--hang,0ch) + 2ch);text-indent:calc(-1*(var(--hang,0ch) + 2ch))}
[data-ref-code] :is([data-json-token="string"],[data-sig-token="string"]){overflow-wrap:anywhere}
[data-ref-code] [data-code-lines]:focus-visible{outline:var(--ds-border-width-focus) solid var(--docs-focus-ring,#0078df);outline-offset:calc(-1 * var(--ds-border-width-focus))}
[data-ref-code] [data-line-text]{position:relative}
[data-fold-toggle]{position:absolute;left:calc(var(--fl-pad-x,16px) - var(--ds-space-3) - var(--ds-space-0-5));top:calc((1lh - var(--ds-space-3)) / 2);display:inline-flex;align-items:center;justify-content:center;width:var(--ds-space-3);height:var(--ds-space-3);margin:0;padding:0;border:0;border-radius:var(--ds-radius-base);background:none;color:var(--syntax-punctuation,#d4d4d4);opacity:.55;cursor:pointer}
[data-fold-toggle]>svg{width:var(--ds-space-3);height:var(--ds-space-3);transition:rotate 120ms var(--ds-motion-easing-standard)}
[data-fold-toggle][aria-expanded="true"]>svg{rotate:90deg}
[data-fold-toggle]:hover,[data-fold-toggle]:focus-visible{opacity:1}
[data-fold-toggle]:focus-visible,[data-fold-more]:focus-visible{outline:var(--ds-border-width-focus) solid var(--docs-focus-ring,#0078df);outline-offset:var(--ds-focus-ring-offset)}
[data-fold-more]{display:inline;margin:0;padding:0 var(--ds-space-1);border:0;border-radius:var(--ds-radius-base);background:color-mix(in srgb,var(--syntax-punctuation,#d4d4d4) 12%,transparent);font:inherit;color:var(--syntax-punctuation,#d4d4d4);cursor:pointer}
[data-fold-more]:hover{background:color-mix(in srgb,var(--syntax-punctuation,#d4d4d4) 22%,transparent)}
@media (prefers-reduced-motion:reduce){[data-fold-toggle]>svg{transition:none}}
@media not print{[data-ref-code] [data-code-line]:has(>[data-line-text]>[data-fold-hidden]){display:none}}
@media print{[data-fold-toggle],[data-code-line]:has([data-fold-more-line]){display:none}}
`;

/**
 * One soft-wrapping code line: the content inside a `data-hang` block whose
 * hanging indent (--hang, in ch of the pane's mono font) is the line's own
 * leading whitespace. The leading spaces stay in the text (copy keeps the
 * indentation); a negative text-indent pulls the first visual line back so
 * they render as before, and continuation lines start at indent + 2ch.
 */
export function hangingLine(indent: number, content: ReactNode): ReactNode {
  return <span data-hang="" style={{ "--hang": `${indent}ch` } as CSSProperties}>{content}</span>;
}

/** Leading-whitespace width of a source line in columns (a tab counts as 2, the panes' tab size). */
export function leadingColumns(line: string): number {
  const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
  let columns = 0;
  for (const char of lead) columns += char === "\t" ? 2 : 1;
  return columns;
}

// The example pane is a code surface: each JSON token wears its code-block
// syntax role (the code theme's --syntax-*, Dark+ by default), including the
// role font-style / weight that styles/code.css reads. Punctuation is the
// plain code foreground, as in Dark+.
const JSON_TOKEN_CLASS = {
  key: "text-[color:var(--syntax-key,#0e7490)] dark:text-[color:var(--syntax-key,#67e8f9)] [font-style:var(--syntax-key-font-style,normal)] font-[var(--syntax-key-font-weight,inherit)]",
  string: "text-[color:var(--syntax-string,#15803d)] dark:text-[color:var(--syntax-string,#86efac)] [font-style:var(--syntax-string-font-style,normal)] font-[var(--syntax-string-font-weight,inherit)]",
  number: "text-[color:var(--syntax-number,#1d4ed8)] dark:text-[color:var(--syntax-number,#93c5fd)] [font-style:var(--syntax-number-font-style,normal)] font-[var(--syntax-number-font-weight,inherit)]",
  boolean: "text-[color:var(--syntax-boolean,#b45309)] dark:text-[color:var(--syntax-boolean,#fcd34d)] [font-style:var(--syntax-boolean-font-style,normal)] font-[var(--syntax-boolean-font-weight,inherit)]",
  null: "text-[color:var(--syntax-null,#b91c1c)] dark:text-[color:var(--syntax-null,#fca5a5)] [font-style:var(--syntax-null-font-style,normal)] font-[var(--syntax-null-font-weight,inherit)]",
  punct: "text-[color:var(--syntax-punctuation,var(--docs-code-fg,var(--muted-foreground)))] [font-style:var(--syntax-punctuation-font-style,normal)] font-[var(--syntax-punctuation-font-weight,inherit)]",
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
/** A string value with no space that this many characters or fewer separate at each `/` reads as a path. */
const PATH_SEGMENT_MAX = 32;

/**
 * A path-like string value (no space, a `/`, every part short) as one inline-block per part with a break after each
 * `/`, so a soft-wrapped path breaks between folders and not inside a name such as `docs-mcp`. A part wider than the
 * whole line still wraps inside itself, so nothing runs past the pane. Any other string is returned whole.
 */
function pathSegments(token: string): ReactNode {
  if (/\s/.test(token) || !token.includes("/")) return token;
  const parts = token.split(/(?<=\/)/);
  if (parts.some((part) => part.length > PATH_SEGMENT_MAX)) return token;
  return parts.map((part, index) => <Fragment key={index}>{index > 0 && <wbr />}<span data-json-seg="">{part}</span></Fragment>);
}

/** The characters of a string value that stay on the line of its closing quote and comma. */
const GLUE_TAIL = 3;

/** The kinds of token that end a `"key": value` pair on one line (a `{` or `[` opens a nested block instead). */
const PAIR_VALUE_KINDS: ReadonlySet<JsonTokenKind> = new Set(["string", "number", "boolean", "null"]);

/**
 * One example line as role-tagged token spans. A `"key": value` pair is wrapped in one `data-json-pair` span that
 * never breaks between the key and the start of its value, so a long value wraps inside itself and never drops
 * whole onto the next visual line, away from its key.
 */
export function jsonLineTokens(line: string): ReactNode[] {
  const output: ReactNode[] = [];
  const kinds: (JsonTokenKind | null)[] = [];
  const texts: string[] = [];
  let cursor = 0;
  for (const match of line.matchAll(JSON_LEXEME_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) { output.push(line.slice(cursor, index)); kinds.push(null); texts.push(line.slice(cursor, index)); }
    const token = match[0];
    const kind = jsonTokenKind(token, line.slice(index + token.length));
    output.push(<span key={index} data-json-token={kind} className={JSON_TOKEN_CLASS[kind]}>{kind === "string" ? pathSegments(token) : token}</span>);
    kinds.push(kind);
    texts.push(token);
    cursor = index + token.length;
  }
  if (cursor < line.length) { output.push(line.slice(cursor)); kinds.push(null); texts.push(line.slice(cursor)); }
  const key = kinds.indexOf("key");
  // After the key come its ":" and a space; the value is the next token.
  const value = kinds.findIndex((kind, index) => index > key + 1 && kind !== null);
  if (key < 0 || value < 0 || !PAIR_VALUE_KINDS.has(kinds[value]!)) return output;
  // The pair takes the line's indent too, so the line cannot break between its indent and its key.
  const start = key === 1 && kinds[0] === null ? 0 : key;
  // A string value's closing quote and the trailing comma print as one unbreakable unit, so the comma never wraps
  // onto a line of its own.
  const comma = kinds[value + 1] === "punct" && texts[value + 1] === ",";
  if (kinds[value] === "string" && comma) {
    const token = texts[value]!;
    // The glue also takes the value's last few characters, so a wrap never leaves `",` alone on a line.
    const body = token.slice(0, -1);
    // A path keeps its whole last part with the quote, so the glue never splits a name such as `docs-mcp`.
    const slash = body.lastIndexOf("/");
    const pathLike = !/\s/.test(body) && slash > 0 && body.length - slash - 1 <= PATH_SEGMENT_MAX;
    const cut = pathLike ? slash + 1 : Math.max(1, body.length - GLUE_TAIL);
    output[value] = <span key="value" data-json-token="string" className={JSON_TOKEN_CLASS.string}>{pathSegments(body.slice(0, cut))}<span data-json-glue="">{body.slice(cut)}{'"'}<span data-json-token="punct" className={JSON_TOKEN_CLASS.punct}>,</span></span></span>;
    output.splice(value + 1, 1);
  }
  return [...output.slice(0, start), <span key="pair" data-json-pair="">{output.slice(start, value + 1)}</span>, ...output.slice(value + 1)];
}

/** Continuation lines of a wrapped string value hang this far at most, so a deep key still leaves room to wrap. */
const VALUE_HANG_MAX = 26;

/**
 * The hanging indent of one example line. A `"key": "value"` line whose value has no space (a path, a token, an
 * id) hangs its continuation lines under the first character inside the value's opening quote, so the wrapped
 * value reads as one string. Any other line, prose strings included, hangs 2ch past its own indent, so a long
 * sentence keeps the pane's width.
 */
export function exampleHang(line: string): number {
  const pair = /^(\s*"(?:[^"\\]|\\.)*":\s*)"[^\s"]*"?,?$/.exec(line);
  return pair && pair[1]!.length <= VALUE_HANG_MAX ? pair[1]!.length - 1 : leadingColumns(line);
}

/**
 * The widest line, in columns, that the example folds an object or array onto. The side pane shows about 46
 * columns at the 1280px page (48% of an 815px block), so a folded line never soft-wraps and leaves its closing
 * brace on a line alone.
 */
const EXAMPLE_FOLD_COLUMNS = 42;

function normalizeRangePath(path: string) { return path.replace(/\[\d+\]/g, "").replace(/^\.+/, ""); }

export type ShapeModel = {
  /** Ledger rows; a row is a link target only when the example prints its path. */
  rows: FieldLedgerRow[];
  /** The pretty-printed example, each line keyed with its field chain (deepest first); undefined without a valid example. */
  exampleLines?: LinkedCodeLine[];
  /** The widest printed example line, in columns; undefined without a valid example. */
  exampleColumns?: number;
  /** The long arrays a live pane folds to their first item; empty without a valid example. */
  folds: ExampleFold[];
};

/**
 * One foldable array in the example, as 0-based line indexes. Closed, the pane shows the array's lines up to the end
 * of its first item, then one `… N more` line, then its closing bracket.
 */
export type ExampleFold = {
  /** The line that opens the array (`"steps": [`). */
  open: number;
  /** The last line of the array's first item. */
  firstEnd: number;
  /** The line that closes the array (`]`). */
  close: number;
  /** The items a closed fold hides. */
  hidden: number;
  /** The leading columns of the array's items. */
  indent: number;
  /** The field chain of the array's own lines, for the `… N more` line's link. */
  linkKey?: readonly string[];
};

/** An array folds when it has at least this many items. */
const FOLD_MIN_ITEMS = 3;
/** An array folds when its items after the first print on at least this many lines. */
const FOLD_MIN_HIDDEN_LINES = 8;

/**
 * The arrays the example pane folds: every non-root array of FOLD_MIN_ITEMS or more items whose items after the
 * first take FOLD_MIN_HIDDEN_LINES lines or more. A short list stays open, so the fold only hides what makes a
 * reader lose the thread.
 */
export function exampleFolds(lines: readonly string[], ranges: readonly { path: string; start: number; end: number }[], keysByLine: readonly (readonly string[] | undefined)[]): ExampleFold[] {
  const byPath = new Map(ranges.map((range) => [range.path, range]));
  const items = new Map<string, { start: number; end: number }[]>();
  for (const range of ranges) {
    const match = /^(.+)\[(\d+)\]$/.exec(range.path);
    if (!match) continue;
    const list = items.get(match[1]!) ?? [];
    list[Number(match[2])] = range;
    items.set(match[1]!, list);
  }
  const folds: ExampleFold[] = [];
  for (const [path, list] of items) {
    const array = byPath.get(path);
    const first = list[0];
    const last = list[list.length - 1];
    if (!array || !first || !last || list.length < FOLD_MIN_ITEMS || last.end - first.end < FOLD_MIN_HIDDEN_LINES) continue;
    folds.push({ open: array.start - 1, firstEnd: first.end - 1, close: array.end - 1, hidden: list.length - 1, indent: leadingColumns(lines[first.start - 1] ?? ""), linkKey: keysByLine[array.end - 1] });
  }
  return folds.sort((a, b) => a.open - b.open);
}

/** Clicks and Enter / Space on a fold control stay on it, so the line's link handler cannot pin the line. */
function keepFoldEvent(event: MouseEvent | KeyboardEvent) {
  if (!("key" in event) || event.key === "Enter" || event.key === " ") event.stopPropagation();
}

/**
 * The example lines a live pane shows: each closed fold keeps its first item and puts one `… N more` button line after
 * it. The other items stay in the markup, hidden on screen only, so print shows every line. The line that opens a fold gets a chevron that opens or closes it.
 */
export function foldedExampleLines(lines: readonly LinkedCodeLine[], folds: readonly ExampleFold[], open: ReadonlySet<number>, toggle: (fold: number) => void, label: string): LinkedCodeLine[] {
  if (folds.length === 0) return [...lines];
  const closed = folds.filter((fold) => !open.has(fold.open));
  const output: LinkedCodeLine[] = [];
  lines.forEach((line, index) => {
    // A folded line stays in the markup, hidden on screen only, so print shows the whole example.
    if (closed.some((fold) => index > fold.firstEnd && index < fold.close)) {
      output.push({ ...line, content: <span data-fold-hidden="">{line.content}</span> });
      return;
    }
    const fold = folds.find((candidate) => candidate.open === index);
    if (!fold) {
      output.push(line);
    } else {
      const expanded = open.has(fold.open);
      const total = fold.hidden + 1;
      output.push({ ...line, content: <>
        <button type="button" data-fold-toggle="" aria-expanded={expanded} aria-label={expanded ? `Show 1 of ${total} items in ${label}` : `Show all ${total} items in ${label}`} onClick={(event) => { keepFoldEvent(event); toggle(fold.open); }} onKeyDown={keepFoldEvent}><ChevronRight aria-hidden="true" /></button>
        {line.content}
      </> });
    }
    const closing = closed.find((candidate) => candidate.firstEnd === index);
    if (closing) {
      output.push({ linkKey: closing.linkKey, content: <span data-fold-more-line="">{" ".repeat(closing.indent)}<button type="button" data-fold-more="" aria-expanded="false" onClick={(event) => { keepFoldEvent(event); toggle(closing.open); }} onKeyDown={keepFoldEvent}>{`… ${closing.hidden} more`}</button></span> });
    }
  });
  return output;
}

/**
 * Fields + optional JSON example -> ledger rows and linked example lines.
 * A malformed example is tolerated: the fields render alone.
 */
export function buildShapeModel(fields: readonly Field[], example: string | undefined, rowAttrs?: (path: string, depth: number, field: Field) => FieldLedgerRow["attrs"]): ShapeModel {
  const flat = flattenFieldRows(fields);
  let value: unknown;
  let parsed = false;
  if (example) {
    try { value = JSON.parse(example); parsed = true; } catch { parsed = false; }
  }
  const matched = new Set<string>();
  let exampleLines: LinkedCodeLine[] | undefined;
  let printedColumns = 0;
  let folds: ExampleFold[] = [];
  if (parsed) {
    const { lines, ranges } = printJsonLines(value, { inlineWidth: EXAMPLE_FOLD_COLUMNS });
    const paths = new Set(flat.map((row) => row.path));
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
    printedColumns = lines.reduce((max, line) => Math.max(max, line.length), 0);
    exampleLines = lines.map((line, index) => ({ content: hangingLine(exampleHang(line), jsonLineTokens(line)), linkKey: keysByLine[index] }));
    folds = exampleFolds(lines, ranges, keysByLine);
  }
  const rows = flat.map(({ field, depth, path }) => ({
    path,
    field,
    depth,
    ...(matched.has(path) ? { linkKey: path } : {}),
    attrs: rowAttrs?.(path, depth, field),
  }));
  return { rows, exampleLines, folds, ...(exampleLines ? { exampleColumns: printedColumns } : {}) };
}

/**
 * The name column never shrinks below this many ch, and never grows past 32ch: the shared 24ch column and 8ch more,
 * so a variant name such as `kind "code-review" adds` stays on one line. CSS caps it at the
 * --docs-shape-name-width knob plus 8ch, and at the knob alone in a block narrower than 560px.
 */
const NAME_FIT_MIN_CH = 10;
const NAME_FIT_MAX_CH = 32;
/** One nesting step (--docs-shape-indent, 16px) in ch of the 13px mono name font, rounded up. */
const INDENT_CH = 2.2;

/**
 * The name column width, in ch, that holds the longest name at its depth with its `?`: a shape with short names
 * gives the type and description that space instead of an empty 32ch column.
 */
export function fitNameColumn(rows: readonly Pick<FieldLedgerRow, "field" | "depth">[]): number {
  const widest = rows.reduce((max, { field, depth }) => Math.max(max, field.name.length + (field.required === false ? 1.5 : 0) + depth * INDENT_CH), 0);
  return Math.min(NAME_FIT_MAX_CH, Math.max(NAME_FIT_MIN_CH, Math.ceil(widest + 1)));
}

const SHAPE_SHEET = FIELD_LEDGER_STYLE + REF_TILE_STYLE + REF_CODE_PANE_STYLE + STATE_SHAPE_STYLE;

/**
 * A field description with each `backtick` span set as inline code, so a code name, an empty string `""` or a
 * separator such as `" | "` reads as a literal value and not as prose. The backticks themselves are not shown. A short
 * span never breaks inside itself, so `docs-model` or `Authorization: Bearer <token>` stays whole.
 */
/** A code span this many characters or shorter stays on one line; a longer one may break anywhere. */
const NOTE_CODE_NOWRAP_MAX = 32;

export function noteWithCode(description: string): ReactNode {
  const parts = description.split(/`([^`]+)`/);
  if (parts.length === 1) return description;
  return parts.map((part, index) => {
    if (index % 2 === 0) return part;
    if (part.length <= NOTE_CODE_NOWRAP_MAX) return <code key={index} data-note-code="">{part}</code>;
    // A long path breaks only after a /, like an example path; other long code may break anywhere.
    const segments = /\s/.test(part) || !part.includes("/") ? null : part.split(/(?<=\/)/);
    return <code key={index} data-note-code="long">{segments ? segments.map((segment, at) => <Fragment key={at}>{at > 0 && <wbr />}<span data-json-seg="">{segment}</span></Fragment>) : part}</code>;
  });
}

/** The example pane is never sized for more than this many columns: a longer line soft-wraps. */
const EXAMPLE_FIT_COLUMNS = 48;

/**
 * The example pane's width for its widest line (EXAMPLE_FIT_COLUMNS at most), as CSS: columns of the 13px mono font
 * (0.6em advance) and the pane's two text insets. The field list takes the rest of the block, so its types wrap less.
 */
export function exampleFitWidth(columns: number): string {
  return `calc(${Math.min(columns, EXAMPLE_FIT_COLUMNS) + 1} * 0.6 * var(--docs-shape-text-size,13px) + 2 * var(--fl-pad-x,16px))`;
}

export function StateShapeBlock({ id, name, description, source, fields, example }: { id: string; name?: string; description?: string; source?: StateShapeSourceProps; fields: Field[]; example?: string }) {
  const model = useMemo(() => buildShapeModel(fields, example, (path, depth, field) => ({ "data-shape-field": field.name, "data-shape-path": path, "data-shape-depth": depth })), [fields, example]);
  const sourceRef = source ? source.symbol ? `${source.path}#${source.symbol}` : source.path : undefined;
  // The head shows only basename#Symbol; the full path#Symbol opens on hover / focus.
  const sourceShort = source ? `${source.path.slice(source.path.lastIndexOf("/") + 1)}${source.symbol ? `#${source.symbol}` : ""}` : undefined;
  const sourceTipId = useId();
  const label = name ?? sourceRef ?? "State shape";
  const nameFit = { "--shape-name-fit": `${fitNameColumn(model.rows)}ch`, ...(model.exampleColumns !== undefined ? { "--shape-example-w": exampleFitWidth(model.exampleColumns) } : {}) } as CSSProperties;
  const described = hasDescribedRows(model.rows);
  const interactive = useInteractive();
  const [openFolds, setOpenFolds] = useState<ReadonlySet<number>>(() => new Set());
  const toggleFold = (fold: number) => setOpenFolds((current) => {
    const next = new Set(current);
    if (!next.delete(fold)) next.add(fold);
    return next;
  });
  // Static markup has no JS to open a fold, so it prints every line.
  const shownLines = model.exampleLines && interactive ? foldedExampleLines(model.exampleLines, model.folds, openFolds, toggleFold, `${label} example`) : model.exampleLines;
  return <section className="not-prose w-full min-w-0" data-docs-block-type="state-shape" data-source-id={id} data-shape-source={sourceRef} data-code-surface="true" style={nameFit}>
    <style>{SHAPE_SHEET}</style>
    {(name || sourceRef || described) && <header data-shape-header="true">
      <span data-ref-tile aria-hidden="true"><Braces aria-hidden="true" data-shape-icon="true" /></span>
      {name && <h3 data-shape-name="true">{monoBreaks(name)}</h3>}
      {source && <DescribedName id={sourceTipId} name={sourceShort} tip={sourceRef} nameAttrs={{ "data-shape-source-ref": "true", "data-spectre-ref": "true", "data-ref-kind": "source", "data-ref-path": source.path, "data-ref-symbol": source.symbol }} tipAttrs={{ "data-shape-source-tip": "true" }} />}
      {described && <DescriptionsSwitch />}
    </header>}
    {description && <p data-shape-description="true">{description}</p>}
    <LinkGroup>
      <div data-shape-grid="true" data-has-example={model.exampleLines ? "true" : undefined} data-example-fit={model.exampleLines ? "true" : undefined}>
        <div data-shape-tree="true">
          {fields.length > 0 ? <FieldLedger rows={model.rows} inlineNotes renderNote={noteWithCode} data-shape-ledger="true" /> : <p data-shape-empty="true">(no fields)</p>}
        </div>
        {model.exampleLines && <div data-shape-example-pane="true" data-code-surface="true" data-ref-code="true">
          <CodeLines data-shape-example="true" lines={shownLines!} tabIndex={0} role="region" aria-label={`${label} example`} />
        </div>}
      </div>
    </LinkGroup>
  </section>;
}
