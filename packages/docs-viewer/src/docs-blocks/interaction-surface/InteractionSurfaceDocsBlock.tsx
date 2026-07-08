"use client";

import { Fragment } from "react";
import { WaypointsIcon } from "lucide-react";
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
 * Interaction surface block. Structured props (no body parsing): cyan
 * identity with a WaypointsIcon header strip and one row per operation — a
 * mono signature `name(params) -> returns` with muted param types, an
 * optional tinted kind badge, and the description as a muted second line.
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
      className="not-prose my-4 overflow-hidden rounded-md border bg-muted/20"
      data-docs-block-type="interaction-surface"
      data-source-id={id}
    >
      <div className="flex flex-wrap items-center gap-2 border-b bg-cyan-500/10 px-3 py-2">
        <WaypointsIcon className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
        <span className="font-display text-xs font-medium uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
          Interaction Surface
        </span>
        {title && <span className="text-sm font-medium">{title}</span>}
        <Badge variant="outline">
          {operations.length} operation{operations.length === 1 ? "" : "s"}
        </Badge>
        <span className="font-mono text-[11px] text-muted-foreground">{id}</span>
      </div>
      <div className="p-3">
        <div className="divide-y rounded-md border bg-background">
          {operations.map((operation) => (
            <div
              key={operation.name}
              className="grid gap-1 px-3 py-2 text-xs"
              data-interaction-operation={operation.name}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <code className="break-all font-mono text-foreground">
                  <span className="font-medium">{operation.name}</span>
                  <span className="text-muted-foreground">(</span>
                  {(operation.params ?? []).map((param, index) => (
                    <Fragment key={param.name}>
                      {index > 0 && <span className="text-muted-foreground">, </span>}
                      <span title={param.description}>
                        {param.name}
                        {param.required === false && "?"}
                      </span>
                      {param.type && (
                        <span className="text-muted-foreground">: {param.type}</span>
                      )}
                    </Fragment>
                  ))}
                  <span className="text-muted-foreground">)</span>
                  {operation.returns && (
                    <span className="text-muted-foreground"> {"->"} {operation.returns}</span>
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
      </div>
    </section>
  );
}
