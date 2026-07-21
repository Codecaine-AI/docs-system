"use client";

import type { ReactNode } from "react";
import type { Field } from "@codecaine-ai/docs-model";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import {
  CodeLines,
  LinkGroup,
  LinkTarget,
  ProseRows,
  type LinkedCodeLine,
} from "../linked-panels";

export const INTERACTION_SURFACE_LABEL = "Interaction Surface";

export const INTERACTION_SURFACE_AGENT_DESCRIPTION =
  'The ways a state or system can be changed, queried, or observed — operation signatures on a state/system, NOT HTTP endpoints (pair it with a state-shape block holding the shape the operations act on). Rendered from typed props: { title?: string; operations: Array<{ name: string; description?: string; params?: Array<{ name: string; type?: string; required?: boolean; description?: string; fields?: Param[] }>; returns?: string; kind?: "action" | "query" | "event" }> } (params recurse via fields). Rendered as a quiet bordered card (optional bold title caption above; no header bar) with one hairline-divided row per operation. Each operation row opens with a header band: the humanized operation name left ("addOperation" reads "Add Operation"; the component namespace is stripped for display when unambiguous — full dotted names stay in state and in this markdown render) with a kind badge for query/event beside it (action is the unbadged default), and a matching "Description" header right. Left pane below: the signature as a line-numbered, zebra-striped code panel (numbering restarts at 1 per operation) — a bare-verb `name(` opening line, one indented `param?: type,` line per param (a `?` marks required: false params; a param with nested fields renders as an object literal `param?: {` … `},`), and a closing `) -> returns` line (zero-param operations stay on one line). Right pane: the operation description, then one note row per param: bold mono name, muted `· type` sub-label, the description beneath where one exists; an object param\'s nested params group behind a light left rule. Hovering or pinning a note lights the param\'s signature lines and vice versa.';

/** Operation params are shared recursive Field nodes (docs-model components/shared/field). */
export type InteractionSurfaceParam = Field;

export type InteractionSurfaceOperation = {
  /** Operation signature name, e.g. "file-tree.addEntry". */
  name: string;
  description?: string;
  params?: InteractionSurfaceParam[];
  returns?: string;
  kind?: "action" | "query" | "event";
};

/** Kind badge tints: query=sky, event=violet; action is the unbadged default. */
const KIND_BADGE_CLASS: Record<NonNullable<InteractionSurfaceOperation["kind"]>, string> = {
  action:
    "border-cyan-600/30 bg-cyan-500/10 text-cyan-700 dark:border-cyan-400/30 dark:text-cyan-300",
  query:
    "border-sky-600/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:text-sky-300",
  event:
    "border-violet-600/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/30 dark:text-violet-300",
};

/**
 * Signature token tints. Deterministic JSX spans over the grammar we control
 * (no highlight.js): the operation name carries the block's cyan identity,
 * punctuation and the optional `?` marker are muted, param names stay on the
 * foreground, and types plus the `-> returns` tail share an amber type hue —
 * matching the workbench hljs theme, where the amber `--syntax-boolean`
 * bucket is the annotation-like token color.
 */
const SIG_TOKEN_CLASS = {
  name: "font-medium text-[color:var(--docs-interaction-sig-name,#0e7490)] dark:text-[color:var(--docs-interaction-sig-name,#67e8f9)]",
  punct: "text-[color:var(--docs-interaction-sig-punct,var(--muted-foreground))]",
  optional: "text-[color:var(--docs-interaction-sig-punct,var(--muted-foreground))]",
  type: "text-[color:var(--docs-interaction-sig-type,#b45309)] dark:text-[color:var(--docs-interaction-sig-type,#fcd34d)]",
  returns: "text-[color:var(--docs-interaction-sig-type,#b45309)] dark:text-[color:var(--docs-interaction-sig-type,#fcd34d)]",
} as const;

/**
 * Internal hairlines (row dividers, column rule) — same rule token the
 * linked-panels furniture uses. Plain string literals: the workbench
 * Tailwind build scans this source for class tokens, so class names must
 * never be built dynamically.
 */
const HAIRLINE_BORDER = "border-[color:var(--docs-interaction-rule,var(--docs-code-rule,var(--border)))]";
const HAIRLINE_DIVIDE = "divide-[color:var(--docs-interaction-rule,var(--docs-code-rule,var(--border)))]";

