import type { HTMLAttributes, ReactNode } from "react";

type DataAttributes = { [Key in `data-${string}`]?: string | number | boolean | undefined };

/**
 * A name with a hover / focus tooltip (restored from 4ca4e05, restyled for
 * the dark code panel). The name carries a subtle dotted underline and a
 * help cursor; its tooltip opens under it after a short hover dwell
 * (--docs-tip-delay, 450ms) or at once on keyboard focus (the name is
 * focusable and aria-describedby points at the role="tooltip" span). CSS
 * only, so the reader, the editor's atom view and a static export behave the
 * same; the tooltip takes no pointer events. Print media (PDF export) prints
 * the tooltip text inline beneath the name.
 *
 * `children` follow the name inside the hover target (a field's `?` marker),
 * so in print the description lands after them, not between them.
 *
 * `focusable={false}` is for a name inside a control that already takes focus
 * (an operation's <summary>): the name gets no tab stop of its own and no
 * aria-describedby; the host shows the tooltip on the control's focus and
 * wires the description to the control.
 */
export function DescribedName({
  id,
  name,
  tip,
  children,
  nameAttrs,
  tipAttrs,
  focusable = true,
}: {
  id: string;
  name: ReactNode;
  tip: ReactNode;
  children?: ReactNode;
  nameAttrs?: Omit<HTMLAttributes<HTMLSpanElement>, "id" | "tabIndex" | "aria-describedby"> & DataAttributes;
  tipAttrs?: Omit<HTMLAttributes<HTMLSpanElement>, "id" | "role"> & DataAttributes;
  focusable?: boolean;
}) {
  return <span data-described="true">
    <span {...nameAttrs} data-has-description="true" {...(focusable ? { tabIndex: 0, "aria-describedby": id } : {})}>{name}</span>
    {children}
    <span {...tipAttrs} role="tooltip" id={id} data-description-tip="true">{tip}</span>
  </span>;
}

/**
 * Tooltip look. Every color is a panel role token, so inside a dark code
 * panel ([data-code-surface]) the bubble is the panel raised one step
 * (--docs-hover) with the panel rule and the description color the host maps
 * onto --fl-desc (>= 4.5:1 on it). Hosts flip the bubble above a name near
 * the bottom of a clipped panel by setting `top:auto;bottom:...` on it.
 */
export const DESCRIBED_NAME_STYLE = `
[data-described]{position:relative;display:inline-block;max-width:100%}
[data-has-description]{cursor:help;text-decoration-line:underline;text-decoration-style:dotted;text-decoration-color:color-mix(in srgb,currentColor 55%,transparent);text-decoration-thickness:1px;text-underline-offset:3px;outline:none;border-radius:var(--ds-radius-base)}
[data-has-description]:focus-visible{outline:var(--ds-border-width-focus) solid var(--docs-focus-ring,#0078df);outline-offset:var(--ds-focus-ring-offset)}
[data-description-tip]{position:absolute;left:-8px;top:calc(100% + 6px);z-index:30;width:max-content;max-width:40ch;padding:var(--ds-space-1-5) 10px 7px;border:var(--ds-border-width-hairline) solid var(--docs-rule,#e6e5e3);border-radius:var(--radius,2px);background:color-mix(in srgb,var(--docs-ink,#1f1f1f) 9%,var(--docs-panel,#f8f8f7));box-shadow:var(--ds-shadow-glass);font-family:var(--docs-font-body,var(--font-sans,ui-sans-serif,system-ui,sans-serif));font-size:var(--fl-desc-size,13.5px);font-style:normal;font-weight:var(--ds-font-weight-regular);line-height:20px;text-align:left;text-decoration:none;white-space:normal;overflow-wrap:break-word;color:var(--fl-desc,var(--docs-muted,#666562));pointer-events:none;opacity:0;visibility:hidden;translate:0 -2px;transition:opacity 120ms ease,visibility 120ms,translate 120ms ease;transition-delay:0s}
[data-described]:hover>[data-description-tip]{opacity:1;visibility:visible;translate:0 0;transition-delay:var(--docs-tip-delay,450ms)}
[data-described]:has(>[data-has-description]:focus-visible)>[data-description-tip]{opacity:1;visibility:visible;translate:0 0;transition-delay:0s}
@media (prefers-reduced-motion:reduce){[data-description-tip]{translate:none;transition-property:opacity,visibility}}
@media print{[data-described]{display:contents}[data-has-description]{text-decoration:none}[data-description-tip]{position:static;display:block;width:auto;max-width:var(--ds-layout-lane-text);margin:var(--ds-space-0-5) 0 0;padding:0;border:0;background:none;box-shadow:none;opacity:1;visibility:visible;translate:none}}
`;
