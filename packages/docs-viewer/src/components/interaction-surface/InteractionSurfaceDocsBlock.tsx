"use client";

import { Fragment } from "react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";

export const INTERACTION_SURFACE_LABEL = "Interaction Surface";

export const INTERACTION_SURFACE_AGENT_DESCRIPTION =
  'The ways a state or system can be changed, queried, or observed — operation signatures on a state/system, NOT HTTP endpoints (pair it with an annotated JSON code block holding the state the operations act on). Rendered from typed props: { title?: string; operations: Array<{ name: string; description?: string; params?: Array<{ name: string; type?: string; required?: boolean; description?: string }>; returns?: string; kind?: "action" | "query" | "event" }> }. Each operation renders as a mono signature `name(param: type, optional?: type) -> returns` (a `?` marks required: false params), an optional kind badge (action is the default reading for unbadged rows), and a muted description line.';

export type InteractionSurfaceParam = {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
};

export type InteractionSurfaceOperation = {
  /** Operation signature name, e.g. "file-tree.addEntry". */
  name: string;
  description?: string;
  params?: InteractionSurfaceParam[];
  returns?: string;
  kind?: "action" | "query" | "event";
};

/** Kind badge tints: action=cyan (the block's identity hue), query=sky, event=violet. */
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
  name: "font-medium text-cyan-700 dark:text-cyan-300",
  punct: "text-muted-foreground",
  optional: "text-muted-foreground",
  type: "text-amber-700 dark:text-amber-300",
  returns: "text-amber-700 dark:text-amber-300",
} as const;

/**
 * Interaction surface block. Structured props (no body parsing): cyan
 * identity with one row per operation — a mono signature
 * `name(params) -> returns` colorized token-by-token (cyan name, muted
 * punctuation, amber types), an optional tinted kind badge, and the
 * description as a muted second line.
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
  return (
    <section
      className="not-prose my-4"
      data-docs-block-type="interaction-surface"
      data-source-id={id}
    >
      {title && <div className="mb-1.5 text-sm font-medium text-foreground">{title}</div>}
      <div className="divide-y rounded-md border border-[color:var(--docs-interaction-border,var(--border))] bg-[color:var(--docs-interaction-bg,var(--background))]">
        {operations.map((operation) => (
          <div
            key={operation.name}
            className="grid gap-1 px-3 py-2 text-xs"
            data-interaction-operation={operation.name}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <code className="break-all font-mono text-foreground">
                <span data-sig-token="name" className={SIG_TOKEN_CLASS.name}>
                  {operation.name}
                </span>
                <span data-sig-token="punct" className={SIG_TOKEN_CLASS.punct}>(</span>
                {(operation.params ?? []).map((param, index) => (
                  <Fragment key={param.name}>
                    {index > 0 && (
                      <span data-sig-token="punct" className={SIG_TOKEN_CLASS.punct}>, </span>
                    )}
                    <span title={param.description}>
                      <span data-sig-token="param">{param.name}</span>
                      {param.required === false && (
                        <span data-sig-token="optional" className={SIG_TOKEN_CLASS.optional}>
                          ?
                        </span>
                      )}
                    </span>
                    {param.type && (
                      <>
                        <span data-sig-token="punct" className={SIG_TOKEN_CLASS.punct}>: </span>
                        <span data-sig-token="type" className={SIG_TOKEN_CLASS.type}>
                          {param.type}
                        </span>
                      </>
                    )}
                  </Fragment>
                ))}
                <span data-sig-token="punct" className={SIG_TOKEN_CLASS.punct}>)</span>
                {operation.returns && (
                  <span data-sig-token="returns" className={SIG_TOKEN_CLASS.returns}>
                    {" "}
                    {"->"} {operation.returns}
                  </span>
                )}
              </code>
              {operation.kind && (
                <Badge
                  variant="outline"
                  className={cn("font-mono", KIND_BADGE_CLASS[operation.kind])}
                >
                  {operation.kind}
                </Badge>
              )}
            </div>
            {operation.description && (
              <div className="text-muted-foreground">{operation.description}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
