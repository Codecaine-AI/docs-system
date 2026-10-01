"use client";

import { useMemo, type ReactNode } from "react";
import { Braces } from "lucide-react";
import { printJsonLines, type Field } from "@codecaine-ai/docs-model";
import { SOURCE_REFERENCE_CLASSES } from "../../render/block-classes";
import { CodeLines, LinkGroup, type LinkedCodeLine } from "../linked-panels";
import { FIELD_LEDGER_STYLE, FieldLedger, flattenFieldRows, type FieldLedgerRow } from "./field-ledger";

export { classifyTypeText, splitTypeUnion, type TypeTextClassification } from "./field-ledger";

export const STATE_SHAPE_LABEL = "State Shape";
export const STATE_SHAPE_AGENT_DESCRIPTION = "A bounded field inspector with a linked JSON companion. A plain panel head shows the reference family tile, the shape name in mono, and the source path#Symbol as a source reference; the shape's own description prints beneath the head. Every field is one ledger row: the name in the property color with a muted ? when optional, then the type in the type color and the description printed inline beneath it. Nested fields step in behind thin guides. The JSON example sits in a dark code pane beside the fields; hover, focus, click, Enter, Space, and Escape coordinate field paths with every matching JSON occurrence. The shape is always open.";
export type StateShapeSourceProps = { path: string; symbol?: string };

/**
 * Plain panel per the theme lab (2026-10-01): no tinted or textured header,
 * no column heads, no tooltips. Every visual value reads a --docs-shape-*
 * knob (the style rail's State shape pane, THEME_TOKEN_REGISTRY
 * ["state-shape"]) with a literal fallback equal to its light default, so a
 * static export without semantic.css renders the same. Colors default to the
 * shared role tokens (--docs-syn-prop for names, --docs-syn-type for types,
 * --docs-muted for secondary text) in semantic.css; the shared field ledger
 * (./field-ledger) reads the `--fl-*` locals mapped here.
 */
export const STATE_SHAPE_STYLE = `
[data-docs-block-type="state-shape"]{container-type:inline-size;margin:16px 0;overflow:hidden;color:var(--docs-text,#2a2a2a);background:var(--docs-shape-bg,var(--docs-panel,#f8f8f7));border:var(--docs-shape-border-width,1px) solid var(--docs-shape-border,var(--docs-rule,#e6e5e3));border-radius:var(--docs-shape-radius,var(--radius,2px));--fl-pad-x:var(--docs-shape-pad-x,12px);--fl-row-pad:var(--docs-shape-row-pad,4px);--fl-row-min-h:var(--docs-shape-row-min-height,28px);--fl-rule:var(--docs-shape-rule,var(--docs-rule-soft,#efeeec));--fl-rule-w:var(--docs-shape-rule-width,1px);--fl-name-w:var(--docs-shape-name-width,176px);--fl-indent:var(--docs-shape-indent,16px);--fl-guide:var(--docs-shape-child-rule,var(--docs-rule,#e6e5e3));--fl-guide-w:var(--docs-shape-child-rule-width,1px);--fl-name:var(--docs-shape-name,var(--docs-syn-prop,#0d7164));--fl-name-weight:var(--docs-shape-name-weight,500);--fl-name-size:var(--docs-shape-text-size,13px);--fl-type:var(--docs-shape-type,var(--docs-syn-type,#805f01));--fl-type-size:var(--docs-shape-type-text-size,13px);--fl-muted:var(--docs-shape-muted,var(--docs-muted,#666562));--fl-optional:var(--docs-shape-optional-fg,var(--docs-muted,#666562));--fl-desc:var(--docs-shape-desc-fg,var(--docs-muted,#666562));--fl-desc-size:var(--docs-shape-desc-text-size,13.5px)}
[data-shape-header]{display:flex;align-items:center;gap:8px;min-height:32px;padding:var(--docs-shape-header-pad-y,6px) var(--docs-shape-pad-x,12px);background:var(--docs-shape-header-bg,var(--docs-panel,#f8f8f7));border-bottom:var(--docs-shape-header-rule-width,1px) solid var(--docs-shape-header-rule,var(--docs-rule-soft,#efeeec))}
[data-shape-name]{margin:0;min-width:0;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--docs-shape-header-text-size,13px);font-weight:var(--docs-shape-header-weight,600);line-height:1.3;color:var(--docs-shape-header-fg,var(--docs-ink,#1f1f1f));overflow-wrap:anywhere}
[data-shape-source-ref]{margin-left:auto;min-width:0;font-size:12px;line-height:1.4;text-align:right}
[data-shape-description]{margin:0;padding:8px var(--docs-shape-pad-x,12px);max-width:calc(75ch + 24px);font-size:13.5px;line-height:1.5;color:var(--docs-text,#2a2a2a);border-bottom:var(--docs-shape-rule-width,1px) solid var(--docs-shape-rule,var(--docs-rule-soft,#efeeec))}
[data-shape-grid]{display:grid;grid-template-columns:minmax(0,1fr)}
[data-shape-tree]{min-width:0;padding:4px 0}
[data-shape-empty]{margin:0;padding:6px var(--docs-shape-pad-x,12px);font-size:13.5px;color:var(--docs-shape-muted,var(--docs-muted,#666562))}
[data-shape-example-pane]{min-width:0;background:var(--docs-code-block-bg,color-mix(in srgb,var(--muted) 30%,transparent));border-top:var(--docs-shape-pane-rule-width,1px) solid var(--docs-shape-border,var(--docs-rule,#e6e5e3))}
@container (min-width:720px){[data-shape-grid][data-has-example]{grid-template-columns:minmax(0,var(--docs-pane-split,46%)) minmax(0,1fr)}[data-shape-grid][data-has-example] [data-shape-example-pane]{border-top:0;border-left:var(--docs-shape-pane-rule-width,1px) solid var(--docs-shape-border,var(--docs-rule,#e6e5e3))}}
.review-wide [data-shape-grid][data-has-example]{grid-template-columns:minmax(0,var(--docs-pane-split,46%)) minmax(0,1fr)}
`;

