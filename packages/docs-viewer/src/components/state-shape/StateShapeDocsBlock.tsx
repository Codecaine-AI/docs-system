"use client";

import { useMemo, type ReactNode } from "react";
import { printJsonLines, type Field } from "@codecaine-ai/docs-model";
import { cn } from "../../ui/cn";
import {
  CodeLines,
  LinkGroup,
  LinkTarget,
  ProseRows,
  type LinkedCodeLine,
} from "../linked-panels";

export const STATE_SHAPE_LABEL = "State Shape";

export const STATE_SHAPE_AGENT_DESCRIPTION =
  "Object shape definition: a recursive field tree (name, type, optionality, meaning) describing what a structure's state looks like, with an optional link to the defining source symbol and an optional JSON example instance — pair it with an interaction-surface block holding the operations that act on the shape. Rendered from typed props: { name?: string; description?: string; source?: { path: string; symbol?: string }; fields: Array<{ name: string; type?: string; required?: boolean; description?: string; fields?: Field[] }>; example?: string } (fields recurse; example is JSON text of an example INSTANCE of the shape). Renders as a two-pane card (S1 · STATE) with no header bar: the structure tree on the left — top-level fields as hairline-divided groups (bold mono name, mono type, a muted `?` marks required: false, muted description as a second line), nested fields contained behind a light left rule with no dividers of their own — and, when example parses as JSON, a line-numbered pretty-printed example pane on the right. Tree rows and example lines cross-link by field path: hover/pin paints the field's full extent in both panes (no visible line-number chips). State is always JSON, so the card never shows a language tag.";

export type StateShapeSourceProps = {
  /** Path of the defining source file, e.g. "packages/docs-model/src/doc-schema.ts". */
  path: string;
  /** Symbol within that file, e.g. "DocBlock". */
  symbol?: string;
};

/**
 * Field-row token tints, all routed through the `--docs-shape-*` theme
 * tokens (theme-folders.ts "state-shape" entry; defaults in
 * theme/semantic.css). The literal fallbacks keep host-neutral renders
 * sensible without that stylesheet: the type hue is the same amber the
 * interaction-surface signature uses (amber-700 light / amber-300 dark),
 * muted falls back to the shared muted foreground.
 */
export const FIELD_TOKEN_CLASS = {
  name: "text-foreground",
  type: "text-[color:var(--docs-shape-type,#b45309)] dark:text-[color:var(--docs-shape-type,#fcd34d)]",
  muted: "text-[color:var(--docs-shape-muted,var(--muted-foreground))]",
  description:
    "text-[color:var(--docs-shape-desc-fg,color-mix(in_srgb,var(--foreground)_72%,transparent))]",
} as const;

/** Block-name hue: plain ink by default (mockup S1's h3) — the --docs-shape-name knob can still recolor it. */
const SHAPE_NAME_CLASS = "text-[color:var(--docs-shape-name,var(--foreground))]";

/** Thin hairline for the pane split and row dividers. */
const SHAPE_RULE_BORDER = "border-[color:var(--docs-shape-rule,var(--border))]";

/**
 * Example-pane JSON token tints (data-json-token spans). Deterministic —
 * the pretty print is canonical, so a tiny line tokenizer covers the whole
 * grammar; no highlight.js. Hues route through the workbench `--syntax-*`
 * vars (the same buckets the hljs theme maps JSON onto), with fixed
 * fallbacks for host-neutral renders: keys take the cyan identity hue the
 * interaction-surface signature name uses, booleans the amber type hue —
 * the family's amber-cyan convention.
 */
const JSON_TOKEN_CLASS = {
  key: "text-[color:var(--syntax-key,#0e7490)] dark:text-[color:var(--syntax-key,#67e8f9)]",
  string:
    "text-[color:var(--syntax-string,#15803d)] dark:text-[color:var(--syntax-string,#86efac)]",
  number:
    "text-[color:var(--syntax-number,#1d4ed8)] dark:text-[color:var(--syntax-number,#93c5fd)]",
  boolean:
    "text-[color:var(--syntax-boolean,#b45309)] dark:text-[color:var(--syntax-boolean,#fcd34d)]",
  null: "text-[color:var(--syntax-null,#b91c1c)] dark:text-[color:var(--syntax-null,#fca5a5)]",
  punct: "text-muted-foreground",
} as const;

