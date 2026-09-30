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

/*
 * Class strings — one set for both surfaces (the editor's callout node view
 * delegates to this same renderer). Every value follows a callout token, and
 * each fallback equals the literal utility it replaced (`my-4`, `border`,
 * `px-4 py-3`, `h-4 w-4`, `text-sm font-bold leading-5`, `py-3.5`), so a host
 * with no theme layer renders unchanged.
 *
 * - Frame border color: `--docs-callout-border` when a theme sets it, else
 *   the tone accent — the token is deliberately undeclared by default.
 * - Radius: light renders 4px (the variator token rule below) and dark
 *   `rounded-lg` (0.5rem); both now read `--docs-callout-radius` first.
 * - Title line height is the unitless 20/14 the old `text-sm leading-5` pair
 *   worked out to, so it scales with the title size knob instead of
 *   overlapping a wrapped title.
 * - Body text scale multiplies the base size: 0.875rem here, and the rail's
 *   reading size on a themed host, whose unlayered `.docs-markdown.prose`
 *   rule owns the body size there (see docs-workbench index.css).
 *
 * TONE PALETTE (the inline stylesheet in `render`). The style-rail color
 * tokens — `--docs-callout-<tone>-accent|header-bg|header-fg` and
 * `--docs-callout-fg` — are declared on the document root by the host's
 * theme layer, so the stylesheet READS them and never declares them: a
 * declaration on the callout element itself shadows the root value, which is
 * what left every callout color knob dead. The per-element results live in
 * four private vars (`--docs-callout-accent`, `-header-bg`, `-header-fg`,
 * `-text`); their literal fallbacks are the approved palette, for hosts with
 * no theme layer. `--docs-callout-body-bg` is likewise only read, with the
 * page background as its fallback.
 */
const CALLOUT_FRAME_CLASSES =
  "not-prose my-[var(--docs-callout-margin,16px)] min-w-0 w-full overflow-hidden rounded-[var(--docs-callout-radius,0.5rem)] border-[length:var(--docs-callout-border-width,1px)] border-solid border-[color:var(--docs-callout-border,var(--docs-callout-accent))] bg-[color:var(--docs-callout-body-bg,var(--background))]";
const CALLOUT_HEADER_CLASSES =
  "flex min-w-0 items-center gap-2.5 bg-[color:var(--docs-callout-header-bg)] px-[var(--docs-callout-pad-x,16px)] py-[var(--docs-callout-header-pad-y,12px)] text-[color:var(--docs-callout-header-fg)]";
const CALLOUT_ICON_CLASSES =
  "h-[var(--docs-callout-icon-size,16px)] w-[var(--docs-callout-icon-size,16px)] shrink-0 text-[color:var(--docs-callout-accent)]";
const CALLOUT_TITLE_CLASSES =
  "min-w-0 break-words text-[length:var(--docs-callout-title-text-size,14px)] [font-weight:var(--docs-callout-title-weight,700)] leading-[calc(20/14)]";
