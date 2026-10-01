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
  /** Visual style (eyebrow/hairline/rail/tab); missing or unknown renders as eyebrow. */
  variant?: string;
  /**
   * Optional free-form semantic kind (e.g. "Requirement", "Decision").
   * Coloring stays tone-derived. The kind only names the type in the icon's
   * hover tooltip, in place of the tone label. Legacy semantic cards are
   * coerced to callouts with a kind at validation.
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

/*
 * One renderer for both surfaces (the editor's callout node view delegates
 * here). No visible type label: the tone icon carries the type, and its hover
 * tooltip (CSS `::after` from `data-tip`) names it — `kind` when set, else the
 * tone label.
 *
 * DOM: <aside data-callout-variant data-callout-titled> holding the icon
 * wrapper and a content wrapper (title?, body?). The inline stylesheet lays
 * the same parts out per variant:
 * - eyebrow (default): rail-width left rail + tone tint fill; the icon sits
 *   beside the title, or leads the body when untitled.
 * - hairline: icon column, then a hairline-width tone-tinted rule, then text.
 * - rail: icon column, then a rail-width accent rail, then text. The icon is
 *   an internal column, not hung in the page margin: the editor's drag grip
 *   floats in that margin at the block's top-left and would collide with it.
 * - tab: hairline-width top rule with the icon notched into it over the page
 *   background, tint fill below.
 *
 * Class strings carry the knobs every variant shares (margin, icon size,
 * title size/weight/ink, body scale/ink). Variant geometry (rail and hairline
 * widths, padding, radius, tint) lives in the stylesheet. Every read has a
 * literal fallback, so a host with no theme layer renders the approved look.
 *
 * TONE PALETTE. The style-rail color tokens —
 * `--docs-callout-<tone>-accent|tint|title-fg` and `--docs-callout-fg` — are
 * declared on the document root by the host's theme layer, so the stylesheet
 * READS them and never declares them: a declaration on the callout element
 * itself shadows the root value, which is what left every callout color knob
 * dead. The per-element results live in private vars (`--docs-callout-accent`,
 * `-tint`, `-title-ink`, `-text`, `-rule`); their literal fallbacks are the
 * approved palette. `--docs-callout-border` is likewise only read: unset, each
 * variant's rule follows the tone accent.
 */
const CALLOUT_FRAME_CLASSES = "not-prose my-[var(--docs-callout-margin,16px)] min-w-0 w-full";
/* The icon wrapper copies the body's text metrics so `1lh` is one body line
   (the workbench's index.css restates them on its reading size). */
const CALLOUT_ICON_WRAP_CLASSES =
  "relative inline-flex shrink-0 cursor-help items-center text-[length:calc(0.875rem*var(--docs-callout-body-text-scale,1))] leading-6 text-[color:var(--docs-callout-accent)]";
const CALLOUT_ICON_CLASSES =
  "block h-[var(--docs-callout-icon-size,16px)] w-[var(--docs-callout-icon-size,16px)]";
const CALLOUT_TITLE_CLASSES =
  "min-w-0 break-words text-[length:var(--docs-callout-title-text-size,14px)] [font-weight:var(--docs-callout-title-weight,700)] leading-[calc(20/14)] text-[color:var(--docs-callout-title-ink)]";
const CALLOUT_BODY_CLASSES =
  "docs-markdown prose prose-sm dark:prose-invert max-w-none min-w-0 font-sans text-[length:calc(0.875rem*var(--docs-callout-body-text-scale,1))] leading-6 text-[color:var(--docs-callout-text)]";

