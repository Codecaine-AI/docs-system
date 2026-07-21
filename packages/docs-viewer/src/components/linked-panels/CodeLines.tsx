"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../ui/cn";
import { useLinkTarget } from "./LinkGroup";
import {
  CODE_LINES_BODY_CLASSES,
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
 * Per-line divs at EXACTLY the 20px line metric (CODE_LINE_HEIGHT_PX):
 * mono, right-aligned local numbers in a gutter behind a hairline rule,
 * zebra tint on even lines (R4), literal whitespace with horizontal
 * scroll — soft wrap is off. Lines with a `linkKey` join the enclosing
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

/** The zebra stripe color, matching CODE_LINE_ZEBRA_CLASSES exactly. */
const ZEBRA_COLOR = "var(--docs-zebra, color-mix(in srgb, var(--muted) 20%, transparent))";

export function CodeLines({
  lines,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  lines: readonly LinkedCodeLine[];
}) {
  // Filler bands continue the zebra rhythm past the last line: the first
  // 20px band is line lines.length+1, so its tint follows that parity.
  const nextLineEven = (lines.length + 1) % 2 === 0;
  const fillerBands = nextLineEven
    ? `repeating-linear-gradient(to bottom, ${ZEBRA_COLOR} 0px, ${ZEBRA_COLOR} 20px, transparent 20px, transparent 40px)`
    : `repeating-linear-gradient(to bottom, transparent 0px, transparent 20px, ${ZEBRA_COLOR} 20px, ${ZEBRA_COLOR} 40px)`;
  return (
    <div {...rest} data-code-lines="true" className={cn(CODE_LINES_PANEL_CLASSES, className)}>
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
        className="relative min-h-3 flex-1"
        style={{ backgroundImage: fillerBands }}
      >
        <span className="absolute inset-y-0 left-0 w-11 border-r border-solid border-[color:var(--docs-code-rule,var(--border))]" />
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
