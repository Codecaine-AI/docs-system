"use client";

import type { ReactNode } from "react";
import { Plug } from "lucide-react";
import type { Field } from "@codecaine-ai/docs-model";
import { CodeLines, LinkGroup, type LinkedCodeLine } from "../linked-panels";
import { DescribedName } from "../described-name";
import { monoBreaks } from "../mono-breaks";
import { DISCLOSURE_STYLE, DisclosureChevron, syncDisclosureExpanded } from "../disclosure";
import { FIELD_LEDGER_STYLE, FieldLedger, type FieldLedgerRow } from "../state-shape/field-ledger";
import { REF_CODE_PANE_STYLE, REF_TILE_STYLE, buildShapeModel, hangingLine } from "../state-shape/StateShapeDocsBlock";
import { tokenizeExampleCall, tokenizeSigType } from "./signature-tokens";

export const INTERACTION_SURFACE_LABEL = "Interaction Surface";
export const INTERACTION_SURFACE_AGENT_DESCRIPTION =
  'Operations on state as rows of one reference panel; the surface title heads the panel. The whole panel is a dark code surface colored like VS Code Dark+. Operations start collapsed as one-line rows: chevron and the real dotted name in mono (never humanized) as receiver.method(…) → ReturnType, params elided; they open on click, Enter, or Space. The name is a described name: hover or focus shows a tooltip with a lowercase kind badge (action, query, or event, colored by kind) above the purpose. Open, a Parameters card holds the params ledger beside the authored example call (exampleCall), and a Returns card headed by the return type holds the returned-fields ledger beside the returned example. Ledgers share the State Shape field rows: name, muted ? when optional, type, and the description printed inline. Typed props: { title?: string; operations: Array<{ name: string; description?: string; params?: Array<{ name: string; type?: string; required?: boolean; description?: string; fields?: Param[] }>; returns?: string; returnShape?: { fields: Field[]; example?: string }; exampleCall?: string; kind?: "action" | "query" | "event" }> }.';

export type InteractionSurfaceParam = Field;
export type InteractionSurfaceOperation = {
  name: string;
  description?: string;
  params?: InteractionSurfaceParam[];
  returns?: string;
  /** Explicit documentation of output fields and a JSON example; never inferred from the type name. */
  returnShape?: { fields: Field[]; example?: string };
  /** Authored code text of one example invocation; never inferred. */
  exampleCall?: string;
  kind?: "action" | "query" | "event";
};
type OperationKind = NonNullable<InteractionSurfaceOperation["kind"]>;

