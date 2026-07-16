"use client";

import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from "lucide-react";
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
  /**
   * Optional free-form semantic kind (e.g. "Requirement", "Decision").
   * Coloring stays tone-derived; the read surface does not render kind as
   * framing. Legacy semantic cards are coerced to callouts with a kind at
   * validation.
   */
  kind?: string;
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
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            {data.title && (
              <div className="mb-1.5 text-sm font-medium text-foreground">{data.title}</div>
            )}
            {data.body && (
              <div className="docs-markdown prose prose-sm dark:prose-invert max-w-none font-sans text-sm leading-[1.7] text-[color:var(--docs-callout-fg,currentColor)]">
                {ctx.renderMarkdown(data.body)}
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }
}
