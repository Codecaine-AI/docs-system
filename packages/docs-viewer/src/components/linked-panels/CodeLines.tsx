"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../ui/cn";
import { useLinkTarget } from "./LinkGroup";
import {
  CODE_LINES_BODY_CLASSES,
  CODE_LINES_FILLER_CLASSES,
  CODE_LINES_FILLER_EVEN_CLASSES,
  CODE_LINES_FILLER_ODD_CLASSES,
  CODE_LINES_FILLER_RULE_CLASSES,
  CODE_LINES_PANEL_CLASSES,
  CODE_LINE_GUTTER_CLASSES,
  CODE_LINE_GUTTER_LIT_CLASSES,
  CODE_LINE_TEXT_CLASSES,
  CODE_LINE_ZEBRA_CLASSES,
  NUMBERED_LINE_CLASSES,
} from "./classes";

/**
 * Line-numbered code panel (system rule R1: line numbers on EVERY code
 * panel; numbering is local — it starts at 1 per panel instance).
 *
 * Per-line divs at EXACTLY the line-height token (--docs-link-line-height,
 * 21px by default; 13px mono text): right-aligned local numbers (12px) in a
 * gutter behind a hairline rule, an even-line zebra that is transparent by
 * default (R4), literal whitespace with horizontal scroll — soft wrap is
 * off. Pass tabIndex / role="region" / aria-label to make the pane a
 * keyboard-scrollable region; it then shows the shared focus ring. Lines with a `linkKey` join the enclosing
 * LinkGroup: lit lines take the wash + gutter rail, their number turns
 * pin-color bold, and the rail spans the gutter edge (the inset shadow
 * sits on the whole row, gutter included).
 */

export type LinkedCodeLine = {
  /** Rendered line content — plain text or pre-toned spans. */
  content: ReactNode;
  /** Optional LinkGroup key (or chain, primary first) pairing this line with its prose partners. */
  linkKey?: string | readonly string[];
};

export function CodeLines({
  lines,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  lines: readonly LinkedCodeLine[];
}) {
  // Filler bands continue the zebra rhythm past the last line: the first
  // one-line band is line lines.length+1, so its tint follows that parity.
  const nextLineEven = (lines.length + 1) % 2 === 0;
  return (
    <div {...rest} data-code-lines="true" data-code-surface="true" className={cn(CODE_LINES_PANEL_CLASSES, className)}>
      <div className={CODE_LINES_BODY_CLASSES}>
        {lines.map((line, index) => (
          <NumberedLine key={index} linkKey={line.linkKey} number={index + 1}>
            {line.content}
          </NumberedLine>
        ))}
      </div>
      {/* The gutter rule and zebra rhythm run to the panel's bottom edge —
          a short code column in a tall row must not read as clipped. */}
      <div
        aria-hidden
        data-code-lines-filler="true"
        data-filler-parity={nextLineEven ? "even" : "odd"}
        className={cn(
          CODE_LINES_FILLER_CLASSES,
          nextLineEven ? CODE_LINES_FILLER_EVEN_CLASSES : CODE_LINES_FILLER_ODD_CLASSES,
        )}
      >
        <span className={CODE_LINES_FILLER_RULE_CLASSES} />
      </div>
    </div>
  );
}

/**
 * One numbered line. `zebra` defaults to even line numbers (R4); a lit
 * row's wash replaces the stripe (cn() keeps the later background). The
 * gutter number flips to pin-color bold while the line is lit.
 */
export function NumberedLine({
  number,
  linkKey,
  zebra = number % 2 === 0,
  className,
  children,
}: {
  number: number;
  linkKey?: string | readonly string[];
  zebra?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const link = useLinkTarget(linkKey);
  return (
    <div
      {...link.targetProps}
      data-code-line={number}
      className={cn(
        NUMBERED_LINE_CLASSES,
        zebra && CODE_LINE_ZEBRA_CLASSES,
        link.className,
        className,
      )}
    >
      <span
        data-line-number="true"
        className={cn(CODE_LINE_GUTTER_CLASSES, link.lit && CODE_LINE_GUTTER_LIT_CLASSES)}
      >
        {number}
      </span>
      <span data-line-text="true" className={CODE_LINE_TEXT_CLASSES}>
        {children}
      </span>
    </div>
  );
}