type JsonTokenKind = keyof typeof JSON_TOKEN_CLASS;

/** JSON lexeme scanner over one canonical pretty-printed line: strings (with escapes), numbers, literals, structural punctuation. */
const JSON_LEXEME_PATTERN =
  /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:]/g;

function jsonTokenKind(lexeme: string, rest: string): JsonTokenKind {
  if (lexeme.startsWith('"')) return /^\s*:/.test(rest) ? "key" : "string";
  if (lexeme === "true" || lexeme === "false") return "boolean";
  if (lexeme === "null") return "null";
  if (lexeme.length === 1 && "{}[],:".includes(lexeme)) return "punct";
  return "number";
}

/**
 * One pretty-printed JSON line as toned spans: a string followed by a colon
 * is a key, other strings are values; number/boolean/null literals and
 * structural punctuation each take their bucket. Whitespace passes through
 * as plain text. Deterministic — same line, same spans.
 */
export function jsonLineTokens(line: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  let cursor = 0;
  for (const match of line.matchAll(JSON_LEXEME_PATTERN)) {
    const index = match.index ?? 0;
    const lexeme = match[0];
    if (index > cursor) tokens.push(line.slice(cursor, index));
    const kind = jsonTokenKind(lexeme, line.slice(index + lexeme.length));
    tokens.push(
      <span key={index} data-json-token={kind} className={JSON_TOKEN_CLASS[kind]}>
        {lexeme}
      </span>,
    );
    cursor = index + lexeme.length;
  }
  if (cursor < line.length) tokens.push(line.slice(cursor));
  return tokens;
}

type FlatField = {
  field: Field;
  depth: number;
  /** Dot-path of field names, e.g. "fields.name" — also the row's linkKey. */
  path: string;
};

/** Depth-first flatten of the recursive field tree into hairline-divided rows. */
function flattenFields(
  fields: readonly Field[],
  depth = 0,
  parentPath = "",
): FlatField[] {
  const rows: FlatField[] = [];
  for (const field of fields) {
    const path = parentPath ? `${parentPath}.${field.name}` : field.name;
    rows.push({ field, depth, path });
    if (field.fields && field.fields.length > 0) {
      rows.push(...flattenFields(field.fields, depth + 1, path));
    }
  }
  return rows;
}

/**
 * "fields[0].name" -> "fields.name": every [i] array-index segment strips,
 * so a shape field matches its path at EVERY array position of the example.
 * A leading index ("[0].name" on an array-rooted example) leaves no leading
 * dot behind.
 */
function normalizeRangePath(path: string): string {
  return path.replace(/\[\d+\]/g, "").replace(/^\.+/, "");
}

type LineSpan = { start: number; end: number };

type ExampleModel = {
  /** Pretty-printed example lines (printJsonLines canon). */
  lines: readonly string[];
  /** Field dot-path -> chip span of its FIRST occurrence (a min–max across disjoint array elements would lie). */
  chipByPath: ReadonlyMap<string, LineSpan>;
  /** Per line (index 0 = line 1): every matched field covering it, DEEPEST first. */
  keysByLine: readonly (readonly string[] | undefined)[];
};

/**
 * Parse the example (tolerant — undefined when it does not parse) and map
 * shape fields onto its lines. Every line carries the whole chain of
 * matched fields covering it, deepest first: pointing at the line
 * activates the deepest field, while activating an ancestor (from its
 * tree row) still lights the line — so a parent extent always paints
 * contiguously, brace to brace. Chips name the field's FIRST occurrence;
 * hover still lights every occurrence across array elements.
 */
