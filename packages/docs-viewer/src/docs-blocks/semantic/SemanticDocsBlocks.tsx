"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CircleHelpIcon,
  FlagIcon,
  GaugeIcon,
  LightbulbIcon,
} from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import { attr } from "../attrs";
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
  primaryAttr: string;
  primaryLabel: string;
  defaultPrimary: string;
  allowedPrimary?: readonly string[];
  metaAttrs?: Array<{
    attr: string;
    label: string;
  }>;
};

class ConfiguredSemanticDocsBlock extends DocsMdxBlock<SemanticBlockData> {
  readonly tag: string;
  readonly type: string;
  readonly targetKind: string;
  readonly label: string;
  readonly agentDescription: string;
  override readonly patchOps = [
    "update-mdx-block-props",
    "update-mdx-block-body",
    "replace-mdx-block",
  ] as const;

  constructor(private readonly config: SemanticBlockConfig) {
    super();
    this.tag = config.tag;
    this.type = config.type;
    this.targetKind = config.targetKind;
    this.label = config.label;
    this.agentDescription = config.agentDescription;
  }

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<SemanticBlockData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;

    const rawPrimary =
      attr(attrs, this.config.primaryAttr) ?? this.config.defaultPrimary;
    const primary =
      this.config.allowedPrimary &&
      !this.config.allowedPrimary.includes(rawPrimary)
        ? this.config.defaultPrimary
        : rawPrimary;
    const meta =
      this.config.metaAttrs
        ?.map((item) => ({
          label: item.label,
          value: attr(attrs, item.attr),
        }))
        .filter((item): item is { label: string; value: string } => !!item.value) ??
      [];

    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        body: body.trim(),
        primary: {
          label: this.config.primaryLabel,
          value: primary,
        },
        meta,
      },
    };
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

const SEMANTIC_BLOCK_CONFIGS: SemanticBlockConfig[] = [
  {
    tag: "Constraint",
    type: "constraint",
    targetKind: "constraint",
    label: "Constraint",
    agentDescription:
      "A hard or soft rule that limits implementation, product behavior, safety, or architecture decisions.",
    icon: AlertCircleIcon,
    className: "border-primary/30 bg-primary/5",
    primaryAttr: "severity",
    primaryLabel: "Severity",
    defaultPrimary: "hard",
    allowedPrimary: ["hard", "soft", "policy"],
    metaAttrs: [{ attr: "owner", label: "Owner" }],
  },
  {
    tag: "Assumption",
    type: "assumption",
    targetKind: "assumption",
    label: "Assumption",
    agentDescription:
      "An explicit belief the docs rely on, with optional confidence and owner metadata.",
    icon: LightbulbIcon,
    className: "border-primary/30 bg-primary/5",
    primaryAttr: "confidence",
    primaryLabel: "Confidence",
    defaultPrimary: "medium",
    allowedPrimary: ["low", "medium", "high"],
    metaAttrs: [{ attr: "owner", label: "Owner" }],
  },
  {
    tag: "Risk",
    type: "risk",
    targetKind: "risk",
    label: "Risk",
    agentDescription:
      "A risk or failure mode worth preserving as structured review context.",
    icon: AlertTriangleIcon,
    className: "border-primary/30 bg-primary/5",
    primaryAttr: "severity",
    primaryLabel: "Severity",
    defaultPrimary: "medium",
    allowedPrimary: ["low", "medium", "high", "critical"],
    metaAttrs: [
      { attr: "owner", label: "Owner" },
      { attr: "mitigation", label: "Mitigation" },
    ],
  },
  {
    tag: "OpenQuestion",
    type: "open-question",
    targetKind: "open-question",
    label: "Open Question",
    agentDescription:
      "A structured open question that should remain visible to reviewers and agents.",
    icon: CircleHelpIcon,
    className: "border-primary/30 bg-primary/5",
    primaryAttr: "status",
    primaryLabel: "Status",
    defaultPrimary: "open",
    allowedPrimary: ["open", "answered", "deferred"],
    metaAttrs: [{ attr: "owner", label: "Owner" }],
  },
  {
    tag: "Status",
    type: "status",
    targetKind: "status",
    label: "Status",
    agentDescription:
      "A compact state marker for docs, systems, features, migrations, or decisions.",
    icon: GaugeIcon,
    className: "border-primary/30 bg-primary/5",
    primaryAttr: "state",
    primaryLabel: "State",
    defaultPrimary: "in-progress",
    allowedPrimary: ["planned", "in-progress", "done", "blocked", "deprecated"],
    metaAttrs: [{ attr: "updated", label: "Updated" }],
  },
  {
    tag: "Milestone",
    type: "milestone",
    targetKind: "milestone",
    label: "Milestone",
    agentDescription:
      "A named checkpoint with a state, due/date metadata, and body details.",
    icon: FlagIcon,
    className: "border-primary/30 bg-primary/5",
    primaryAttr: "state",
    primaryLabel: "State",
    defaultPrimary: "planned",
    allowedPrimary: ["planned", "in-progress", "done", "missed"],
    metaAttrs: [
      { attr: "date", label: "Date" },
      { attr: "due", label: "Due" },
    ],
  },
];

export const semanticDocsBlocks = SEMANTIC_BLOCK_CONFIGS.map(
  (config) => new ConfiguredSemanticDocsBlock(config),
);
