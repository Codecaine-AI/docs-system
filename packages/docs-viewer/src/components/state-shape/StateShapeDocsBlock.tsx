"use client";

import { Fragment, useId, useMemo, type CSSProperties, type ReactNode } from "react";
import { Braces } from "lucide-react";
import { printJsonLines, type Field } from "@codecaine-ai/docs-model";
import { DescribedName } from "../described-name";
import { CodeLines, LinkGroup, type LinkedCodeLine } from "../linked-panels";
import { monoBreaks } from "../mono-breaks";
import { FIELD_LEDGER_STYLE, FieldLedger, flattenFieldRows, type FieldLedgerRow } from "./field-ledger";

export { classifyTypeText, splitTypeUnion, type TypeTextClassification } from "./field-ledger";

export const STATE_SHAPE_LABEL = "State Shape";
export const STATE_SHAPE_AGENT_DESCRIPTION = "A bounded field inspector with a linked JSON companion. A plain panel head shows the reference family tile, the shape name in mono, and, at the right, the source as a muted basename#Symbol source reference whose full path#Symbol opens in a tooltip on hover or focus; the shape's own description prints beneath the head. The whole panel is a dark code panel colored like a TypeScript type in VS Code Dark+. Every field is one ledger row: the name in the property color with a punctuation ? when optional, then the type (type names teal, string literals orange, punctuation plain). Each field's description prints on the page beside its type: in a third column when the ledger is 600px wide or more, and under the type when it is narrower. Nested fields hang off their parent with file-tree elbow connectors. The JSON example sits in a code pane beside the fields; hover, focus, click, Enter, Space, and Escape coordinate field paths with every matching JSON occurrence. The shape is always open.";
export type StateShapeSourceProps = { path: string; symbol?: string };

/**
 * Plain panel per the theme lab (2026-10-01): no tinted or textured header,
 * no column heads. The whole panel is a code surface
 * ([data-code-surface]), so it renders as the dark code panel in both page
 * modes and the field list reads the way the editor colors a TypeScript
 * type: names --syntax-key, types --syntax-type, string-literal types
 * --syntax-string, the ? marker and type punctuation --syntax-punctuation
 * (VS Code Dark+ by default; each literal fallback is the Dark+ value).
 * Field descriptions print on the page beside their types (the ledger's
 * inlineNotes), so a static or touch reader sees every note, as in the
 * Interaction Surface ledgers. The head's source shows basename#Symbol with
 * the full path in a tooltip (../described-name). Nested fields use the file tree's elbow connectors, colored by
 * --docs-shape-child-rule. Every visual value reads a --docs-shape-*
 * knob (the style rail's State shape pane, THEME_TOKEN_REGISTRY
 * ["state-shape"]) with a fallback equal to its default; the shared field
 * ledger (./field-ledger) reads the `--fl-*` locals mapped here.
 */
