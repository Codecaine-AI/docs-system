import type { ElementType, HTMLAttributes, ReactNode } from "react";

type DataAttributes = { [Key in `data-${string}`]?: string | number | boolean | undefined };

export type DescribedNameProps = {
  id: string;
  label: ReactNode;
  description: ReactNode;
  as?: ElementType;
  className?: string;
  nameAttrs?: HTMLAttributes<HTMLElement> & DataAttributes;
  descriptionAttrs?: Omit<HTMLAttributes<HTMLSpanElement>, "id" | "role"> & DataAttributes;
  descriptionClassName?: string;
  children?: ReactNode;
};

export function DescribedName({ id, label, description, as: Name = "span", className, nameAttrs, descriptionAttrs, descriptionClassName, children }: DescribedNameProps) {
  return <span data-described="true" className="relative inline-block">
    <Name {...nameAttrs} data-has-description="true" tabIndex={0} aria-describedby={id} className={className}>{children ?? label}</Name>
    <span {...descriptionAttrs} role="tooltip" id={id} data-description-tip="true" className={descriptionClassName}>
      <span data-tip-label="true" aria-hidden="true">{label}</span>
      {description}
    </span>
  </span>;
}

export const DESCRIBED_NAME_STYLE = `
[data-described]{position:relative;display:inline-block}
[data-described]>[data-has-description]{cursor:help;text-decoration:underline dotted color-mix(in srgb,var(--foreground) 45%,transparent);text-decoration-thickness:1px;text-underline-offset:3px;outline:none;border-radius:2px}
[data-described]>[data-has-description]:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,var(--docs-shape-type,#0a5779) 45%,transparent)}
[data-described]>[data-description-tip]{position:absolute;left:-6px;top:calc(100% + 8px);z-index:30;width:max-content;max-width:36ch;padding:8px 11px 9px;border:1px solid color-mix(in srgb,var(--foreground) 22%,var(--border));border-radius:8px;background:var(--background);font:12px/1.5 sans-serif;box-shadow:0 8px 24px -8px rgba(20,20,20,.28),0 2px 6px rgba(20,20,20,.08);opacity:0;visibility:hidden;translate:0 -3px;transition:opacity .16s ease,translate .16s ease,visibility 0s linear .16s;pointer-events:none;text-decoration:none;font-weight:400}
[data-described]>[data-description-tip]::before{content:"";position:absolute;left:14px;top:-5px;width:8px;height:8px;background:var(--background);border-left:1px solid color-mix(in srgb,var(--foreground) 22%,var(--border));border-top:1px solid color-mix(in srgb,var(--foreground) 22%,var(--border));transform:rotate(45deg)}
[data-description-tip]>[data-tip-label]{display:block;margin-bottom:3px;font:600 11px ui-monospace,monospace;color:var(--foreground)}
[data-described]:hover>[data-description-tip],[data-described]:has(:focus-visible)>[data-description-tip]{opacity:1;visibility:visible;translate:0 0;transition-delay:var(--docs-tip-delay,450ms)}
[data-shape-field]:has([data-described]:hover),[data-shape-field]:has([data-described] :focus-visible),[data-param-note]:has([data-described]:hover),[data-param-note]:has([data-described] :focus-visible){position:relative;z-index:31}
[data-shape-ledger]>[data-shape-field]:nth-last-child(-n+2) [data-description-tip],[data-op-params]>[data-note-group]:last-child [data-description-tip]{top:auto;bottom:calc(100% + 8px);translate:0 3px}
[data-shape-ledger]>[data-shape-field]:nth-last-child(-n+2) [data-description-tip]::before,[data-op-params]>[data-note-group]:last-child [data-description-tip]::before{top:auto;bottom:-5px;border:0;border-right:1px solid color-mix(in srgb,var(--foreground) 22%,var(--border));border-bottom:1px solid color-mix(in srgb,var(--foreground) 22%,var(--border))}
[data-shape-ledger]>[data-shape-field]:nth-last-child(-n+2) [data-described]:hover>[data-description-tip],[data-shape-ledger]>[data-shape-field]:nth-last-child(-n+2) [data-described]:has(:focus-visible)>[data-description-tip],[data-op-params]>[data-note-group]:last-child [data-described]:hover>[data-description-tip],[data-op-params]>[data-note-group]:last-child [data-described]:has(:focus-visible)>[data-description-tip]{translate:0 0}
@media (prefers-reduced-motion:reduce){[data-described]>[data-description-tip]{translate:none;transition-property:opacity,visibility}}
@media print{[data-described]{display:contents}[data-name-row]{flex-wrap:wrap}[data-described]>[data-description-tip]{position:static;display:block;order:99;flex-basis:100%;width:100%;margin-top:4px;opacity:1;visibility:visible;translate:none;border:0;box-shadow:none;padding:2px 0 0;max-width:72ch;background:none;font-size:12px;line-height:1.25rem}[data-described]>[data-description-tip]::before,[data-description-tip]>[data-tip-label]{display:none}[data-described]>[data-has-description]{text-decoration:none}}
`;
