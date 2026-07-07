"use client";

import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import {
  CARD_BASE_CLASSES,
  CARD_TONE_DECISION_CLASSES,
  CARD_TONE_PRIMARY_CLASSES,
} from "../../render/block-classes";
import {
  DocsMdxBlock,
  type DocsMdxBlockRenderContext,
  type DocsMdxParsedBlock,
} from "../base";

type CalloutData = {
  id?: string;
  /** Tone (info/decision/risk/warning/success); unknown tones render as info. */
  tone: string;
  title?: string;
  body: string;
};

function toneIcon(tone: string) {
  if (tone === "warning" || tone === "risk") return AlertTriangleIcon;
  if (tone === "success") return CheckCircle2Icon;
  return InfoIcon;
}

function toneClass(tone: string): string {
  if (tone === "warning" || tone === "risk") {
    return CARD_TONE_PRIMARY_CLASSES;
  }
  if (tone === "success") return CARD_TONE_PRIMARY_CLASSES;
  if (tone === "decision") return CARD_TONE_DECISION_CLASSES;
  return CARD_TONE_PRIMARY_CLASSES;
}

export class CalloutDocsBlock extends DocsMdxBlock<CalloutData> {
  readonly tag = "Callout";
  readonly type = "callout";
  readonly targetKind = "callout";
  readonly label = "Callout";
  readonly agentDescription =
    "A highlighted note, risk, warning, success, or decision-adjacent context block.";

  render(
    block: DocsMdxParsedBlock<CalloutData>,
    ctx: DocsMdxBlockRenderContext,
  ) {
    const { data } = block;
    const Icon = toneIcon(data.tone);
    return (
      <aside
        className={cn(CARD_BASE_CLASSES, toneClass(data.tone))}
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
          <div className="spectre-markdown prose prose-sm dark:prose-invert max-w-none font-sans text-sm leading-[1.7]">
            {ctx.renderMarkdown(data.body)}
          </div>
        )}
      </aside>
    );
  }
}