// The whole panel is a code surface (the dark code-panel island), and every
// piece of code, on the collapsed operation line, in the example-call pane and
// in the Returns card head, wears
// the code theme's --syntax-* roles the way VS Code Dark+ colors a TS call:
// the receiver (`file-tree`) the variable role, the method the function role,
// param names the variable role, types the type role, `void` / literals the
// keyword role, punctuation and the → arrow plain punctuation. Role
// font-style / weight follow styles/code.css. The rail's sig knobs
// (--docs-interaction-sig-name / -type / -punct, and -header-fg for the line's
// method) sit in front of their role; the var() chains after them equal
// code.css's, so hosts without the theme layer still color the panel like
// their code blocks. Plain CSS in the block's <style>, keyed on
// data-sig-token, so nested type tokens need no classes.
function sigRole(role: string, color: string): string {
  return `color:${color};font-style:var(--syntax-${role}-font-style,normal);font-weight:var(--syntax-${role}-font-weight,inherit)`;
}
const SIG_PUNCT_COLOR = "var(--docs-interaction-sig-punct,var(--syntax-punctuation,var(--docs-code-fg,var(--docs-text-secondary,var(--color-text-default,inherit)))))";
const SIG_TYPE_COLOR = "var(--docs-interaction-sig-type,var(--syntax-type,var(--syntax-string,var(--color-text-green,#448361))))";
const SIG_FUNCTION_ROLE = "var(--syntax-function,var(--syntax-string,var(--color-text-green,#448361)))";
const SIG_KEY_COLOR = "var(--syntax-key,var(--color-text-purple,#9065b0))";
/** Every place code prints: the example-call pane, the operation line, and the Returns card head. */
const SIG = ":is([data-op-call],[data-operation-name],[data-op-card-head])";
export const SIG_TOKEN_STYLE = [
  `[data-op-call] [data-sig-token="name"]{${sigRole("function", `var(--docs-interaction-sig-name,${SIG_FUNCTION_ROLE})`)}}`,
  `[data-operation-name] [data-sig-token="name"]{${sigRole("function", `var(--docs-interaction-header-fg,${SIG_FUNCTION_ROLE})`)}}`,
  `${SIG} :is([data-sig-token="receiver"],[data-sig-token="param"],[data-sig-token="key"]){${sigRole("key", SIG_KEY_COLOR)}}`,
  `${SIG} :is([data-sig-token="type"],[data-sig-token="type-name"]){${sigRole("type", SIG_TYPE_COLOR)}}`,
  `${SIG} [data-sig-token="string"]{${sigRole("string", "var(--syntax-string,var(--color-text-green,#448361))")}}`,
  `${SIG} [data-sig-token="number"]{${sigRole("number", "var(--syntax-number,var(--color-text-blue,#337ea9))")}}`,
  `${SIG} [data-sig-token="boolean"]{${sigRole("boolean", "var(--syntax-boolean,var(--color-text-orange,#d9730d))")}}`,
  `${SIG} [data-sig-token="null"]{${sigRole("null", "var(--syntax-null,var(--color-text-red,#d44c47))")}}`,
  `${SIG} [data-sig-token="keyword"]{${sigRole("keyword", "var(--syntax-keyword,var(--syntax-key,var(--color-text-purple,#9065b0)))")}}`,
  // Dark+ prints the optional `?`, the member dot, and the `→` arrow as plain punctuation.
  `${SIG} :is([data-sig-token="punct"],[data-sig-token="optional"],[data-sig-token="returns"]){${sigRole("punctuation", SIG_PUNCT_COLOR)}}`,
].join("\n");

const RETURNS_ARROW = "→";

function PunctToken({ text }: { text: string }) { return <span data-sig-token="punct">{text}</span>; }

/**
 * The operation name as Dark+ colors a member call: every receiver segment
 * (`file-tree`, `DocsStore`) the variable role, each dot punctuation, the
 * last segment (the method) the function role of the wrapping name token.
 * The wrapper's text is the real dotted name, unchanged.
 */
function QualifiedName({ name }: { name: string }) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return <span data-sig-token="name">{name}</span>;
  const receiver = name.slice(0, dot).split(".");
  return <span data-sig-token="name">{receiver.map((segment, index) => <span key={index}><span data-sig-token="receiver">{segment}</span><span data-sig-token="punct">.</span></span>)}{name.slice(dot + 1)}</span>;
}

/** Type text as role-tagged spans inside one `data-sig-token="type"` wrapper. */
function TypeToken({ text }: { text: string }) {
  return <span data-sig-token="type">{tokenizeSigType(text).map((token, index) => token.kind === "space" ? token.text : <span key={index} data-sig-token={token.kind}>{monoBreaks(token.text)}</span>)}</span>;
}

/** Param ledger rows, each keyed `${operation}.${path}` so it can light the example-call lines that set it. */
function paramRows(operation: InteractionSurfaceOperation): FieldLedgerRow[] {
  const rows: FieldLedgerRow[] = [];
  const walk = (fields: readonly Field[], depth: number, parentPath: string): void => {
    for (const param of fields) {
      const path = parentPath ? `${parentPath}.${param.name}` : param.name;
      const key = `${operation.name}.${path}`;
      rows.push({ path, field: param, depth, linkKey: key, attrs: { "data-param-note": key } });
      if (param.fields) walk(param.fields, depth + 1, path);
    }
  };
  walk(operation.params ?? [], 0, "");
  return rows;
}

/**
 * The authored example call as linked code lines: Dark+ role tokens (the same
 * data-sig-token roles as the operation line), each line keyed with the param
 * paths it sets so hovering a param row lights its lines. Only paths that
 * name a documented param link.
 */
