"use client";

import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from "lucide-react";
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

type CalloutTone = "info" | "decision" | "risk" | "warning" | "success";

function calloutTone(tone: string): CalloutTone {
  if (tone === "decision" || tone === "risk" || tone === "warning" || tone === "success") {
    return tone;
  }
  return "info";
}

function toneIcon(tone: CalloutTone) {
  if (tone === "warning" || tone === "risk") return AlertTriangleIcon;
  if (tone === "success") return CheckCircle2Icon;
  return InfoIcon;
}

const TONE_LABEL: Record<CalloutTone, string> = {
  info: "Info",
  decision: "Decision",
  risk: "Risk",
  warning: "Warning",
  success: "Success",
};

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
    const tone = calloutTone(data.tone);
    const Icon = toneIcon(tone);
    return (
      <aside
        className="not-prose my-4 min-w-0 w-full overflow-hidden rounded-lg border border-solid border-[color:var(--docs-callout-accent)] bg-[color:var(--docs-callout-body-bg,var(--background))]"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-callout-tone={tone}
        data-source-id={data.id}
      ><style data-variator-tokens>{"[data-docs-block-type=\"callout\"]:not(.dark [data-docs-block-type=\"callout\"]){border-radius:4px !important;}"}</style>
        <style>{`
          [data-docs-block-type="callout"] {
            --docs-callout-accent: #1683c7;
            --docs-callout-header-bg: #e8f4fb;
            --docs-callout-header-fg: #15384d;
            --docs-callout-body-bg: var(--background);
            --docs-callout-fg: #30343b;
          }
          [data-docs-block-type="callout"][data-callout-tone="decision"] {
            --docs-callout-accent: #7657a4;
            --docs-callout-header-bg: #f2eef8;
            --docs-callout-header-fg: #3f3158;
          }
          [data-docs-block-type="callout"][data-callout-tone="risk"],
          [data-docs-block-type="callout"][data-callout-tone="warning"] {
            --docs-callout-accent: #a86608;
            --docs-callout-header-bg: #fbf2df;
            --docs-callout-header-fg: #553606;
          }
          [data-docs-block-type="callout"][data-callout-tone="success"] {
            --docs-callout-accent: #287c55;
            --docs-callout-header-bg: #eaf5ef;
            --docs-callout-header-fg: #214d39;
          }
          .dark [data-docs-block-type="callout"] {
            --docs-callout-accent: #69b9e8;
            --docs-callout-header-bg: #182e3b;
            --docs-callout-header-fg: #d9f1ff;
            --docs-callout-fg: #e4e7eb;
          }
          .dark [data-docs-block-type="callout"][data-callout-tone="decision"] {
            --docs-callout-accent: #bda4df;
            --docs-callout-header-bg: #2c2538;
            --docs-callout-header-fg: #eee5fa;
          }
          .dark [data-docs-block-type="callout"][data-callout-tone="risk"],
          .dark [data-docs-block-type="callout"][data-callout-tone="warning"] {
            --docs-callout-accent: #e6b35e;
            --docs-callout-header-bg: #352b1b;
            --docs-callout-header-fg: #fae5bb;
          }
          .dark [data-docs-block-type="callout"][data-callout-tone="success"] {
            --docs-callout-accent: #7bc9a2;
            --docs-callout-header-bg: #1d3028;
            --docs-callout-header-fg: #d9f4e5;
          }
          /* A faint header edge, scoped to headers with content beneath them. */
          [data-docs-block-type="callout"] [data-callout-header]:has(+ [data-callout-body]) {
            border-bottom: 1px solid color-mix(in srgb, var(--docs-callout-accent) 18%, transparent);
          }
          /* Callout header texture trial: tapered curves from the approved component family. */
          [data-docs-block-type="callout"] [data-callout-header] {
            position: relative;
            isolation: isolate;
            overflow: hidden;
          }
          [data-docs-block-type="callout"] [data-callout-header]::before {
            content: "";
            position: absolute;
            inset: 0;
            z-index: -1;
            pointer-events: none;
            opacity: .24;
            mask-image: linear-gradient(90deg, transparent 20%, rgba(0,0,0,.15) 45%, #000 85%);
            background: repeating-radial-gradient(ellipse at 96% 55%, transparent 0 17px, color-mix(in srgb, var(--docs-callout-accent) 42%, transparent) 18px 19px, transparent 20px 30px);
          }
          [data-callout-body] {
            overflow-wrap: anywhere;
            --tw-prose-body: var(--docs-callout-fg);
            --tw-prose-headings: var(--docs-callout-fg);
            --tw-prose-lead: var(--docs-callout-fg);
            --tw-prose-links: var(--docs-callout-fg);
            --tw-prose-bold: var(--docs-callout-fg);
            --tw-prose-counters: var(--docs-callout-fg);
            --tw-prose-bullets: var(--docs-callout-fg);
            --tw-prose-quotes: var(--docs-callout-fg);
            --tw-prose-quote-borders: var(--docs-callout-accent);
            --tw-prose-code: var(--docs-callout-fg);
          }
          [data-callout-body] > :first-child { margin-top: 0; }
          [data-callout-body] > :last-child { margin-bottom: 0; }
          [data-callout-body] p, [data-callout-body] ul, [data-callout-body] ol { margin-block: .55em; }
          [data-callout-body] ul, [data-callout-body] ol { padding-inline-start: 1.5em; }
          [data-callout-body] a { color: var(--docs-callout-fg); text-decoration-line: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
          [data-callout-body] code { color: var(--docs-callout-fg); white-space: normal; overflow-wrap: anywhere; }
        `}</style>
        <div
          data-callout-header="true"
          className="flex min-w-0 items-center gap-2.5 bg-[color:var(--docs-callout-header-bg)] px-4 py-3 text-[color:var(--docs-callout-header-fg)]"
        >
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[color:var(--docs-callout-accent)]" />
          <div data-callout-title="true" className="min-w-0 break-words text-sm font-bold leading-5">
            {data.title || TONE_LABEL[tone]}
          </div>
        </div>
        {data.body && (
          <div
            data-callout-body="true"
            className="docs-markdown prose prose-sm dark:prose-invert max-w-none min-w-0 bg-[color:var(--docs-callout-body-bg,var(--background))] px-4 py-3.5 font-sans text-sm leading-6 text-[color:var(--docs-callout-fg)]"
          >
            {ctx.renderMarkdown(data.body)}
          </div>
        )}
      </aside>
    );
  }
}