export const STATE_SHAPE_STYLE = `
[data-docs-block-type="state-shape"]{container-type:inline-size;margin:var(--ds-space-4) 0;overflow:hidden;color:var(--docs-text,#2a2a2a);background:var(--docs-shape-bg,var(--docs-panel,#f8f8f7));border:var(--docs-shape-border-width,1px) solid var(--docs-shape-border,var(--docs-rule,#e6e5e3));border-radius:var(--docs-shape-radius,var(--radius,2px));--fl-pad-x:var(--docs-shape-pad-x,16px);--fl-row-pad:var(--docs-shape-row-pad,5px);--fl-row-min-h:var(--docs-shape-row-min-height,28px);--fl-rule:var(--docs-shape-rule,var(--docs-rule-soft,#efeeec));--fl-rule-w:var(--docs-shape-rule-width,1px);--fl-name-w:min(var(--docs-shape-name-width,24ch),var(--shape-name-fit,24ch));--fl-indent:var(--docs-shape-indent,16px);--fl-guide:var(--docs-shape-child-rule,color-mix(in srgb,var(--docs-ink,#1f1f1f) 75%,transparent));--fl-guide-w:var(--docs-shape-child-rule-width,1px);--fl-name:var(--docs-shape-name,var(--syntax-key,#9cdcfe));--fl-name-weight:var(--docs-shape-name-weight,500);--fl-name-size:var(--docs-shape-text-size,13px);--fl-type:var(--docs-shape-type,var(--syntax-type,#4ec9b0));--fl-type-size:var(--docs-shape-type-text-size,13px);--fl-muted:var(--docs-shape-muted,var(--syntax-punctuation,#d4d4d4));--fl-optional:var(--docs-shape-optional-fg,var(--syntax-punctuation,#d4d4d4));--fl-type-string:var(--syntax-string,#ce9178);--fl-type-number:var(--syntax-number,#b5cea8);--fl-type-keyword:var(--syntax-keyword,#569cd6);--fl-type-key:var(--fl-name);--fl-type-punct:var(--fl-muted);--fl-desc:var(--docs-shape-desc-fg,var(--docs-muted,#666562));--fl-desc-size:var(--docs-shape-desc-text-size,13.5px)}
[data-shape-header]{display:flex;align-items:center;gap:var(--ds-space-2);min-height:var(--ds-space-8);padding:var(--docs-shape-header-pad-y,6px) var(--docs-shape-pad-x,16px);background:var(--docs-shape-header-bg,var(--docs-panel,#f8f8f7));border-bottom:var(--docs-shape-header-rule-width,1px) solid var(--docs-shape-header-rule,var(--docs-rule-soft,#efeeec))}
[data-shape-name]{margin:0;min-width:0;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--docs-shape-header-text-size,13px);font-weight:var(--docs-shape-header-weight,600);line-height:var(--ds-line-height-tight);color:var(--docs-shape-header-fg,var(--docs-ink,#1f1f1f));overflow-wrap:normal}
[data-shape-header]>[data-described]{margin-left:auto;min-width:0}
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
[data-docs-block-type="state-shape"] [data-type-tok="string"]{white-space:nowrap}
[data-docs-block-type="state-shape"] [data-json-seg]{white-space:nowrap}
[data-docs-block-type="state-shape"] [data-json-pair]{white-space:pre}[data-docs-block-type="state-shape"] [data-json-pair]>[data-json-token]:last-child{white-space:pre-wrap}[data-docs-block-type="state-shape"] [data-json-glue]{white-space:nowrap}[data-docs-block-type="state-shape"] [data-field-token="optional"]{margin-left:0}
[data-docs-block-type="state-shape"] [data-note-code]{font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);color:var(--docs-shape-name,var(--syntax-key,#9cdcfe));white-space:nowrap;padding:0;background:none;border:0}[data-docs-block-type="state-shape"] [data-note-code="long"]{white-space:normal;overflow-wrap:anywhere}
[data-shape-legend]{margin:0;padding:var(--ds-space-1) var(--docs-shape-pad-x,16px) var(--ds-space-1-5);font-size:var(--ds-font-size-ui-xs);line-height:var(--ds-line-height-ui);color:var(--docs-shape-desc-fg,var(--docs-muted,#666562));box-shadow:inset 0 calc(-1 * var(--docs-shape-rule-width,1px)) 0 0 var(--docs-shape-rule,var(--docs-rule-soft,#efeeec))}
[data-shape-legend-mark]{margin-right:var(--ds-space-0-5);font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);color:var(--docs-shape-optional-fg,var(--syntax-punctuation,#d4d4d4))}
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
 * A path-like string value (no space, a `/`, every part short) as nowrap parts with a break after each `/`, so a
 * soft-wrapped path breaks between folders and never inside a name such as `docs-mcp`. Any other string is
 * returned whole and wraps as before.
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
};

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
    exampleLines = lines.map((line, index) => ({ content: hangingLine(exampleHang(line), jsonLineTokens(line)), linkKey: keysByLine[index] }));
  }
  const rows = flat.map(({ field, depth, path }) => ({
    path,
    field,
    depth,
    ...(matched.has(path) ? { linkKey: path } : {}),
    attrs: rowAttrs?.(path, depth, field),
  }));
  return { rows, exampleLines };
}

/** The name column never shrinks below this many ch, and never grows past the shared ledger's 24ch. */
const NAME_FIT_MIN_CH = 10;
const NAME_FIT_MAX_CH = 24;
/** One nesting step (--docs-shape-indent, 16px) in ch of the 13px mono name font, rounded up. */
const INDENT_CH = 2.2;

/**
 * The name column width, in ch, that holds the longest name at its depth with its `?`: a shape with short names
 * gives the type and description that space instead of an empty 24ch column.
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
  return parts.map((part, index) => index % 2 === 1 ? <code key={index} data-note-code={part.length > NOTE_CODE_NOWRAP_MAX ? "long" : ""}>{part}</code> : part);
}

/**
 * The ledger's key to optionality. A row marks only an optional field (`?`), so a shape whose fields are all
 * required shows no marker at all; the legend says which case the reader sees.
 */
function OptionalityLegend({ rows }: { rows: readonly FieldLedgerRow[] }) {
  const optional = rows.some((row) => row.field.required === false);
  return <p data-shape-legend={optional ? "optional" : "all-required"}>
    {optional ? <><span data-shape-legend-mark aria-hidden="true">?</span> marks an optional field. Every other field is required.</> : rows.length === 1 ? "The field is required." : "Every field is required."}
  </p>;
}

export function StateShapeBlock({ id, name, description, source, fields, example }: { id: string; name?: string; description?: string; source?: StateShapeSourceProps; fields: Field[]; example?: string }) {
  const model = useMemo(() => buildShapeModel(fields, example, (path, depth, field) => ({ "data-shape-field": field.name, "data-shape-path": path, "data-shape-depth": depth })), [fields, example]);
  const sourceRef = source ? source.symbol ? `${source.path}#${source.symbol}` : source.path : undefined;
  // The head shows only basename#Symbol; the full path#Symbol opens on hover / focus.
  const sourceShort = source ? `${source.path.slice(source.path.lastIndexOf("/") + 1)}${source.symbol ? `#${source.symbol}` : ""}` : undefined;
  const sourceTipId = useId();
  const label = name ?? sourceRef ?? "State shape";
  const nameFit = { "--shape-name-fit": `${fitNameColumn(model.rows)}ch` } as CSSProperties;
  return <section className="not-prose w-full min-w-0" data-docs-block-type="state-shape" data-source-id={id} data-shape-source={sourceRef} data-code-surface="true" style={nameFit}>
    <style>{SHAPE_SHEET}</style>
    {(name || sourceRef) && <header data-shape-header="true">
      <span data-ref-tile aria-hidden="true"><Braces aria-hidden="true" data-shape-icon="true" /></span>
      {name && <h3 data-shape-name="true">{monoBreaks(name)}</h3>}
      {source && <DescribedName id={sourceTipId} name={sourceShort} tip={sourceRef} nameAttrs={{ "data-shape-source-ref": "true", "data-spectre-ref": "true", "data-ref-kind": "source", "data-ref-path": source.path, "data-ref-symbol": source.symbol }} tipAttrs={{ "data-shape-source-tip": "true" }} />}
    </header>}
    {description && <p data-shape-description="true">{description}</p>}
    <LinkGroup>
      <div data-shape-grid="true" data-has-example={model.exampleLines ? "true" : undefined}>
        <div data-shape-tree="true">
          {fields.length > 0 ? <><OptionalityLegend rows={model.rows} /><FieldLedger rows={model.rows} inlineNotes renderNote={noteWithCode} data-shape-ledger="true" /></> : <p data-shape-empty="true">(no fields)</p>}
        </div>
        {model.exampleLines && <div data-shape-example-pane="true" data-code-surface="true" data-ref-code="true">
          <CodeLines data-shape-example="true" lines={model.exampleLines} tabIndex={0} role="region" aria-label={`${label} example`} />
        </div>}
      </div>
    </LinkGroup>
  </section>;
}
