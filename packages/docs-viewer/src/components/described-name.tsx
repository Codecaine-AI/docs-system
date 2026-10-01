import type { HTMLAttributes, ReactNode } from "react";

type DataAttributes = { [Key in `data-${string}`]?: string | number | boolean | undefined };

/**
 * A described name's description, printed inline (theme lab, 2026-10-01: no
 * tooltip-only information). It used to open in a delayed hover / focus
 * tooltip under a dotted-underlined name; it is now a plain block line under
 * the thing it describes, in the host's description color and size, capped
 * at a readable 75ch. Screen readers read it in document order, so it needs
 * no aria wiring. Hosts style it through DESCRIPTION_LINE_STYLE's `--fl-*`
 * locals (the structured-reference field ledger sets them).
 */
export function DescriptionLine({ children, ...rest }: { children: ReactNode } & Omit<HTMLAttributes<HTMLSpanElement>, "children"> & DataAttributes) {
  return <span {...rest} data-description-line="true">{children}</span>;
}

export const DESCRIPTION_LINE_STYLE = `
[data-description-line]{display:block;max-width:75ch;padding-bottom:2px;font-size:var(--fl-desc-size,13.5px);line-height:20px;font-weight:400;color:var(--fl-desc,var(--docs-muted,#666562))}
`;