function exampleCallLines(operation: InteractionSurfaceOperation, rows: readonly FieldLedgerRow[]): LinkedCodeLine[] {
  const known = new Set(rows.map((row) => row.path));
  return tokenizeExampleCall(operation.exampleCall ?? "").map(({ tokens, paths }) => {
    const keys = paths.filter((path) => known.has(path)).map((path) => `${operation.name}.${path}`);
    const lead = tokens[0]?.kind === "space" ? tokens[0].text.replace(/\t/g, "  ").length : 0;
    return {
      content: hangingLine(lead, tokens.map((token, index) => token.kind === "space" ? token.text : <span key={index} data-sig-token={token.kind}>{token.text}</span>)),
      ...(keys.length > 0 ? { linkKey: keys } : {}),
    };
  });
}

const ELIDED_PARAMS = "…";

/**
 * The collapsed line's signature tail: params elided to `(…)` (`()` when the
 * operation takes none), then the return type. The full signature is the
 * expanded pane's job.
 */
export function signatureTail(operation: InteractionSurfaceOperation): string {
  return `(${operation.params?.length ? ELIDED_PARAMS : ""})${operation.returns ? ` ${RETURNS_ARROW} ${operation.returns}` : ""}`;
}

/**
 * {@link signatureTail} as role-tagged tokens, the same roles as the signature
 * pane. One line, never wrapping: the return type is the part that gives way
 * (ellipsis, full text in its title). The tail's huge flex-shrink keeps the
 * name's proportional share of any overflow below a layout unit, so the name
 * only truncates once the return type is gone (a share of even 0.1px would
 * already trigger its ellipsis).
 */
function SignatureTailTokens({ operation }: { operation: InteractionSurfaceOperation }) {
  return <span data-operation-tail="true">
    <span data-operation-params="true"><PunctToken text="(" />{operation.params?.length ? <span data-sig-token="elided">{ELIDED_PARAMS}</span> : null}<PunctToken text=")" /></span>
    {operation.returns && <span data-sig-token="returns" data-operation-returns="true" title={operation.returns}> {RETURNS_ARROW} <TypeToken text={operation.returns} /></span>}
  </span>;
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
 * The open operation's Parameters / Returns cards span the full panel width
 * (a top and bottom rule, no side inset, no side frame), so their ledgers'
 * name and type columns start at the same x as a State Shape's on the page.
 * A closed operation's body is also a zero-height clip on screen (not only
 * the ::details-content box), so geometry readers such as the workbench's
 * grain mask never see the hidden code panes as on-screen code.
 */
