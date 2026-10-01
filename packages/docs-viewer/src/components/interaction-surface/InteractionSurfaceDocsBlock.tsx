"use client";

import type { ReactNode } from "react";
import { Plug } from "lucide-react";
import type { Field } from "@codecaine-ai/docs-model";
import { CodeLines, LinkGroup, type LinkedCodeLine } from "../linked-panels";
import { DISCLOSURE_STYLE, DisclosureChevron, syncDisclosureExpanded } from "../disclosure";
import { FIELD_LEDGER_STYLE, FieldLedger, FieldType, type FieldLedgerRow } from "../state-shape/field-ledger";
import { REF_CODE_PANE_STYLE, REF_TILE_STYLE, buildShapeModel } from "../state-shape/StateShapeDocsBlock";
import { tokenizeSigType } from "./signature-tokens";

export const INTERACTION_SURFACE_LABEL = "Interaction Surface";
export const INTERACTION_SURFACE_AGENT_DESCRIPTION =
  'Operations on state as rows of one reference panel; the surface title heads the panel. Each operation is one line: chevron, the real dotted name in mono (never humanized), and a lowercase kind badge (action, query, or event) colored by kind. Operations start collapsed as one-line rows that also show the parameter list, the return type, and the muted purpose; they open on click, Enter, or Space. Open, the purpose leads, then a Parameters ledger beside the dark signature pane and a Returns ledger beside the returned example. Ledgers share the State Shape field rows: name, muted ? when optional, type, and the description printed inline. Typed props: { title?: string; operations: Array<{ name: string; description?: string; params?: Array<{ name: string; type?: string; required?: boolean; description?: string; fields?: Param[] }>; returns?: string; returnShape?: { fields: Field[]; example?: string }; kind?: "action" | "query" | "event" }> }.';

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
type OperationKind = NonNullable<InteractionSurfaceOperation["kind"]>;

// Signature pane tokens wear the code-block syntax roles (the code theme's
// --syntax-* tokens, re-declared on the dark code-panel island), with role
// font-style / weight like styles/code.css. The rail's sig knobs
// (--docs-interaction-sig-name / -type / -punct) sit in front of their role;
// the var() chains after them equal code.css's, so hosts without the theme
// layer still color the pane like their code blocks. Param names are the
// property role (hljs-attr), so they match the ledger's names. Plain CSS in
// the block's <style>, keyed on data-sig-token, so nested type tokens need no
// classes.
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
  // Dark+ prints the optional `?` and the `→` arrow as plain punctuation.
  `[data-op-sig] :is([data-sig-token="punct"],[data-sig-token="optional"],[data-sig-token="returns"]){${sigRole("punctuation", SIG_PUNCT_COLOR)}}`,
].join("\n");

const RETURNS_ARROW = "→";

function PunctToken({ text }: { text: string }) { return <span data-sig-token="punct">{text}</span>; }

/** Type text as role-tagged spans inside one `data-sig-token="type"` wrapper. */
function TypeToken({ text }: { text: string }) {
  return <span data-sig-token="type">{tokenizeSigType(text).map((token, index) => token.kind === "space" ? token.text : <span key={index} data-sig-token={token.kind}>{token.text}</span>)}</span>;
}

/** The signature as linked code lines (one param per line) plus the ledger rows that pair with them. */
function buildOperation(operation: InteractionSurfaceOperation): { lines: LinkedCodeLine[]; rows: FieldLedgerRow[] } {
  const params = operation.params ?? []; const lines: LinkedCodeLine[] = []; const rows: FieldLedgerRow[] = [];
  const nameToken = <span key="name" data-sig-token="name">{operation.name}</span>;
  const returnsToken = operation.returns ? <span key="returns" data-sig-token="returns"> {RETURNS_ARROW} <TypeToken text={operation.returns} /></span> : null;
  if (params.length === 0) { lines.push({ content: [nameToken, <PunctToken key="()" text="()" />, returnsToken] }); return { lines, rows }; }
  const emitParams = (fields: Field[], depth: number, parentPath: string, ancestors: readonly string[]): void => {
    const indent = "  ".repeat(depth);
    for (const param of fields) {
      const path = parentPath ? `${parentPath}.${param.name}` : param.name;
      const key = `${operation.name}.${path}`; const lineKey = [key, ...ancestors];
      rows.push({ path, field: param, depth: depth - 1, linkKey: key, attrs: { "data-param-note": key } });
      const head: ReactNode[] = [indent, <span key={key} data-sig-token="param">{param.name}</span>];
      if (param.required === false) head.push(<span key={`${key}?`} data-sig-token="optional">?</span>);
      if (param.fields) { head.push(<PunctToken key={`${key}{`} text=": {" />); lines.push({ content: head, linkKey: lineKey }); emitParams(param.fields, depth + 1, path, lineKey); lines.push({ content: [indent, <PunctToken key={`${key}}`} text="}," />], linkKey: lineKey }); }
      else { if (param.type) head.push(<PunctToken key={`${key}:`} text=": " />, <TypeToken key={`${key}t`} text={param.type} />); head.push(<PunctToken key={`${key},`} text="," />); lines.push({ content: head, linkKey: lineKey }); }
    }
  };
  lines.push({ content: [nameToken, <PunctToken key="(" text="(" />] }); emitParams(params, 1, "", []); lines.push({ content: [<PunctToken key=")" text=")" />, returnsToken] });
  return { lines, rows };
}