/**
 * The structured-reference family tile (theme lab): a 16px tile in the
 * family's solid color with the block glyph in the tile-glyph color. State
 * Shape and Interaction Surface are the reference family (violet).
 */
export const REF_TILE_STYLE = `
[data-ref-tile]{display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px;border-radius:2px;background:var(--docs-fam-ref-solid,#6940a5);color:var(--docs-tile-glyph,#ffffff)}
[data-ref-tile]>svg{display:block;width:11px;height:11px;stroke-width:2.25}
`;

/**
 * Code panes beside a ledger (a JSON example, an operation signature). The
 * pane is a code surface, so it renders as the dark code panel the code
 * theme drives; the lab drops the line-number gutter and the zebra, keeps
 * the linking wash, and makes the scrollable pane a focusable region.
 */
export const REF_CODE_PANE_STYLE = `
[data-ref-code] [data-line-number],[data-ref-code] [data-code-lines-filler]{display:none}
[data-ref-code] [data-code-line]:not([data-lit]){background:none}
[data-ref-code] [data-code-lines]{padding:8px 0}
[data-ref-code] [data-line-text]{padding:0 16px}
[data-ref-code] [data-code-lines]:focus-visible{outline:2px solid var(--docs-focus-ring,#0078df);outline-offset:-2px}
`;

// The example pane is a code surface: each JSON token wears its code-block
// syntax role (the code theme's --syntax-*, Dark+ by default), including the
// role font-style / weight that styles/code.css reads. Punctuation is the
// plain code foreground, as in Dark+.
const JSON_TOKEN_CLASS = {
  key: "text-[color:var(--syntax-key,#0e7490)] dark:text-[color:var(--syntax-key,#67e8f9)] [font-style:var(--syntax-key-font-style,normal)] [font-weight:var(--syntax-key-font-weight,inherit)]",
  string: "text-[color:var(--syntax-string,#15803d)] dark:text-[color:var(--syntax-string,#86efac)] [font-style:var(--syntax-string-font-style,normal)] [font-weight:var(--syntax-string-font-weight,inherit)]",
  number: "text-[color:var(--syntax-number,#1d4ed8)] dark:text-[color:var(--syntax-number,#93c5fd)] [font-style:var(--syntax-number-font-style,normal)] [font-weight:var(--syntax-number-font-weight,inherit)]",
  boolean: "text-[color:var(--syntax-boolean,#b45309)] dark:text-[color:var(--syntax-boolean,#fcd34d)] [font-style:var(--syntax-boolean-font-style,normal)] [font-weight:var(--syntax-boolean-font-weight,inherit)]",
  null: "text-[color:var(--syntax-null,#b91c1c)] dark:text-[color:var(--syntax-null,#fca5a5)] [font-style:var(--syntax-null-font-style,normal)] [font-weight:var(--syntax-null-font-weight,inherit)]",
  punct: "text-[color:var(--syntax-punctuation,var(--docs-code-fg,var(--muted-foreground)))] [font-style:var(--syntax-punctuation-font-style,normal)] [font-weight:var(--syntax-punctuation-font-weight,inherit)]",
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
    const { lines, ranges } = printJsonLines(value);
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
    exampleLines = lines.map((line, index) => ({ content: jsonLineTokens(line), linkKey: keysByLine[index] }));
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

const SHAPE_SHEET = FIELD_LEDGER_STYLE + REF_TILE_STYLE + REF_CODE_PANE_STYLE + STATE_SHAPE_STYLE;

export function StateShapeBlock({ id, name, description, source, fields, example }: { id: string; name?: string; description?: string; source?: StateShapeSourceProps; fields: Field[]; example?: string }) {
  const model = useMemo(() => buildShapeModel(fields, example, (path, depth, field) => ({ "data-shape-field": field.name, "data-shape-path": path, "data-shape-depth": depth })), [fields, example]);
  const sourceRef = source ? source.symbol ? `${source.path}#${source.symbol}` : source.path : undefined;
  const label = name ?? sourceRef ?? "State shape";
  return <section className="not-prose w-full min-w-0" data-docs-block-type="state-shape" data-source-id={id} data-shape-source={sourceRef}>
    <style>{SHAPE_SHEET}</style>
    {(name || sourceRef) && <header data-shape-header="true">
      <span data-ref-tile aria-hidden="true"><Braces aria-hidden="true" data-shape-icon="true" /></span>
      {name && <h3 data-shape-name="true">{name}</h3>}
      {source && <span data-shape-source-ref="true" data-spectre-ref="true" data-ref-kind="source" data-ref-path={source.path} data-ref-symbol={source.symbol} className={SOURCE_REFERENCE_CLASSES}>{sourceRef}</span>}
    </header>}
    {description && <p data-shape-description="true">{description}</p>}
    <LinkGroup>
      <div data-shape-grid="true" data-has-example={model.exampleLines ? "true" : undefined}>
        <div data-shape-tree="true">
          {fields.length > 0 ? <FieldLedger rows={model.rows} data-shape-ledger="true" /> : <p data-shape-empty="true">(no fields)</p>}
        </div>
        {model.exampleLines && <div data-shape-example-pane="true" data-code-surface="true" data-ref-code="true">
          <CodeLines data-shape-example="true" lines={model.exampleLines} tabIndex={0} role="region" aria-label={`${label} example`} />
        </div>}
      </div>
    </LinkGroup>
  </section>;
}
