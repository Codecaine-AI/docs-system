"use client";

import type { LucideIcon } from "lucide-react";
import { AlertCircleIcon, LightbulbIcon } from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import {
  DocsMdxBlock,
  type DocsMdxBlockRenderContext,
  type DocsMdxParsedBlock,
} from "../base";

type SemanticBlockData = {
  id: string;
  title?: string;
  body: string;
  primary: {
    label: string;
    value: string;
  };
  meta: Array<{
    label: string;
    value: string;
  }>;
};

type SemanticBlockConfig = {
  tag: string;
  type: string;
  targetKind: string;
  label: string;
  agentDescription: string;
  icon: LucideIcon;
  className: string;
};

/**
 * Shared labeled-card chrome for the semantic flavours (constraint,
 * assumption). The flavour registry builds `data.primary`/`data.meta` from
 * doc.json props (severity/confidence + owner) before delegating here.
 */
class ConfiguredSemanticDocsBlock extends DocsMdxBlock<SemanticBlockData> {
  readonly tag: string;
  readonly type: string;
  readonly targetKind: string;
  readonly label: string;
  readonly agentDescription: string;

  constructor(private readonly config: SemanticBlockConfig) {
    super();
    this.tag = config.tag;
    this.type = config.type;
    this.targetKind = config.targetKind;
    this.label = config.label;
    this.agentDescription = config.agentDescription;
  }

  render(
    block: DocsMdxParsedBlock<SemanticBlockData>,
    ctx: DocsMdxBlockRenderContext,
  ) {
    const { data } = block;
    const Icon = this.config.icon;
    return (
      <section
        className={cn("not-prose my-4 rounded-md border p-3", this.config.className)}
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline">{data.primary.value}</Badge>
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {this.label}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {data.id}
          </span>
        </div>
        {data.title && (
          <h3 className="mb-2 font-display text-sm font-semibold text-foreground">
            {data.title}
          </h3>
        )}
        {data.meta.length > 0 && (
          <dl className="mb-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            {data.meta.map((item) => (
              <div key={item.label} className="rounded border bg-background/60 p-2">
                <dt className="font-display text-[10px] uppercase tracking-wider">
                  {item.label}
                </dt>
                <dd className="mt-1 font-mono">{item.value}</dd>
              </div>
            ))}
          </dl>
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

export const constraintDocsBlock = new ConfiguredSemanticDocsBlock({
  tag: "Constraint",
  type: "constraint",
  targetKind: "constraint",
  label: "Constraint",
  agentDescription:
    "A hard or soft rule that limits implementation, product behavior, safety, or architecture decisions.",
  icon: AlertCircleIcon,
  className: "border-primary/30 bg-primary/5",
});

export const assumptionDocsBlock = new ConfiguredSemanticDocsBlock({
  tag: "Assumption",
  type: "assumption",
  targetKind: "assumption",
  label: "Assumption",
  agentDescription:
    "An explicit belief the docs rely on, with optional confidence and owner metadata.",
  icon: LightbulbIcon,
  className: "border-primary/30 bg-primary/5",
});
