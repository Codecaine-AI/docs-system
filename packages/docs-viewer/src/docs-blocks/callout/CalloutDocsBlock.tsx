"use client";

import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import {
  DocsMdxBlock,
  type DocsMdxBlockRenderContext,
  type DocsMdxParsedBlock,
} from "../base";

const CALLOUT_TONES = ["info", "decision", "risk", "warning", "success"] as const;

type CalloutTone = (typeof CALLOUT_TONES)[number];

type CalloutData = {
  id?: string;
  tone: CalloutTone;
  title?: string;
  body: string;
};

function isCalloutTone(value: string | undefined): value is CalloutTone {
  return CALLOUT_TONES.includes(value as CalloutTone);
}

function toneIcon(tone: CalloutTone) {
  if (tone === "warning" || tone === "risk") return AlertTriangleIcon;
  if (tone === "success") return CheckCircle2Icon;
  return InfoIcon;
}

function toneClass(tone: CalloutTone): string {
  if (tone === "warning" || tone === "risk") {
    return "border-primary/30 bg-primary/5";
  }
  if (tone === "success") return "border-primary/30 bg-primary/5";
  if (tone === "decision") return "border-primary/25 bg-primary/5";
  return "border-primary/30 bg-primary/5";
}

export class CalloutDocsBlock extends DocsMdxBlock<CalloutData> {
  readonly tag = "Callout";
  readonly type = "callout";
  readonly targetKind = "callout";
  readonly label = "Callout";
  readonly agentDescription =
    "A highlighted note, risk, warning, success, or decision-adjacent context block.";
  override readonly patchOps = [
    "update-mdx-block-props",
    "update-mdx-block-body",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<CalloutData> | null {
    const rawTone = attrs.tone?.trim();
    const tone = isCalloutTone(rawTone) ? rawTone : "info";
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: this.sourceId(attrs),
      data: {
        id: attrs.id?.trim() || undefined,
        tone,
        title: attrs.title?.trim() || undefined,
        body: body.trim(),
      },
    };
  }

  render(
    block: DocsMdxParsedBlock<CalloutData>,
    ctx: DocsMdxBlockRenderContext,
  ) {
    const { data } = block;
    const Icon = toneIcon(data.tone);
    return (
      <aside
        className={cn("not-prose my-4 rounded-md border p-3", toneClass(data.tone))}
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline">{data.tone}</Badge>
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Callout
          </span>
          {data.id && (
            <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
          )}
        </div>
        {data.title && (
          <h3 className="mb-2 font-display text-sm font-semibold text-foreground">
            {data.title}
          </h3>
        )}
        {data.body && (
          <div className="docs-markdown prose prose-sm dark:prose-invert max-w-none font-sans text-sm leading-[1.7]">
            {ctx.renderMarkdown(data.body)}
          </div>
        )}
      </aside>
    );
  }
}
