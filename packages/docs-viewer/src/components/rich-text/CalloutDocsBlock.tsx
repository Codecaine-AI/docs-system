"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  GitBranchIcon,
  InfoIcon,
  OctagonAlertIcon,
} from "lucide-react";
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
   * Retired visual style (eyebrow/hairline/rail/tab). Still read and stamped
   * as `data-callout-variant` so existing docs round-trip, but every variant
   * renders the one rail note.
   */
  variant?: string;
  /**
   * Optional free-form semantic kind (e.g. "Requirement", "Decision").
   * Coloring stays tone-derived; the kind replaces the tone name as the
   * card's printed label. Legacy semantic cards are coerced to callouts with
   * a kind at validation.
   */
  kind?: string;
  title?: string;
  body: string;
};

type CalloutTone = "info" | "decision" | "risk" | "warning" | "success";
export type CalloutVariant = "eyebrow" | "hairline" | "rail" | "tab";

function calloutTone(tone: string): CalloutTone {
  if (tone === "decision" || tone === "risk" || tone === "warning" || tone === "success") {
    return tone;
  }
  return "info";
}

export function calloutVariant(variant: string | undefined): CalloutVariant {
  if (variant === "hairline" || variant === "rail" || variant === "tab") return variant;
  return "eyebrow";
}

const TONE_ICON = {
  info: InfoIcon,
  decision: GitBranchIcon,
  risk: OctagonAlertIcon,
  warning: AlertTriangleIcon,
  success: CheckCircle2Icon,
} as const;

const TONE_LABEL: Record<CalloutTone, string> = {
  info: "Info",
  decision: "Decision",
  risk: "Risk",
  warning: "Warning",
  success: "Success",
};

/**
 * The printed label in sentence case: an all-caps kind ("OPEN QUESTION")
 * is lowered first; otherwise only the first letter is raised, so acronyms
 * inside a kind ("API change") survive.
 */