function mapExample(
  example: string | undefined,
  fieldPaths: readonly string[],
): ExampleModel | undefined {
  if (!example) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(example);
  } catch {
    return undefined;
  }
  const { lines, ranges } = printJsonLines(value);
  const paths = new Set(fieldPaths);
  const chipByPath = new Map<string, LineSpan>();
  const chains = new Array<string[] | undefined>(lines.length);
  for (const range of ranges) {
    const path = normalizeRangePath(range.path);
    if (!paths.has(path)) continue;
    if (!chipByPath.has(path)) {
      chipByPath.set(path, { start: range.start, end: range.end });
    }
    for (let line = range.start; line <= range.end; line += 1) {
      // Pre-order arrival: ancestors first — unshift leaves deepest first.
      const chain = (chains[line - 1] ??= []);
      if (chain[0] !== path) chain.unshift(path);
    }
  }
  return { lines, chipByPath, keysByLine: chains };
}

/** "packages/docs-model/src/doc-schema.ts" -> "doc-schema.ts". */
function sourceBasename(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/** The children container's rule: a very light gray line (half-strength shape rule). */
const CHILD_RULE_BORDER =
  "border-[color:var(--docs-shape-child-rule,color-mix(in_srgb,var(--docs-shape-rule,var(--border))_50%,transparent))]";

/**
 * One structure-tree row: bold mono name, amber type, muted `?` when
 * required: false, muted description as a smaller second line. Rows whose
 * field maps into the example are LinkTargets (the row lights its example
 * lines); unmatched rows are inert.
 */
function ShapeFieldRow({
  field,
  depth,
  path,
  linked,
}: {
  field: Field;
  depth: number;
  path: string;
  linked: boolean;
}) {
  const body = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span
          data-field-token="name"
          className={cn("break-all font-mono text-[13px] font-semibold", FIELD_TOKEN_CLASS.name)}
        >
          {field.name}
        </span>
        {field.type && (
          <span
            data-field-token="type"
            className={cn("break-all font-mono text-xs", FIELD_TOKEN_CLASS.type)}
          >
            {field.type}
          </span>
        )}
        {field.required === false && (
          <span
            data-field-token="optional"
            className={cn("font-mono text-[10px]", FIELD_TOKEN_CLASS.muted)}
          >
            ?
          </span>
        )}
      </div>
      {field.description && (
        <div
          data-field-token="description"
          className={cn(
            "mt-0.5 max-w-[46ch] text-xs leading-[1.45]",
            FIELD_TOKEN_CLASS.description,
          )}
        >
          {field.description}
        </div>
      )}
    </>
  );
  const shared = {
    "data-shape-field": field.name,
    "data-shape-path": path,
    "data-shape-depth": depth,
    className: cn(
      "text-xs",
      depth === 0 ? "px-5 py-[var(--docs-shape-row-pad,9px)]" : "py-1.5 pr-5",
    ),
  } as const;
  if (!linked) return <div {...shared}>{body}</div>;
  return (
    <LinkTarget linkKey={path} {...shared}>
      {body}
    </LinkTarget>
  );
}

/**
 * A field and its nested fields as one visual group — the pattern the
 * interaction-surface notes use: the field's own row, children contained
 * behind a very light left rule (one step per depth) with NO dividers of
 * their own; full-strength hairlines separate only the top-level fields.
 */
