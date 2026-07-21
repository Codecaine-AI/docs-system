"use client";

import type { HTMLAttributes } from "react";
import { cn } from "../../ui/cn";
import { PROSE_ROWS_CLASSES } from "./classes";

/**
 * Prose note/property stack (system rule R4): rows separate with a
 * hairline divider — prose never zebra-stripes; that belongs to code.
 * Children are the rows (typically LinkTargets); the divider draws
 * between rows only, never around the stack.
 */
export function ProseRows({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} data-prose-rows="true" className={cn(PROSE_ROWS_CLASSES, className)}>
      {children}
    </div>
  );
}