export function calloutLabel(kind: string | undefined, tone: string): string {
  const raw = kind?.trim();
  if (!raw) return TONE_LABEL[calloutTone(tone)];
  const base = /[a-z]/.test(raw) ? raw : raw.toLowerCase();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/*
 * One renderer for both surfaces (the editor's callout node view delegates
 * here) and ONE rail note for every tone: no box and no fill, a 3px left
 * rail in the tone color. The first line is the tone glyph and the printed
 * label in the tone color at body size, weight 600, then (when titled) a
 * "·" separator and the title in ink at the same size and weight; the body
 * sits below in body text. The tone color marks only the rail, the glyph
 * and the label, so each note has one focal point. The frame knobs still
 * work: a tone tint fills the note and a hairline width draws a frame.
 *
 * DOM: <aside data-callout-tone data-callout-variant data-callout-titled>
 * holding a head row (icon, label — `kind` when set, else the tone name,
 * printed in sentence case, never tooltip-only — and the optional title)
 * and the body. `variant` is stamped but no longer changes the layout.
 *
 * Class strings carry the knobs (margin, icon size, label/title size,
 * title weight, body scale); the frame geometry (rule and hairline widths,
 * padding, radius) and the palette live in the stylesheet. Every read has a
 * literal fallback equal to the LIGHT theme default, so a host with no theme
 * layer renders the approved look.
 *
 * TONE PALETTE. The style-rail color tokens —
 * `--docs-callout-<tone>-accent|tint|title-fg`, `--docs-callout-fg` and
 * `--docs-callout-border` — are declared on the document root by the host's
 * theme layer (defaulting to the shared tone roles), so the stylesheet READS
 * them and never declares them: a declaration on the callout element itself
 * would shadow the root value and leave the knob dead. The per-element
 * results live in private vars (`--docs-callout-accent`, `-tint`,
 * `-title-ink`, `-text`, `-frame`). Risk has its own red accent; it no
 * longer borrows warning's.
 */
const CALLOUT_FRAME_CLASSES =
  "not-prose my-[var(--docs-callout-margin,20px)] min-w-0 w-full box-border";
const CALLOUT_HEAD_CLASSES =
  "flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--docs-callout-title-text-size,18px)] leading-[1.4]";
const CALLOUT_ICON_WRAP_CLASSES =
  "inline-flex shrink-0 items-center text-[color:var(--docs-callout-accent)]";
const CALLOUT_ICON_CLASSES =
  "block h-[var(--docs-callout-icon-size,16px)] w-[var(--docs-callout-icon-size,16px)]";
const CALLOUT_LABEL_CLASSES =
  "font-sans font-semibold text-[color:var(--docs-callout-accent)]";
const CALLOUT_TITLE_CLASSES =
  "min-w-0 break-words font-sans [font-weight:var(--docs-callout-title-weight,600)] text-[color:var(--docs-callout-title-ink)]";
const CALLOUT_BODY_CLASSES =
  "docs-markdown prose prose-sm dark:prose-invert max-w-none min-w-0 font-sans text-[length:calc(1rem*var(--docs-callout-body-text-scale,1))] leading-[1.6] text-[color:var(--docs-callout-text)]";

const CALLOUT_STYLES = `
  [data-docs-block-type="callout"] {
    --docs-callout-accent: var(--docs-callout-info-accent, #0b6e99);
    --docs-callout-tint: var(--docs-callout-info-tint, transparent);
    --docs-callout-title-ink: var(--docs-callout-info-title-fg, #1f1f1f);
    --docs-callout-text: var(--docs-callout-fg, #2a2a2a);
    --docs-callout-frame: var(--docs-callout-border, #e6e5e3);
  }
  [data-docs-block-type="callout"][data-callout-tone="decision"] {
    --docs-callout-accent: var(--docs-callout-decision-accent, #6940a5);
    --docs-callout-tint: var(--docs-callout-decision-tint, transparent);
    --docs-callout-title-ink: var(--docs-callout-decision-title-fg, #1f1f1f);
  }
  [data-docs-block-type="callout"][data-callout-tone="warning"] {
    --docs-callout-accent: var(--docs-callout-warning-accent, #9a5b00);
    --docs-callout-tint: var(--docs-callout-warning-tint, transparent);
    --docs-callout-title-ink: var(--docs-callout-warning-title-fg, #1f1f1f);
  }
  [data-docs-block-type="callout"][data-callout-tone="risk"] {
    --docs-callout-accent: var(--docs-callout-risk-accent, #c62121);
    --docs-callout-tint: var(--docs-callout-risk-tint, transparent);
    --docs-callout-title-ink: var(--docs-callout-risk-title-fg, #1f1f1f);
  }
  [data-docs-block-type="callout"][data-callout-tone="success"] {
    --docs-callout-accent: var(--docs-callout-success-accent, #26744f);
    --docs-callout-tint: var(--docs-callout-success-tint, transparent);
    --docs-callout-title-ink: var(--docs-callout-success-title-fg, #1f1f1f);
  }

  /* The one rail note: tone rail on the left; no fill or frame at stock
     (the tint is transparent and the hairline 0px until a theme sets them). */
  [data-docs-block-type="callout"] {
    padding: var(--docs-callout-pad-y,2px) var(--docs-callout-pad-x,14px);
    padding-left: calc(var(--docs-callout-pad-x,14px) - var(--docs-callout-rail-width,3px) + var(--docs-callout-hairline-width,0px));
    background: var(--docs-callout-tint);
    border: var(--docs-callout-hairline-width,0px) solid var(--docs-callout-frame);
    border-left: var(--docs-callout-rail-width,3px) solid var(--docs-callout-accent);
    border-radius: var(--docs-callout-radius,var(--radius,2px));
  }
  [data-callout-head] { margin-bottom: 2px; }
  [data-callout-titled="true"] [data-callout-title]::before {
    content: "·";
    margin-right: 8px;
    font-weight: 400;
    color: var(--docs-muted, #666562);
  }

  [data-callout-body] {
    overflow-wrap: anywhere;
    --tw-prose-body: var(--docs-callout-text);
    --tw-prose-headings: var(--docs-callout-title-ink);
    --tw-prose-lead: var(--docs-callout-text);
    --tw-prose-links: var(--docs-link, #245a81);
    --tw-prose-bold: var(--docs-callout-title-ink);
    --tw-prose-counters: var(--docs-muted, #666562);
    --tw-prose-bullets: var(--docs-muted, #666562);
    --tw-prose-quotes: var(--docs-callout-text);
    --tw-prose-quote-borders: var(--docs-rule, #e6e5e3);
  }
  [data-callout-body] > :first-child { margin-top: 0; }
  [data-callout-body] > :last-child { margin-bottom: 0; }
  [data-callout-body] p, [data-callout-body] ul, [data-callout-body] ol { margin-block: .5em; }
  [data-callout-body] ul, [data-callout-body] ol { padding-inline-start: 1.5em; }
  [data-callout-body] strong { font-weight: 600; }
  [data-callout-body] a { color: var(--docs-link, #245a81); font-weight: inherit; text-decoration-line: underline; text-decoration-thickness: 1px; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 2px; }
  [data-callout-body] a:hover { text-decoration-color: currentColor; }
  [data-callout-body] code { white-space: normal; }
`;

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
    const variant = calloutVariant(data.variant);
    const Icon = TONE_ICON[tone];
    const label = calloutLabel(data.kind, tone);
    const titled = Boolean(data.title);
    return (
      <aside
        className={CALLOUT_FRAME_CLASSES}
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-callout-tone={tone}
        data-callout-variant={variant}
        data-callout-titled={titled ? "true" : "false"}
        data-source-id={data.id}
      >
        <style>{CALLOUT_STYLES}</style>
        <div data-callout-head="true" className={CALLOUT_HEAD_CLASSES}>
          <span data-callout-icon="true" aria-hidden="true" className={CALLOUT_ICON_WRAP_CLASSES}>
            <Icon aria-hidden="true" className={CALLOUT_ICON_CLASSES} />
          </span>
          <span data-callout-label="true" className={CALLOUT_LABEL_CLASSES}>
            {label}
          </span>
          {titled && (
            <span data-callout-title="true" className={CALLOUT_TITLE_CLASSES}>
              {data.title}
            </span>
          )}
        </div>
        {data.body && (
          <div data-callout-body="true" className={CALLOUT_BODY_CLASSES}>
            {ctx.renderMarkdown(data.body)}
          </div>
        )}
      </aside>
    );
  }
}