/** The collapsed line's signature tail: top-level params on one line, nested objects folded. */
export function signatureTail(operation: InteractionSurfaceOperation): string {
  const params = (operation.params ?? []).map((param) => `${param.name}${param.required === false ? "?" : ""}${param.fields ? ": {…}" : param.type ? `: ${param.type}` : ""}`);
  return `(${params.join(", ")})${operation.returns ? ` ${RETURNS_ARROW} ${operation.returns}` : ""}`;
}

function domId(...parts: string[]): string {
  return `op-${parts.join("-").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/**
 * Plain reference panel per the theme lab (2026-10-01): the title in the
 * panel head beside the family tile, operations as rows. Every tunable value
 * reads a --docs-interaction-* knob (the style rail's Interaction surface
 * pane, THEME_TOKEN_REGISTRY["interaction-surface"]) with a literal fallback
 * equal to its light default; content colors fall back through the matching
 * State Shape knob to the shared role tokens. The ledgers are the shared
 * field ledger (../state-shape/field-ledger), mapped here onto this block's
 * knobs. The sheet is unlayered, so a value set here must be tokenized here.
 * A closed operation's body is also a zero-height clip on screen (not only
 * the ::details-content box), so geometry readers such as the workbench's
 * grain mask never see the hidden code panes as on-screen code.
 */
const SURFACE_STYLE = `
[data-docs-block-type="interaction-surface"]{container-type:inline-size;margin:16px 0;overflow:hidden;color:var(--docs-text,#2a2a2a);background:var(--docs-interaction-bg,var(--docs-shape-bg,var(--docs-panel,#f8f8f7)));border:var(--docs-interaction-border-width,1px) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)));border-radius:var(--docs-interaction-radius,var(--radius,2px));--op-pad-x:var(--docs-interaction-pad-x,12px);--op-rule:var(--docs-interaction-rule,var(--docs-shape-rule,var(--docs-rule-soft,#efeeec)));--op-rule-w:var(--docs-interaction-rule-width,1px);--fl-pad-x:var(--op-pad-x);--fl-row-pad:var(--docs-interaction-row-pad,4px);--fl-row-min-h:var(--docs-shape-row-min-height,28px);--fl-rule:var(--op-rule);--fl-rule-w:var(--op-rule-w);--fl-name-w:var(--docs-shape-name-width,176px);--fl-indent:var(--docs-interaction-indent,16px);--fl-guide:var(--docs-interaction-child-rule,var(--docs-shape-child-rule,var(--docs-rule,#e6e5e3)));--fl-guide-w:var(--docs-shape-child-rule-width,1px);--fl-name:var(--docs-interaction-note-name,var(--docs-shape-name,var(--docs-syn-prop,#0d7164)));--fl-name-weight:var(--docs-interaction-note-name-weight,500);--fl-name-size:var(--docs-interaction-note-name-text-size,13px);--fl-type:var(--docs-interaction-note-type,var(--docs-shape-type,var(--docs-syn-type,#805f01)));--fl-type-size:var(--docs-interaction-note-type-text-size,13px);--fl-muted:var(--docs-shape-muted,var(--docs-muted,#666562));--fl-optional:var(--docs-shape-optional-fg,var(--docs-muted,#666562));--fl-desc:var(--docs-interaction-note-fg,var(--docs-shape-desc-fg,var(--docs-muted,#666562)));--fl-desc-size:var(--docs-interaction-desc-text-size,13.5px)}
[data-operations-header]{display:flex;align-items:center;gap:8px;min-height:32px;padding:6px var(--op-pad-x);border-bottom:var(--op-rule-w) solid var(--op-rule)}
[data-operations-title]{margin:0;min-width:0;font-size:var(--docs-interaction-title-text-size,13.5px);font-weight:var(--docs-interaction-title-weight,600);line-height:1.3;color:var(--docs-interaction-title-fg,var(--docs-ink,#1f1f1f));overflow-wrap:anywhere}
[data-interaction-operation]+[data-interaction-operation]{border-top:var(--op-rule-w) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)))}
[data-operation-line]{padding:0 var(--op-pad-x)}
[data-operation-line-row]{display:flex;align-items:center;gap:8px;min-height:36px;padding:var(--docs-interaction-header-pad-y,9px) 0}
[data-operation-name]{min-width:0;flex:1 1 auto;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--docs-interaction-header-text-size,13px);font-weight:var(--docs-interaction-header-weight,500);line-height:1.4;color:var(--docs-interaction-header-fg,var(--docs-syn-fn,#0b6e99));overflow-wrap:anywhere}
[data-operation-tail]{font-weight:400;color:var(--docs-muted,#666562)}
[data-operation-disclosure][open] [data-operation-tail]{display:none}
[data-operation-kind-badge]{flex:none;margin-left:auto;padding:2px 6px;border:1px solid var(--op-kind-line);border-radius:var(--radius,2px);background:var(--op-kind-soft);font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;font-weight:500;line-height:1.35;color:var(--op-kind)}
[data-operation-kind-badge="action"]{--op-kind:var(--docs-kind-action,#9d530d);--op-kind-line:var(--docs-kind-action-line,color-mix(in srgb,#d9730d 45%,#f8f8f7));--op-kind-soft:var(--docs-kind-action-soft,#faebdd)}
[data-operation-kind-badge="query"]{--op-kind:var(--docs-kind-query,#0b6e99);--op-kind-line:var(--docs-kind-query-line,color-mix(in srgb,#0b6e99 45%,#f8f8f7));--op-kind-soft:var(--docs-kind-query-soft,#ddebf1)}
[data-operation-kind-badge="event"]{--op-kind:var(--docs-kind-event,#6940a5);--op-kind-line:var(--docs-kind-event-line,color-mix(in srgb,#6940a5 45%,#f8f8f7));--op-kind-soft:var(--docs-kind-event-soft,#eae4f2)}
[data-operation-purpose]{display:block;max-width:75ch;margin:-4px 0 0;padding:0 0 10px 22px;font-size:var(--docs-interaction-desc-text-size,13.5px);line-height:var(--docs-interaction-desc-line-height,20px);color:var(--docs-muted,#666562)}
[data-operation-disclosure][open] [data-operation-purpose]{color:var(--docs-text,#2a2a2a)}
[data-operation-body]{overflow:hidden}
@media screen{[data-operation-disclosure]:not([open])>[data-operation-body]{height:0}}
[data-op-grid]{display:grid;grid-template-columns:minmax(0,1fr);border-top:var(--op-rule-w) solid var(--op-rule)}
[data-op-params],[data-op-returns]{min-width:0;padding-bottom:8px}
[data-op-returns]{padding-top:8px}
[data-op-section-label]{padding:var(--docs-interaction-column-head-pad-y,8px) var(--op-pad-x) 4px;font-size:var(--docs-interaction-column-head-text-size,13.5px);font-weight:500;line-height:1.5;color:var(--docs-interaction-column-head-fg,var(--docs-shape-muted,var(--docs-muted,#666562)))}
[data-op-return-type]{margin-left:6px;font-weight:400}
[data-op-return-type] [data-field-token="type"]{display:inline}
[data-op-none]{margin:0;padding:0 var(--op-pad-x);font-size:13.5px;line-height:1.5;color:var(--docs-muted,#666562)}
[data-op-sig],[data-op-example]{min-width:0;background:var(--docs-code-block-bg,color-mix(in srgb,var(--muted) 30%,transparent))}
[data-op-sig]{box-shadow:0 1px 0 0 var(--docs-code-block-bg,color-mix(in srgb,var(--muted) 30%,transparent))}
[data-op-sig] [data-code-line]{font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace)}
@container (min-width:720px){[data-op-grid][data-has-ledger]{grid-template-columns:minmax(0,var(--docs-pane-split,46%)) minmax(0,1fr)}[data-op-grid][data-has-ledger]>[data-op-params]{grid-column:1;grid-row:1}[data-op-grid][data-has-ledger]>[data-op-sig]{grid-column:2;grid-row:1}[data-op-grid][data-has-ledger]>[data-op-returns]{grid-column:1;grid-row:2}[data-op-grid][data-has-ledger]>[data-op-example]{grid-column:2;grid-row:2}[data-op-grid][data-has-ledger]:not([data-has-example])>[data-op-sig]{grid-row:1/span 2}[data-op-grid][data-has-ledger]>:is([data-op-sig],[data-op-example]){border-left:var(--op-rule-w) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)))}}
@media(prefers-reduced-motion:reduce){[data-docs-block-type="interaction-surface"] *{scroll-behavior:auto;transition-duration:.01ms}}
`;
const SURFACE_SHEET = FIELD_LEDGER_STYLE + REF_TILE_STYLE + REF_CODE_PANE_STYLE + DISCLOSURE_STYLE + SURFACE_STYLE + SIG_TOKEN_STYLE;

function OperationRow({ blockId, operation }: { blockId: string; operation: InteractionSurfaceOperation }) {
  const kind: OperationKind = operation.kind ?? "action";
  const { lines, rows } = buildOperation(operation);
  const shape = operation.returnShape ? buildShapeModel(operation.returnShape.fields, operation.returnShape.example, (path) => ({ "data-shape-path": path })) : undefined;
  const hasReturns = Boolean(operation.returns || operation.returnShape);
  const hasLedger = rows.length > 0 || hasReturns;
  const nameId = domId(blockId, operation.name, "name"); const kindId = domId(blockId, operation.name, "kind"); const purposeId = domId(blockId, operation.name, "purpose");
  return <div data-interaction-operation={operation.name} data-operation-kind={kind}>
    {/* No `open` attribute is ever rendered, so a re-render (the workbench node view re-renders on every selection change) never resets a row the reader toggled. */}
    <details ref={syncDisclosureExpanded} data-disclosure="true" data-operation-disclosure="true">
      <summary data-operation-line="true" aria-labelledby={`${nameId} ${kindId}`} aria-describedby={operation.description ? purposeId : undefined}>
        <span data-operation-line-row="true">
          <DisclosureChevron />
          <span data-operation-name="true" id={nameId}>{operation.name}<span data-operation-tail="true">{signatureTail(operation)}</span></span>
          <span data-operation-kind-badge={kind} id={kindId}>{kind}</span>
        </span>
        {operation.description && <span data-operation-purpose="true" id={purposeId}>{operation.description}</span>}
      </summary>
      <div data-operation-body="true">
        <div data-op-grid="true" data-has-ledger={hasLedger ? "true" : undefined} data-has-example={shape?.exampleLines ? "true" : undefined}>
          <LinkGroup>
            {hasLedger && <div data-op-params="true">
              <div data-op-section-label="true">Parameters</div>
              {rows.length > 0 ? <FieldLedger rows={rows} /> : <p data-op-none="true">No parameters</p>}
            </div>}
            <div data-op-sig="true" data-code-surface="true" data-ref-code="true">
              <CodeLines lines={lines} tabIndex={0} role="region" aria-label={`${operation.name} signature`} />
            </div>
          </LinkGroup>
          {hasReturns && <LinkGroup>
            <section data-op-returns="true" data-operation-output="true" aria-label={`${operation.name} returns`}>
              <div data-op-section-label="true">Returns{operation.returns && <span data-op-return-type="true"><FieldType value={operation.returns} /></span>}</div>
              {shape && shape.rows.length > 0 && <FieldLedger rows={shape.rows} data-return-ledger="true" />}
            </section>
            {shape?.exampleLines && <div data-op-example="true" data-code-surface="true" data-ref-code="true">
              <CodeLines data-shape-example="true" lines={shape.exampleLines} tabIndex={0} role="region" aria-label={`${operation.returns ?? operation.name} example`} />
            </div>}
          </LinkGroup>}
        </div>
      </div>
    </details>
  </div>;
}

export function InteractionSurfaceBlock({ id, title, operations }: { id: string; title?: string; operations: InteractionSurfaceOperation[] }) {
  return <section className="not-prose w-full min-w-0" data-docs-block-type="interaction-surface" data-source-id={id}>
    <style>{SURFACE_SHEET}</style>
    <header data-operations-header="true">
      <span data-ref-tile aria-hidden="true"><Plug aria-hidden="true" /></span>
      <h3 data-operations-title="true">{title?.trim() || "Operations"}</h3>
    </header>
    <div data-operations-list="true">
      {operations.map((operation) => <OperationRow key={operation.name} blockId={id} operation={operation} />)}
    </div>
  </section>;
}