const SURFACE_STYLE = `
[data-docs-block-type="interaction-surface"]{container-type:inline-size;margin:var(--ds-space-4) 0;color:var(--docs-text,#2a2a2a);background:var(--docs-interaction-bg,var(--docs-shape-bg,var(--docs-panel,#f8f8f7)));border:var(--docs-interaction-border-width,1px) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)));border-radius:var(--docs-interaction-radius,var(--radius,2px));--op-pad-x:var(--docs-interaction-pad-x,16px);--op-rule:var(--docs-interaction-rule,var(--docs-shape-rule,var(--docs-rule-soft,#efeeec)));--op-rule-w:var(--docs-interaction-rule-width,1px);--fl-pad-x:var(--op-pad-x);--fl-row-pad:var(--docs-interaction-row-pad,5px);--fl-row-min-h:var(--docs-shape-row-min-height,28px);--fl-rule:var(--op-rule);--fl-rule-w:var(--op-rule-w);--fl-name-w:var(--docs-shape-name-width,24ch);--fl-indent:var(--docs-interaction-indent,16px);--fl-guide:var(--docs-interaction-child-rule,var(--docs-shape-child-rule,var(--docs-rule,#e6e5e3)));--fl-guide-w:var(--docs-shape-child-rule-width,1px);--fl-name:var(--docs-interaction-note-name,var(--docs-shape-name,var(--syntax-key,var(--docs-syn-prop,#0d7164))));--fl-name-weight:var(--docs-interaction-note-name-weight,500);--fl-name-size:var(--docs-interaction-note-name-text-size,13px);--fl-type:var(--docs-interaction-note-type,var(--docs-shape-type,var(--syntax-type,var(--docs-syn-type,#805f01))));--fl-type-size:var(--docs-interaction-note-type-text-size,13px);--fl-muted:var(--docs-shape-muted,var(--docs-muted,#666562));--fl-optional:var(--docs-shape-optional-fg,var(--docs-muted,#666562));--fl-desc:var(--docs-interaction-note-fg,var(--docs-shape-desc-fg,var(--docs-muted,#666562)));--fl-desc-size:var(--docs-interaction-desc-text-size,13.5px)}
[data-operations-header]{display:flex;align-items:center;gap:var(--ds-space-2);min-height:var(--ds-space-8);padding:var(--ds-space-1-5) var(--op-pad-x);border-bottom:var(--op-rule-w) solid var(--op-rule)}
[data-operations-title]{margin:0;min-width:0;font-size:var(--docs-interaction-title-text-size,13.5px);font-weight:var(--docs-interaction-title-weight,600);line-height:1.3;color:var(--docs-interaction-title-fg,var(--docs-ink,#1f1f1f));overflow-wrap:anywhere}
[data-interaction-operation]+[data-interaction-operation]{border-top:var(--op-rule-w) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)))}
[data-operation-line]{padding:0 var(--op-pad-x)}
[data-operation-line-row]{position:relative;display:flex;align-items:center;gap:var(--ds-space-2);min-height:36px;padding:var(--docs-interaction-header-pad-y,9px) 0}
[data-operation-name]{display:flex;min-width:0;flex:1 1 auto;overflow:hidden;white-space:pre;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--docs-interaction-header-text-size,13px);font-weight:var(--docs-interaction-header-weight,500);line-height:1.4;color:var(--syntax-punctuation,var(--docs-code-fg,var(--docs-text,#2a2a2a)))}
[data-operation-name]>[data-described]{position:static;display:flex;flex:0 1 auto;min-width:0}
[data-operation-name] [data-has-description]{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;border-radius:0}
[data-operation-line-row] [data-description-tip]{left:22px;top:calc(100% - 4px);width:max-content;max-width:min(52ch,60cqi);font-size:var(--docs-interaction-desc-text-size,13.5px);line-height:var(--docs-interaction-desc-line-height,20px)}
@supports (anchor-name:--a) and (anchor-scope:--a){[data-operation-line-row]{anchor-scope:--op-name}[data-operation-line-row] [data-has-description]{anchor-name:--op-name}[data-operation-line-row] [data-description-tip]{position-anchor:--op-name;left:calc(anchor(right) + 12px);top:calc(anchor(top) - 7px)}}
[data-operation-line]:focus-visible [data-description-tip]{opacity:1;visibility:visible;translate:0 0;transition-delay:0s}
[data-operation-tip-kind]{display:block;margin:1px 0 var(--ds-space-1)}
[data-operation-tip-kind]:only-child{margin-bottom:1px}
[data-operation-tip-purpose]{display:block}
[data-operation-tail]{display:flex;flex:0 1000000 auto;min-width:0;font-weight:var(--ds-font-weight-regular)}
[data-operation-params]{flex:none}
[data-operation-returns]{min-width:0;overflow:hidden;text-overflow:ellipsis}
[data-operation-name] [data-sig-token="elided"]{color:var(--docs-muted,#666562)}
[data-operation-disclosure][open] [data-operation-tail]{display:none}
[data-operation-sr]{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
[data-docs-block-type="interaction-surface"][data-docs-block-type] :is([data-operation-name],[data-operation-name] *,[data-op-row] [data-code-line],[data-op-row] [data-code-line] *,[data-op-row],[data-op-row] *,[data-op-card-head] *){font-variant-ligatures:none;font-feature-settings:"liga" 0,"calt" 0}
[data-operation-kind-badge]{display:inline-block;flex:none;padding:0 var(--ds-space-1-5);border:var(--ds-border-width-hairline) solid var(--op-kind-line);border-radius:var(--radius,2px);background:var(--op-kind-soft);font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--ds-font-size-ui-xs);font-weight:var(--ds-font-weight-medium);line-height:1.35;color:var(--op-kind)}
[data-operation-kind-badge="action"]{--op-kind:var(--docs-kind-action,#9d530d);--op-kind-line:var(--docs-kind-action-line,color-mix(in srgb,#d9730d 45%,#f8f8f7));--op-kind-soft:var(--docs-kind-action-soft,#faebdd)}
[data-operation-kind-badge="query"]{--op-kind:var(--docs-kind-query,#0b6e99);--op-kind-line:var(--docs-kind-query-line,color-mix(in srgb,#0b6e99 45%,#f8f8f7));--op-kind-soft:var(--docs-kind-query-soft,#ddebf1)}
[data-operation-kind-badge="event"]{--op-kind:var(--docs-kind-event,#6940a5);--op-kind-line:var(--docs-kind-event-line,color-mix(in srgb,#6940a5 45%,#f8f8f7));--op-kind-soft:var(--docs-kind-event-soft,#eae4f2)}
[data-operation-body]{overflow:hidden}
@media screen{[data-operation-disclosure]:not([open])>[data-operation-body]{height:0}}
[data-operation-disclosure][open]::details-content{overflow:visible}
[data-operation-disclosure][open]>[data-operation-body]{overflow:visible}
[data-op-cards]{display:flex;flex-direction:column;gap:var(--ds-space-3);padding:0 0 var(--ds-space-3)}
[data-op-card]{min-width:0;container-type:inline-size;background:color-mix(in srgb,var(--docs-ink,#1f1f1f) 5%,var(--docs-interaction-bg,var(--docs-shape-bg,var(--docs-panel,#f8f8f7))));border-block:var(--op-rule-w) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)))}
[data-op-card-head]{display:flex;align-items:baseline;gap:var(--ds-space-2);margin:0;padding:var(--docs-interaction-column-head-pad-y,8px) var(--op-pad-x);font-family:var(--docs-font-body,var(--font-sans,ui-sans-serif,system-ui,sans-serif));font-size:var(--docs-interaction-column-head-text-size,13px);font-weight:var(--ds-font-weight-semibold);line-height:1.4;color:var(--docs-interaction-column-head-fg,var(--docs-ink,#1f1f1f))}
[data-op-card-head]:not(:last-child){border-bottom:calc(2 * var(--op-rule-w)) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)))}
[data-op-return-type]{min-width:0;font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-weight:var(--ds-font-weight-regular);overflow-wrap:normal}
[data-op-row]{display:grid;grid-template-columns:minmax(0,1fr)}
[data-op-list]{min-width:0;padding:var(--ds-space-0-5) 0 var(--ds-space-1-5)}
[data-op-code]{min-width:0;background:var(--docs-code-block-bg,color-mix(in srgb,var(--muted) 30%,transparent));border-top:var(--op-rule-w) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)))}
[data-op-row]>[data-op-code]:first-child{border-top:0}
[data-op-code] [data-code-line]{font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace)}
@container (min-width:560px){[data-op-row][data-has-list][data-has-code]{grid-template-columns:minmax(min(360px,calc(100% - 260px)),var(--docs-pane-split,44%)) minmax(260px,1fr)}[data-op-row][data-has-list][data-has-code]>[data-op-code]{border-top:0;border-left:var(--op-rule-w) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)))}}
@media print{[data-operation-name]{flex-wrap:wrap;white-space:normal}[data-operation-name]>[data-described]{display:block;flex-basis:100%}[data-operation-tip-kind]{display:inline-block;margin:0 var(--ds-space-2) 0 0}[data-operation-tip-purpose]{display:inline}}
@media(prefers-reduced-motion:reduce){[data-docs-block-type="interaction-surface"] *{scroll-behavior:auto;transition-duration:.01ms}}
`;
const SURFACE_SHEET = FIELD_LEDGER_STYLE + REF_TILE_STYLE + REF_CODE_PANE_STYLE + DISCLOSURE_STYLE + SURFACE_STYLE + SIG_TOKEN_STYLE;

