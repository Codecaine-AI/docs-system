"use client";

import { Badge } from "../../ui/badge";
import {
  DocsMdxBlock,
  type DocsMdxBlockRenderContext,
  type DocsMdxParsedBlock,
} from "../base";

type DecisionData = {
  id: string;
  /** Lifecycle status (proposed/accepted/rejected/superseded). */
  status: string;
  title?: string;
  body: string;
};

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "accepted") return "default";
  if (status === "rejected") return "destructive";
  if (status === "superseded") return "secondary";
  return "outline";
}

export class DecisionDocsBlock extends DocsMdxBlock<DecisionData> {
  readonly tag = "Decision";
  readonly type = "decision";
  readonly targetKind = "decision";
  readonly label = "Decision";
  readonly agentDescription =
    "A durable product or architecture decision with an explicit id and lifecycle status.";

  render(
    block: DocsMdxParsedBlock<DecisionData>,
    ctx: DocsMdxBlockRenderContext,
  ) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border border-primary/25 bg-primary/5 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(data.status)}>{data.status}</Badge>
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Decision
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        {data.title && (
          <h3 className="mb-2 font-display text-sm font-semibold text-foreground">
            {data.title}
          </h3>
        )}
        {data.body && (
          <div className="spectre-markdown prose prose-sm dark:prose-invert max-w-none font-sans text-sm leading-[1.7]">
            {ctx.renderMarkdown(data.body)}
          </div>
        )}
      </section>
    );
  }
}