/** Section header bands (op name / Description / Params): a quiet tinted strip so section boundaries read at a glance. */
const SECTION_HEADER_CLASSES =
  "bg-[color:var(--docs-interaction-header-bg,color-mix(in_srgb,var(--muted)_35%,transparent))] text-[color:var(--docs-interaction-header-fg,var(--foreground))]";

/** Note text tones — darker than muted-foreground so the notes column stays readable. */
const NOTE_NAME_CLASS = "text-[color:var(--docs-interaction-note-name,var(--foreground))]";
const NOTE_TYPE_CLASS =
  "text-[color:var(--docs-interaction-note-type,var(--muted-foreground))]";
const NOTE_TEXT_CLASS =
  "text-[color:var(--docs-interaction-note-fg,color-mix(in_srgb,var(--foreground)_72%,transparent))]";

function PunctToken({ text }: { text: string }) {
  return (
    <span data-sig-token="punct" className={SIG_TOKEN_CLASS.punct}>
      {text}
    </span>
  );
}

/** A param's note node, paired to its signature line span; children nest. */
type ParamNote = {
  /** LinkGroup key — the param's dot-path (operation name rooted). */
  key: string;
  name: string;
  type?: string;
  description?: string;
  /** 1-based signature line span (per-operation numbering): first… */
  start: number;
  /** …through last line — the closing `},` line for object params. */
  end: number;
  /** Nested params of an object param, in signature order. */
  children: ParamNote[];
};

/**
 * Doc-view operation title: the bare verb after the component namespace
 * ("state-shape.updateField" -> "updateField"). Falls back to full names
 * for the whole block when stripping would collide (two ops sharing a bare
 * verb) — the agent render always keeps full names either way.
 */
function bareVerb(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1);
}