function OperationRow({ blockId, operation }: { blockId: string; operation: InteractionSurfaceOperation }) {
  const kind: OperationKind = operation.kind ?? "action";
  const rows = paramRows(operation);
  const callLines = operation.exampleCall ? exampleCallLines(operation, rows) : undefined;
  const shape = operation.returnShape ? buildShapeModel(operation.returnShape.fields, operation.returnShape.example, (path) => ({ "data-shape-path": path })) : undefined;
  const hasCall = rows.length > 0 || Boolean(callLines);
  const hasReturnRow = Boolean(shape && (shape.rows.length > 0 || shape.exampleLines));
  const hasReturns = Boolean(operation.returns || operation.returnShape);
  const nameId = domId(blockId, operation.name, "name"); const kindId = domId(blockId, operation.name, "kind"); const purposeId = domId(blockId, operation.name, "purpose");
  return <div data-interaction-operation={operation.name} data-operation-kind={kind}>
    {/* No `open` attribute is ever rendered, so a re-render (the workbench node view re-renders on every selection change) never resets a row the reader toggled. */}
    <details ref={syncDisclosureExpanded} data-disclosure="true" data-operation-disclosure="true">
      {/* One line, collapsed or open: chevron and `receiver.method(…) → Type`. The name is a described name: its tooltip (hover dwell, or the summary's keyboard focus) shows the kind badge and the purpose; the summary is labelled by name + kind and described by the purpose for assistive tech. */}
      <summary data-operation-line="true" aria-labelledby={`${nameId} ${kindId}`} aria-describedby={operation.description ? purposeId : undefined}>
        <span data-operation-line-row="true">
          <DisclosureChevron />
          <span data-operation-name="true" id={nameId}>
            <DescribedName
              id={`${purposeId}-tip`}
              focusable={false}
              name={<QualifiedName name={operation.name} />}
              tip={<><span data-operation-tip-kind="true"><span data-operation-kind-badge={kind} aria-hidden="true">{kind}</span></span>{operation.description && <span data-operation-tip-purpose="true" id={purposeId}>{operation.description}</span>}</>}
              tipAttrs={{ "data-operation-tip": "true" }}
            />
            <SignatureTailTokens operation={operation} />
          </span>
          <span data-operation-sr="true" id={kindId}>{kind}</span>
        </span>
      </summary>
      {/* Open: the Parameters card (params | example call), then the Returns card (fields | example). */}
      <div data-operation-body="true">
        {(hasCall || hasReturns) && <div data-op-cards="true">
          {hasCall && <section data-op-card="params" aria-label={`${operation.name} parameters`}>
            <h4 data-op-card-head="params">Parameters</h4>
            <LinkGroup>
              <div data-op-row="call" data-has-list={rows.length > 0 ? "true" : undefined} data-has-code={callLines ? "true" : undefined}>
                {rows.length > 0 && <div data-op-list="true" data-op-params="true"><FieldLedger rows={rows} /></div>}
                {callLines && <div data-op-code="true" data-op-call="true" data-code-surface="true" data-ref-code="true">
                  <CodeLines data-op-example-call="true" lines={callLines} tabIndex={0} role="region" aria-label={`${operation.name} example call`} />
                </div>}
              </div>
            </LinkGroup>
          </section>}
          {hasReturns && <section data-op-card="returns" data-op-returns="true" data-operation-output="true" aria-label={`${operation.name} returns`}>
            <h4 data-op-card-head="returns">Returns{operation.returns && <span data-op-return-type="true"><TypeToken text={operation.returns} /></span>}</h4>
            {shape && hasReturnRow && <LinkGroup>
              <div data-op-row="returns" data-has-list={shape.rows.length > 0 ? "true" : undefined} data-has-code={shape.exampleLines ? "true" : undefined}>
                {shape.rows.length > 0 && <div data-op-list="true"><FieldLedger rows={shape.rows} data-return-ledger="true" /></div>}
                {shape.exampleLines && <div data-op-code="true" data-op-example="true" data-code-surface="true" data-ref-code="true">
                  <CodeLines data-shape-example="true" lines={shape.exampleLines} tabIndex={0} role="region" aria-label={`${operation.returns ?? operation.name} example`} />
                </div>}
              </div>
            </LinkGroup>}
          </section>}
        </div>}
      </div>
    </details>
  </div>;
}

export function InteractionSurfaceBlock({ id, title, operations }: { id: string; title?: string; operations: InteractionSurfaceOperation[] }) {
  return <section className="not-prose w-full min-w-0" data-docs-block-type="interaction-surface" data-source-id={id} data-code-surface="true">
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