const CALLOUT_BODY_CLASSES =
  "docs-markdown prose prose-sm dark:prose-invert max-w-none min-w-0 bg-[color:var(--docs-callout-body-bg,var(--background))] px-[var(--docs-callout-pad-x,16px)] py-[var(--docs-callout-body-pad-y,14px)] font-sans text-[length:calc(0.875rem*var(--docs-callout-body-text-scale,1))] leading-6 text-[color:var(--docs-callout-text)]";

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
        className={CALLOUT_FRAME_CLASSES}
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-callout-tone={tone}
        data-source-id={data.id}
      ><style data-variator-tokens>{"[data-docs-block-type=\"callout\"]:not(.dark [data-docs-block-type=\"callout\"]){border-radius:var(--docs-callout-radius,4px) !important;}"}</style>
        <style>{`
          [data-docs-block-type="callout"] {
            --docs-callout-accent: var(--docs-callout-info-accent, #1683c7);
            --docs-callout-header-bg: var(--docs-callout-info-header-bg, #e8f4fb);
            --docs-callout-header-fg: var(--docs-callout-info-header-fg, #15384d);
            --docs-callout-text: var(--docs-callout-fg, #30343b);
          }
          [data-docs-block-type="callout"][data-callout-tone="decision"] {
            --docs-callout-accent: var(--docs-callout-decision-accent, #7657a4);
            --docs-callout-header-bg: var(--docs-callout-decision-header-bg, #f2eef8);
            --docs-callout-header-fg: var(--docs-callout-decision-header-fg, #3f3158);
          }
          [data-docs-block-type="callout"][data-callout-tone="risk"],
          [data-docs-block-type="callout"][data-callout-tone="warning"] {
            --docs-callout-accent: var(--docs-callout-warning-accent, #a86608);
            --docs-callout-header-bg: var(--docs-callout-warning-header-bg, #fbf2df);
            --docs-callout-header-fg: var(--docs-callout-warning-header-fg, #553606);
          }
          [data-docs-block-type="callout"][data-callout-tone="success"] {
            --docs-callout-accent: var(--docs-callout-success-accent, #287c55);
            --docs-callout-header-bg: var(--docs-callout-success-header-bg, #eaf5ef);
            --docs-callout-header-fg: var(--docs-callout-success-header-fg, #214d39);
          }
          .dark [data-docs-block-type="callout"] {
            --docs-callout-accent: var(--docs-callout-info-accent, #69b9e8);
            --docs-callout-header-bg: var(--docs-callout-info-header-bg, #182e3b);
            --docs-callout-header-fg: var(--docs-callout-info-header-fg, #d9f1ff);
            --docs-callout-text: var(--docs-callout-fg, #e4e7eb);
          }
          .dark [data-docs-block-type="callout"][data-callout-tone="decision"] {
            --docs-callout-accent: var(--docs-callout-decision-accent, #bda4df);
            --docs-callout-header-bg: var(--docs-callout-decision-header-bg, #2c2538);
            --docs-callout-header-fg: var(--docs-callout-decision-header-fg, #eee5fa);
          }
          .dark [data-docs-block-type="callout"][data-callout-tone="risk"],
          .dark [data-docs-block-type="callout"][data-callout-tone="warning"] {
            --docs-callout-accent: var(--docs-callout-warning-accent, #e6b35e);
            --docs-callout-header-bg: var(--docs-callout-warning-header-bg, #352b1b);
            --docs-callout-header-fg: var(--docs-callout-warning-header-fg, #fae5bb);
          }
          .dark [data-docs-block-type="callout"][data-callout-tone="success"] {
            --docs-callout-accent: var(--docs-callout-success-accent, #7bc9a2);
            --docs-callout-header-bg: var(--docs-callout-success-header-bg, #1d3028);
            --docs-callout-header-fg: var(--docs-callout-success-header-fg, #d9f4e5);
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
            --tw-prose-body: var(--docs-callout-text);
            --tw-prose-headings: var(--docs-callout-text);
            --tw-prose-lead: var(--docs-callout-text);
            --tw-prose-links: var(--docs-callout-text);
            --tw-prose-bold: var(--docs-callout-text);
            --tw-prose-counters: var(--docs-callout-text);
            --tw-prose-bullets: var(--docs-callout-text);
            --tw-prose-quotes: var(--docs-callout-text);
            --tw-prose-quote-borders: var(--docs-callout-accent);
            --tw-prose-code: var(--docs-callout-text);
          }
          [data-callout-body] > :first-child { margin-top: 0; }
          [data-callout-body] > :last-child { margin-bottom: 0; }
          [data-callout-body] p, [data-callout-body] ul, [data-callout-body] ol { margin-block: .55em; }
          [data-callout-body] ul, [data-callout-body] ol { padding-inline-start: 1.5em; }
          [data-callout-body] a { color: var(--docs-callout-text); text-decoration-line: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
          [data-callout-body] code { color: var(--docs-callout-text); white-space: normal; overflow-wrap: anywhere; }
        `}</style>
        <div
          data-callout-header="true"
          className={CALLOUT_HEADER_CLASSES}
        >
          <Icon aria-hidden="true" className={CALLOUT_ICON_CLASSES} />
          <div data-callout-title="true" className={CALLOUT_TITLE_CLASSES}>
            {data.title || TONE_LABEL[tone]}
          </div>
        </div>
        {data.body && (
          <div
            data-callout-body="true"
            className={CALLOUT_BODY_CLASSES}
          >
            {ctx.renderMarkdown(data.body)}
          </div>
        )}
      </aside>
    );
  }
}