/** "addOperation" -> "Add Operation"; "structured-table.updateCell" -> "Structured Table Update Cell". */
function humanizeOperationName(name: string): string {
  return name
    .replace(/[.\-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * An operation's signature as numbered CodeLines rows plus the note rows
 * for its described params.
 *
 * Grammar (unchanged): `name(` opening line, one `param?: type,` line per
 * param at two spaces per depth, object params open `name?: {`, render
 * children a level deeper, and close `},`; a final `) -> returns` line.
 * Zero-param operations collapse to one `name() -> returns` line.
 *
 * Linking: while emitting lines we record each param's 1-based line span —
 * a leaf is one line, an object param runs opening-brace line through its
 * closing `},` line. EVERY param gets a note node (name · type · chip; the
 * description only where one exists), nested under its parent. A line
 * carries its whole key CHAIN (deepest first): activating any ancestor
 * lights the full extent contiguously, while pointing at the line itself
 * activates only its deepest param.
 */
function buildOperation(
  operation: InteractionSurfaceOperation,
  displayName: string,
): {
  lines: LinkedCodeLine[];
  notes: ParamNote[];
} {
  const params = operation.params ?? [];
  const lines: LinkedCodeLine[] = [];
  const notes: ParamNote[] = [];

  const nameToken = (
    <span key="name" data-sig-token="name" className={SIG_TOKEN_CLASS.name}>
      {displayName}
    </span>
  );
  const returnsToken = operation.returns ? (
    <span key="returns" data-sig-token="returns" className={SIG_TOKEN_CLASS.returns}>
      {" "}
      {"->"} {operation.returns}
    </span>
  ) : null;

  if (params.length === 0) {
    lines.push({ content: [nameToken, <PunctToken key="()" text="()" />, returnsToken] });
    return { lines, notes };
  }

  const emitParams = (
    fields: Field[],
    depth: number,
    keyPrefix: string,
    ancestors: readonly string[],
    into: ParamNote[],
  ): void => {
    const indent = "  ".repeat(depth);
    for (const param of fields) {
      const key = `${keyPrefix}.${param.name}`;
      // Deepest first: pointing at this line activates this param; any
      // ancestor's activation still lights it (contiguous extents).
      const lineKey = [key, ...ancestors];
      const start = lines.length + 1;
      const note: ParamNote = {
        key,
        name: param.name,
        ...(param.type ? { type: param.type } : {}),
        ...(param.description ? { description: param.description } : {}),
        start,
        end: start,
        children: [],
      };
      into.push(note);

      const head: ReactNode[] = [
        indent,
        <span key={key} data-sig-token="param">
          {param.name}
        </span>,
      ];
      if (param.required === false) {
        head.push(
          <span key={`${key}?`} data-sig-token="optional" className={SIG_TOKEN_CLASS.optional}>
            ?
          </span>,
        );
      }
      if (param.fields) {
        head.push(<PunctToken key={`${key}{`} text=": {" />);
        lines.push({ content: head, linkKey: lineKey });
        emitParams(param.fields, depth + 1, key, lineKey, note.children);
        lines.push({
          content: [indent, <PunctToken key={`${key}}`} text="}," />],
          linkKey: lineKey,
        });
      } else {
        if (param.type) {
          head.push(
            <PunctToken key={`${key}:`} text=": " />,
            <span key={`${key}t`} data-sig-token="type" className={SIG_TOKEN_CLASS.type}>
              {param.type}
            </span>,
          );
        }
        head.push(<PunctToken key={`${key},`} text="," />);
        lines.push({ content: head, linkKey: lineKey });
      }
      note.end = lines.length;
    }
  };

  lines.push({ content: [nameToken, <PunctToken key="(" text="(" />] });
  emitParams(params, 1, operation.name, [], notes);
  lines.push({ content: [<PunctToken key=")" text=")" />, returnsToken] });
  return { lines, notes };
}

/** True when any operation carries a description or params — gates the notes pane. */
function hasAnyNote(operations: InteractionSurfaceOperation[]): boolean {
  return operations.some(
    (operation) => !!operation.description || (operation.params ?? []).length > 0,
  );
}

/** One param note row: bold mono name, muted `· type` sub-label, right-aligned range chip, description beneath when one exists. */
function NoteRow({ note, depth }: { note: ParamNote; depth: number }) {
  return (
    <LinkTarget
      linkKey={note.key}
      data-param-note={note.key}
      data-note-indent={depth}
      className={cn(
        "block text-xs",
        depth === 0 ? "px-4 py-[var(--docs-interaction-row-pad,8px)]" : "py-1.5 pr-4",
      )}
    >
      <div className="flex items-baseline gap-x-2">
        <span data-note-name="true" className={cn("font-mono font-semibold", NOTE_NAME_CLASS)}>
          {note.name}
          {note.type && (
            <span data-note-type="true" className={cn("font-normal", NOTE_TYPE_CLASS)}>
              {" "}
              · {note.type}
            </span>
          )}
        </span>
      </div>
      {note.description && (
        <div
          data-note-description="true"
          className="mt-0.5 max-w-[46ch] text-[11px] leading-4 text-muted-foreground"
        >
          {note.description}
        </div>
      )}
    </LinkTarget>
  );
}

/**
 * A top-level param and its nested params as one visual group: the param's
 * own row, then children contained behind a thin left rule (one step per
 * depth) instead of full-width dividers — full hairlines separate only the
 * top-level groups, so "which params belong to which object" reads at a
 * glance.
 */
function NoteGroup({ note, depth = 0 }: { note: ParamNote; depth?: number }) {
  return (
    <div data-note-group={note.key}>
      <NoteRow depth={depth} note={note} />
      {note.children.length > 0 && (
        <div
          data-note-children="true"
          className={cn(
            "mb-1.5 ml-4 border-l border-solid pl-3",
            "border-[color:var(--docs-interaction-child-rule,color-mix(in_srgb,var(--docs-code-rule,var(--border))_50%,transparent))]",
          )}
        >
          {note.children.map((child) => (
            <NoteGroup key={child.key} depth={depth + 1} note={child} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Interaction surface block, in the linked-panels family: an optional bold
 * title caption above a quiet bordered card (--docs-interaction-* tokens;
 * deliberately NO header bar) holding one hairline-divided grid row per
 * operation (mockup 1.15fr/1fr, single column below lg). Operation names
 * display as bare verbs (namespace stripped) unless stripping would
 * collide within the block.
 *
 * Left pane: the signature through CodeLines — per-operation line numbers
 * restarting at 1, zebra on even lines, the data-sig-token colorization,
 * and the query/event kind Badge floated to the pane's top-right corner
 * clear of the gutter (action stays unbadged). Right pane: the operation
 * description headline, then hairline-divided ProseRows with one NoteRow
 * per described param (recursively; children indent one step per depth).
 *
 * Linking: one LinkGroup PER OPERATION (numbering is per-op, keys would
 * collide across ops otherwise); note rows and their signature line spans
 * share the param's dot-path key, so hover/focus lights both sides and
 * click pins (Escape clears pins). Blocks with no descriptions anywhere
 * collapse to single-column signature rows.
 */
export function InteractionSurfaceBlock({
  id,
  title,
  operations,
}: {
  id: string;
  title?: string;
  operations: InteractionSurfaceOperation[];
}) {
  const withNotes = hasAnyNote(operations);
  // Bare verbs only when they stay unique within the block; the agent
  // render keeps full dotted names regardless.
  const bare = operations.map((operation) => bareVerb(operation.name));
  const useBare = new Set(bare).size === operations.length;
  return (
    <section
      className="not-prose my-4"
      data-docs-block-type="interaction-surface"
      data-source-id={id}
    >
      {title && <div className="mb-1.5 text-sm font-medium text-foreground">{title}</div>}
      {/* One card per operation, truly separated by a vertical gap. */}
      <div className="grid gap-[var(--docs-interaction-op-gap,14px)]">
        {operations.map((operation, index) => {
            const { lines, notes } = buildOperation(
              operation,
              useBare ? bare[index]! : operation.name,
            );
            const badge = operation.kind && operation.kind !== "action" && (
              <Badge
                variant="outline"
                className={cn(
                  "px-1.5 py-0 font-mono text-[10px] leading-4",
                  KIND_BADGE_CLASS[operation.kind],
                )}
              >
                {operation.kind}
              </Badge>
            );
            const heading = humanizeOperationName(useBare ? bare[index]! : operation.name);
            const headerClasses = cn(
              "flex h-9 items-center gap-x-2 border-b border-solid px-4 text-xs font-semibold",
              HAIRLINE_BORDER,
              SECTION_HEADER_CLASSES,
            );
            return (
              <LinkGroup key={operation.name}>
                <div
                  data-interaction-operation={operation.name}
                  className={cn(
                    "overflow-hidden rounded-md border",
                    "border-[color:var(--docs-interaction-border,var(--border))] bg-[color:var(--docs-interaction-bg,var(--background))]",
                    withNotes
                      ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
                      : "grid grid-cols-1",
                  )}
                >
                  <div
                    data-op-sig="true"
                    className={cn(
                      "relative flex min-w-0 flex-col",
                      withNotes && cn("lg:border-r lg:border-solid", HAIRLINE_BORDER),
                    )}
                  >
                    {/* Operation header: the humanized name above the signature. */}
                    <div data-op-header="true" className={headerClasses}>
                      <span>{heading}</span>
                      {badge}
                    </div>
                    <CodeLines className="min-h-0 flex-1" lines={lines} />
                  </div>
                  {withNotes && (
                    <div data-op-notes="true" className="content-start font-sans">
                      {/* The top band aligns with the operation header; it
                          names whichever section actually follows. */}
                      <div data-op-notes-header="true" className={headerClasses}>
                        {operation.description ? "Description" : "Params"}
                      </div>
                      {operation.description && (
                        <div
                          data-op-note="description"
                          className={cn(
                            "px-4 pb-2.5 pt-2.5 text-xs leading-5 text-foreground",
                            notes.length > 0 &&
                              cn("border-b border-solid", HAIRLINE_BORDER),
                          )}
                        >
                          <div className="max-w-[52ch]">{operation.description}</div>
                        </div>
                      )}
                      {operation.description && notes.length > 0 && (
                        <div data-op-params-header="true" className={headerClasses}>
                          Params
                        </div>
                      )}
                      {notes.length > 0 && (
                        <ProseRows data-op-params="true" className="py-0.5">
                          {notes.map((note) => (
                            <NoteGroup key={note.key} note={note} />
                          ))}
                        </ProseRows>
                      )}
                    </div>
                  )}
                </div>
              </LinkGroup>
            );
          })}
      </div>
    </section>
  );
}