function ShapeFieldGroup({
  field,
  depth,
  path,
  model,
}: {
  field: Field;
  depth: number;
  path: string;
  model: ExampleModel | undefined;
}) {
  const children = field.fields ?? [];
  return (
    <div data-shape-field-group={path}>
      <ShapeFieldRow
        depth={depth}
        field={field}
        linked={model?.chipByPath.has(path) ?? false}
        path={path}
      />
      {children.length > 0 && (
        <div
          data-shape-children="true"
          className={cn("mb-1.5 ml-5 border-l border-solid pl-3", CHILD_RULE_BORDER)}
        >
          {children.map((child) => (
            <ShapeFieldGroup
              key={child.name}
              depth={depth + 1}
              field={child}
              model={model}
              path={`${path}.${child.name}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * State shape block — the S1 · STATE two-pane card: a quiet bordered card
 * (deliberately NO header bar, and never a language tag — state is always
 * JSON) holding a LinkGroup-scoped grid. Structure tree left: bold ink
 * shape name, muted `basename#symbol` source ref with the full path in the
 * title attribute, then hairline-divided field rows (plain spans — bare
 * `code`/`p` elements would inherit the global inline-code pill and
 * paragraph sizing rules). When the example prop parses as JSON, the
 * line-numbered, zebra-striped, token-toned example renders right. Field
 * rows link to the example lines their dot-path matches (array indices
 * normalized away): hover/pin paints the field's full extent in both panes.
 * Without an example the card is the single-pane tree: nothing linkable.
 */
export function StateShapeBlock({
  id,
  name,
  description,
  source,
  fields,
  example,
}: {
  id: string;
  name?: string;
  description?: string;
  source?: StateShapeSourceProps;
  fields: Field[];
  example?: string;
}) {
  const flat = useMemo(() => flattenFields(fields), [fields]);
  const model = useMemo(
    () =>
      mapExample(
        example,
        flat.map((row) => row.path),
      ),
    [example, flat],
  );

  const sourceRef = source
    ? source.symbol
      ? `${source.path}#${source.symbol}`
      : source.path
    : undefined;
  const sourceLabel = source
    ? source.symbol
      ? `${sourceBasename(source.path)}#${source.symbol}`
      : sourceBasename(source.path)
    : undefined;

  const exampleLines: LinkedCodeLine[] | undefined = model?.lines.map((line, index) => ({
    content: jsonLineTokens(line),
    linkKey: model.keysByLine[index],
  }));

  const hasHeader = Boolean(name || sourceRef || description);

  return (
    <section
      className="not-prose my-4"
      data-docs-block-type="state-shape"
      data-source-id={id}
    >
      <LinkGroup>
        <div
          className={cn(
            "overflow-hidden rounded-md border",
            "border-[color:var(--docs-shape-border,var(--border))]",
            "bg-[color:var(--docs-shape-bg,var(--background))]",
          )}
        >
          <div
            data-shape-grid="true"
            className={cn(
              "grid grid-cols-1",
              model && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]",
            )}
          >
            <div
              data-shape-tree="true"
              className={cn(
                "pb-3.5",
                !hasHeader && "pt-3.5",
                model && cn("border-b lg:border-b-0 lg:border-r", SHAPE_RULE_BORDER),
              )}
            >
              {hasHeader && (
                <div
                  data-shape-header="true"
                  className={cn(
                    "mb-1 grid gap-px border-b-2 border-solid px-5 pb-3 pt-3",
                    SHAPE_RULE_BORDER,
                    "bg-[color:var(--docs-shape-header-bg,color-mix(in_srgb,var(--muted)_35%,transparent))]",
                  )}
                >
                  {name && (
                    <div
                      data-shape-name="true"
                      className={cn("break-all font-mono text-sm font-bold", SHAPE_NAME_CLASS)}
                    >
                      {name}
                    </div>
                  )}
                  {sourceRef && (
                    <span
                      data-shape-source={sourceRef}
                      title={sourceRef}
                      className={cn("break-all font-mono text-[11px]", FIELD_TOKEN_CLASS.muted)}
                    >
                      {sourceLabel}
                    </span>
                  )}
                  {description && (
                    <div
                      data-shape-description="true"
                      className={cn(
                        "mt-0.5 max-w-[46ch] text-xs leading-[1.45]",
                        FIELD_TOKEN_CLASS.description,
                      )}
                    >
                      {description}
                    </div>
                  )}
                </div>
              )}
              {fields.length > 0 ? (
                <ProseRows className="divide-[color:var(--docs-shape-rule,var(--border))]">
                  {fields.map((field) => (
                    <ShapeFieldGroup
                      key={field.name}
                      depth={0}
                      field={field}
                      model={model}
                      path={field.name}
                    />
                  ))}
                </ProseRows>
              ) : (
                <div className={cn("px-5 py-1.5 text-xs", FIELD_TOKEN_CLASS.muted)}>
                  (no fields)
                </div>
              )}
            </div>
            {exampleLines && <CodeLines data-shape-example="true" lines={exampleLines} />}
          </div>
        </div>
      </LinkGroup>
    </section>
  );
}