const CALLOUT_STYLES = `
  [data-docs-block-type="callout"] {
    --docs-callout-accent: var(--docs-callout-info-accent, #1683c7);
    --docs-callout-tint: var(--docs-callout-info-tint, #f1f5f6);
    --docs-callout-title-ink: var(--docs-callout-info-title-fg, #15384d);
    --docs-callout-text: var(--docs-callout-fg, #30343b);
  }
  [data-docs-block-type="callout"][data-callout-tone="decision"] {
    --docs-callout-accent: var(--docs-callout-decision-accent, #7657a4);
    --docs-callout-tint: var(--docs-callout-decision-tint, #f5f3f4);
    --docs-callout-title-ink: var(--docs-callout-decision-title-fg, #3f3158);
  }
  [data-docs-block-type="callout"][data-callout-tone="risk"],
  [data-docs-block-type="callout"][data-callout-tone="warning"] {
    --docs-callout-accent: var(--docs-callout-warning-accent, #a86608);
    --docs-callout-tint: var(--docs-callout-warning-tint, #f7f3ed);
    --docs-callout-title-ink: var(--docs-callout-warning-title-fg, #553606);
  }
  [data-docs-block-type="callout"][data-callout-tone="success"] {
    --docs-callout-accent: var(--docs-callout-success-accent, #287c55);
    --docs-callout-tint: var(--docs-callout-success-tint, #f2f4f1);
    --docs-callout-title-ink: var(--docs-callout-success-title-fg, #214d39);
  }
  .dark [data-docs-block-type="callout"] {
    --docs-callout-accent: var(--docs-callout-info-accent, #69b9e8);
    --docs-callout-tint: var(--docs-callout-info-tint, #323c42);
    --docs-callout-title-ink: var(--docs-callout-info-title-fg, #d9f1ff);
    --docs-callout-text: var(--docs-callout-fg, #e4e7eb);
  }
  .dark [data-docs-block-type="callout"][data-callout-tone="decision"] {
    --docs-callout-accent: var(--docs-callout-decision-accent, #bda4df);
    --docs-callout-tint: var(--docs-callout-decision-tint, #383b41);
    --docs-callout-title-ink: var(--docs-callout-decision-title-fg, #eee5fa);
  }
  .dark [data-docs-block-type="callout"][data-callout-tone="risk"],
  .dark [data-docs-block-type="callout"][data-callout-tone="warning"] {
    --docs-callout-accent: var(--docs-callout-warning-accent, #e6b35e);
    --docs-callout-tint: var(--docs-callout-warning-tint, #3a3c39);
    --docs-callout-title-ink: var(--docs-callout-warning-title-fg, #fae5bb);
  }
  .dark [data-docs-block-type="callout"][data-callout-tone="success"] {
    --docs-callout-accent: var(--docs-callout-success-accent, #7bc9a2);
    --docs-callout-tint: var(--docs-callout-success-tint, #343d3d);
    --docs-callout-title-ink: var(--docs-callout-success-title-fg, #d9f4e5);
  }
  [data-docs-block-type="callout"] {
    --docs-callout-rule: var(--docs-callout-border, var(--docs-callout-accent));
  }

  /* Icon: one first line tall (the title line, else one body line), so it
     centers on the line beside or after it. */
  [data-callout-icon] { align-self: start; }
  [data-callout-titled="true"] [data-callout-icon] { height: calc(var(--docs-callout-title-text-size,14px) * 20 / 14); }
  [data-callout-titled="false"] [data-callout-icon] { height: 1lh; }
  /* Hover tooltip: the only place the type name appears. */
  [data-callout-icon]::after {
    content: attr(data-tip);
    position: absolute; left: 50%; bottom: calc(100% + 6px); z-index: 30;
    transform: translate(-50%, 2px);
    padding: 3px 8px; border-radius: var(--radius, 2px); white-space: nowrap;
    background: var(--foreground, #15181d); color: var(--background, #ffffff);
    font: 600 12px/1.5 ui-sans-serif, system-ui, sans-serif; letter-spacing: normal;
    opacity: 0; pointer-events: none; transition: opacity .12s, transform .12s;
  }
  [data-callout-icon]:hover::after { opacity: 1; transform: translate(-50%, 0); }
  [data-callout-title] + [data-callout-body] { margin-top: 2px; }

  /* eyebrow: rail + tint; icon beside the title, or leading an untitled body. */
  [data-callout-variant="eyebrow"] {
    display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 8px;
    padding: var(--docs-callout-pad-y,12px) var(--docs-callout-pad-x,16px);
    border-left: var(--docs-callout-rail-width,2px) solid var(--docs-callout-rule);
    border-radius: 0 var(--docs-callout-radius,var(--radius,2px)) var(--docs-callout-radius,var(--radius,2px)) 0;
    background: var(--docs-callout-tint);
  }
  [data-callout-variant="eyebrow"][data-callout-titled="false"] { column-gap: 10px; }
  [data-callout-variant="eyebrow"] [data-callout-content] { display: contents; }
  [data-callout-variant="eyebrow"][data-callout-titled="true"] [data-callout-body] { grid-column: 1 / -1; }

  /* hairline / rail: icon column | rule | text. */
  [data-callout-variant="hairline"],
  [data-callout-variant="rail"] {
    display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 12px;
  }
  [data-callout-variant="hairline"] [data-callout-content],
  [data-callout-variant="rail"] [data-callout-content] {
    min-width: 0; padding: 2px 0 2px var(--docs-callout-pad-x,16px);
  }
  [data-callout-variant="hairline"] [data-callout-icon],
  [data-callout-variant="rail"] [data-callout-icon] { margin-top: 2px; }
  [data-callout-variant="hairline"] [data-callout-content] {
    border-left: var(--docs-callout-hairline-width,1px) solid var(--docs-callout-border, color-mix(in srgb, var(--docs-callout-accent) 40%, transparent));
  }
  [data-callout-variant="rail"] [data-callout-content] {
    border-left: var(--docs-callout-rail-width,2px) solid var(--docs-callout-rule);
  }

  /* tab: top rule with the icon notched into it, tint below. */
  [data-callout-variant="tab"] {
    position: relative;
    padding: calc(var(--docs-callout-pad-y,12px) + 4px) var(--docs-callout-pad-x,16px) var(--docs-callout-pad-y,12px);
    border-top: var(--docs-callout-hairline-width,1px) solid var(--docs-callout-rule);
    border-radius: 0 0 var(--docs-callout-radius,var(--radius,2px)) var(--docs-callout-radius,var(--radius,2px));
    background: var(--docs-callout-tint);
  }
  [data-callout-variant="tab"] [data-callout-icon] {
    position: absolute; left: calc(var(--docs-callout-pad-x,16px) - 6px);
    top: calc(var(--docs-callout-icon-size,16px) / -2 - var(--docs-callout-hairline-width,1px) / 2);
    height: var(--docs-callout-icon-size,16px); padding: 0 6px;
    background: var(--background, #ffffff);
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
    const typeName = data.kind || TONE_LABEL[tone];
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
        <span
          data-callout-icon="true"
          role="img"
          aria-label={typeName}
          data-tip={typeName}
          className={CALLOUT_ICON_WRAP_CLASSES}
        >
          <Icon aria-hidden="true" className={CALLOUT_ICON_CLASSES} />
        </span>
        <div data-callout-content="true">
          {titled && (
            <div data-callout-title="true" className={CALLOUT_TITLE_CLASSES}>
              {data.title}
            </div>
          )}
          {data.body && (
            <div data-callout-body="true" className={CALLOUT_BODY_CLASSES}>
              {ctx.renderMarkdown(data.body)}
            </div>
          )}
        </div>
      </aside>
    );
  }
}
