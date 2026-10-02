"use client";

import type { ReactNode } from "react";
import type { OutlineRow } from "@codecaine-ai/docs-model";
import {
  TREE_ICONS,
  TreeGuides,
  TreeHead,
  TreeMark,
  TreeStyle,
  depthStyle,
  elbowGuides,
  treeVars,
  type TreeGuide,
} from "./tree-rows";

/*
 * Shared read-only renderer for the two code-outline blocks, call-stack and
 * component-tree, on the trees row system (tree-rows.tsx): one panel with a
 * family-tile head, one row per node with continuous guides, a diff gutter
 * when any row changed, the row text as code colored by syntax role, an
 * aligned comment column that wraps, and a muted source column. A branch row
 * leads with "?" (the agent-view notation) in the control-flow color.
 *
 * Every visual value reads a --docs-outline-rows-* token, falling back to the
 * shared role token and then to its light literal, so the block renders in a
 * static export without the workbench theme.
 */

export type OutlineRowsFlavor = "call-stack" | "component";

type Token = { kind: string; text: string };

const STRING = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|` + "`[^`]*`";
const KEYWORD = String.raw`\b(?:return|await|new|throw|if|else|async|const|let|var|function|typeof|instanceof|yield)\b`;
const CONTROL = /^(?:return|throw|if|else|await|yield)$/;
const CONSTANT = String.raw`\b(?:true|false|null|undefined)\b`;
const NUMBER = String.raw`\b\d[\d_.]*\b`;
const CALL = String.raw`[A-Za-z_$][\w$]*(?=\s*\()`;
const PROP_AFTER_DOT = String.raw`(?<=\.)[A-Za-z_$][\w$]*`;

/** Group order = kind order below. */
const CALL_STACK_PATTERN = new RegExp(
  [
    STRING,
    KEYWORD,
    CONSTANT,
    NUMBER,
    CALL,
    PROP_AFTER_DOT,
    String.raw`\b[A-Z][\w$]*\b`,
    String.raw`[()[\]{}.,;:=<>!?+\-*/%&|^~…]+`,
  ]
    .map((source) => `(${source})`)
    .join("|"),
  "g",
);
const CALL_STACK_KINDS = ["string", "keyword", "constant", "number", "call", "prop", "type", "punct"];

const COMPONENT_PATTERN = new RegExp(
  [
    STRING,
    String.raw`(?<=<\/?)[A-Za-z][\w.]*`,
    CALL,
    String.raw`[A-Za-z_][\w-]*(?==(?!=))`,
    PROP_AFTER_DOT,
    KEYWORD,
    CONSTANT,
    NUMBER,
    String.raw`<\/?|\/?>`,
    String.raw`[{}]`,
    String.raw`[()[\].,;:=!?+\-*/%&|…]+`,
  ]
    .map((source) => `(${source})`)
    .join("|"),
  "g",
);
const COMPONENT_KINDS = ["string", "element", "call", "prop", "prop", "keyword", "constant", "number", "tagpunct", "brace", "punct"];

/**
 * Splits code text into role-colored spans; unmatched text stays plain ink.
 * Call stack: the frame's callee (its first call, drawn bold), other calls,
 * keywords, literals, properties, types, punctuation.
 * Component tree: components (`<Name`) vs intrinsic tags (`<div`), props,
 * hooks (`useX(`) and other calls, literals, tag brackets, expression braces
 * and other punctuation, colored as the code theme colors TSX.
 * A hook and a component differ by shape, `useX()` vs `<X>`, not only by color.
 */
export function tokenizeOutlineCode(text: string, flavor: OutlineRowsFlavor): Token[] {
  const pattern = flavor === "component" ? COMPONENT_PATTERN : CALL_STACK_PATTERN;
  const kinds = flavor === "component" ? COMPONENT_KINDS : CALL_STACK_KINDS;
  const tokens: Token[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ kind: "plain", text: text.slice(cursor, index) });
    const group = match.slice(1).findIndex((value) => value !== undefined);
    let kind = kinds[group] ?? "plain";
    if (kind === "element") kind = /^[A-Z]|\./.test(match[0]) ? "type" : "tag";
    else if (kind === "call" && flavor === "component" && /^use[A-Z]/.test(match[0])) kind = "hook";
    // Dark+ draws control-flow keywords apart from declaration keywords.
    else if (kind === "keyword" && CONTROL.test(match[0])) kind = "control";
    // A call-stack frame is the function it enters: its first call is the callee.
    else if (kind === "call" && flavor === "call-stack" && !tokens.some((t) => t.kind === "callee")) kind = "callee";
    tokens.push({ kind, text: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) tokens.push({ kind: "plain", text: text.slice(cursor) });
  return tokens;
}

function renderCode(text: string, flavor: OutlineRowsFlavor): ReactNode[] {
  return tokenizeOutlineCode(text, flavor).map((token, index) =>
    token.kind === "plain" ? (
      <span key={index}>{token.text}</span>
    ) : (
      <span key={index} className={`docs-tree__tok-${token.kind}`} data-outline-token={token.kind}>
        {token.text}
      </span>
    ),
  );
}

type FlatRow = { row: OutlineRow; depth: number; guides: TreeGuide[] };

function flattenRows(rows: readonly OutlineRow[], ancestorsLast: readonly boolean[], out: FlatRow[]): FlatRow[] {
  rows.forEach((row, index) => {
    const last = index === rows.length - 1;
    out.push({ row, depth: ancestorsLast.length, guides: elbowGuides(ancestorsLast, last) });
    flattenRows(row.children, [...ancestorsLast, last], out);
  });
  return out;
}

function hasChange(rows: readonly OutlineRow[]): boolean {
  return rows.some((row) => row.change !== undefined || hasChange(row.children));
}

/** `packages/x/src/tools.ts:383` → `packages/x/src/` + `tools.ts:383`. */
function splitSource(source: string): { dir: string; base: string } {
  const cut = source.lastIndexOf("/") + 1;
  return { dir: source.slice(0, cut), base: source.slice(cut) };
}

/** A branch condition without the "?" its author may already have typed. */
function branchText(text: string): string {
  return text.replace(/^\?\s*/, "");
}

/**
 * The outline-rows knobs (`--docs-outline-rows-*`) mapped onto the trees row
 * system's `--tr-*` variables; each falls back to the shared role token, then
 * to the light (app palette) literal.
 */
const OUTLINE_ROWS_VARS = treeVars({
  "--tr-bg": "var(--docs-outline-rows-bg,var(--docs-panel,#f8f8f7))",
  "--tr-border": "var(--docs-outline-rows-border,var(--docs-rule,#e6e5e3))",
  "--tr-border-width": "var(--docs-outline-rows-border-width,1px)",
  "--tr-radius": "var(--docs-outline-rows-radius,var(--radius,2px))",
  "--tr-pad-y": "var(--docs-outline-rows-pad-y,8px)",
  "--tr-pad-x": "var(--docs-outline-rows-pad-x,12px)",
  "--tr-text-size": "var(--docs-outline-rows-text-size,13px)",
  "--tr-row": "var(--docs-outline-rows-line-height,28px)",
  "--tr-ink": "var(--docs-outline-rows-ink,var(--docs-ink,#1f1f1f))",
  "--tr-note-fg": "var(--docs-outline-rows-comment-fg,var(--docs-muted,#666562))",
  "--tr-note-size": "var(--docs-outline-rows-comment-text-size,13.5px)",
  "--tr-source-size": "var(--docs-outline-rows-source-text-size,12px)",
  "--tr-guide": "var(--docs-outline-rows-guide,color-mix(in srgb,var(--docs-ink,#1f1f1f) 75%,transparent))",
  "--tr-muted": "var(--docs-outline-rows-muted-fg,var(--docs-muted,#666562))",
  "--tr-added-fg": "var(--docs-outline-rows-added,var(--docs-diff-add,#26744f))",
  "--tr-added-bg": "var(--docs-outline-rows-added-bg,var(--docs-diff-add-bg,color-mix(in srgb,#287c55 8%,#f8f8f7)))",
  "--tr-removed-fg": "var(--docs-outline-rows-removed,var(--docs-diff-del,#c62121))",
  "--tr-removed-bg": "var(--docs-outline-rows-removed-bg,var(--docs-diff-del-bg,color-mix(in srgb,#e03e3e 8%,#f8f8f7)))",
  "--tr-modified-fg": "var(--docs-outline-rows-modified,var(--docs-diff-mod,#805f01))",
  "--tr-modified-bg": "var(--docs-outline-rows-modified-bg,var(--docs-diff-mod-bg,color-mix(in srgb,#dfab01 9%,#f8f8f7)))",
  /* syntax: the code theme's own --syntax-* roles, so a row reads the way the
     editor colors the same code; each literal is VS Code Dark+ */
  "--tr-syn-var": "var(--docs-outline-rows-var-fg,var(--syntax-key,#9cdcfe))",
  "--tr-syn-fn": "var(--docs-outline-rows-fn-fg,var(--syntax-function,#dcdcaa))",
  "--tr-syn-type": "var(--docs-outline-rows-type-fg,var(--syntax-type,#4ec9b0))",
  "--tr-syn-tag": "var(--docs-outline-rows-tag-fg,var(--syntax-tag,#569cd6))",
  "--tr-syn-keyword": "var(--docs-outline-rows-keyword-fg,var(--syntax-keyword,#569cd6))",
  "--tr-syn-control": "var(--docs-outline-rows-control-fg,var(--syntax-control,#c586c0))",
  "--tr-syn-constant": "var(--docs-outline-rows-constant-fg,var(--syntax-boolean,#569cd6))",
  "--tr-syn-string": "var(--docs-outline-rows-string-fg,var(--syntax-string,#ce9178))",
  "--tr-syn-number": "var(--docs-outline-rows-number-fg,var(--syntax-number,#b5cea8))",
  "--tr-syn-punct": "var(--docs-outline-rows-punct-fg,var(--syntax-punctuation,#d4d4d4))",
  "--tr-syn-bracket": "var(--docs-outline-rows-bracket-fg,color-mix(in srgb,var(--syntax-punctuation,#d4d4d4) 60%,transparent))",
});

const FLAVOR_HEAD = {
  "call-stack": { icon: TREE_ICONS.stack, title: "Call stack" },
  component: { icon: TREE_ICONS.components, title: "Component tree" },
} as const;

export function OutlineRows({
  id,
  blockType,
  rows,
  flavor,
}: {
  id: string;
  blockType: string;
  rows: readonly OutlineRow[];
  flavor: OutlineRowsFlavor;
}) {
  const flat = flattenRows(rows, [], []);
  const diff = hasChange(rows);
  const head = FLAVOR_HEAD[flavor];
  return (
    <section className="not-prose my-4 w-full" data-docs-block-type={blockType} data-source-id={id}>
      <TreeStyle />
      <figure className="docs-tree" data-tree-kind={blockType} data-outline-flavor={flavor} data-code-surface="true" style={OUTLINE_ROWS_VARS}>
        <TreeHead icon={head.icon} title={head.title} />
        <div
          className="docs-tree__rows"
          role="list"
          aria-label={head.title}
          data-diff={diff ? "" : undefined}
          {...(diff ? { "data-outline-diff": "true" } : {})}
        >
          {flat.length === 0 ? (
            <div className="docs-tree__empty">(no rows)</div>
          ) : (
            flat.map(({ row, depth, guides }, index) => {
              const branch = row.kind === "branch";
              const source = row.source ? splitSource(row.source) : null;
              return (
                <div
                  key={index}
                  className="docs-tree__row"
                  role="listitem"
                  aria-level={depth + 1}
                  data-kind={row.kind ?? "row"}
                  data-change={row.change}
                  data-outline-row={row.kind ?? "row"}
                  data-outline-depth={depth}
                  {...(row.change ? { "data-outline-change": row.change } : {})}
                >
                  {diff && <TreeMark change={row.change} />}
                  <span
                    className={row.comment ? "docs-tree__path" : "docs-tree__path docs-tree__path--span"}
                    style={depthStyle(depth)}
                  >
                    <TreeGuides guides={guides} />
                    <code className="docs-tree__code">
                      {branch ? (
                        <>
                          <span className="docs-tree__if">?</span>
                          {renderCode(branchText(row.text), flavor)}
                        </>
                      ) : (
                        renderCode(row.text, flavor)
                      )}
                    </code>
                  </span>
                  {row.comment ? <span className="docs-tree__note">{row.comment}</span> : null}
                  {source ? (
                    <span className="docs-tree__src" title={row.source} data-outline-source={row.source}>
                      <span className="docs-tree__sr">{source.dir}</span>
                      {source.base}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </figure>
    </section>
  );
}
