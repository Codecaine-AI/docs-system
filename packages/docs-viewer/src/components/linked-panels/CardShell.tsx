"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../ui/cn";
import { CARD_SHELL_BAR_CLASSES, CARD_SHELL_CLASSES } from "./classes";

/**
 * The shared card frame of the linked-panels family: a rounded bordered
 * card opened by an uppercase-mono header bar — label left, optional
 * legend right (e.g. "structure ↔ example"). System rule R5 lives in the
 * label slot: only panels whose language varies put a language there.
 */
export function CardShell({
  label,
  legend,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  /** Left bar text, e.g. "state — StateShapeState" or a language tag. */
  label: ReactNode;
  /** Optional right bar text, e.g. "structure ↔ example". */
  legend?: ReactNode;
}) {
  return (
    <div {...rest} data-card-shell="true" className={cn(CARD_SHELL_CLASSES, className)}>
      <div data-card-shell-bar="true" className={CARD_SHELL_BAR_CLASSES}>
        <span data-card-shell-label="true" className="truncate">
          {label}
        </span>
        {legend != null && legend !== "" && (
          <span data-card-shell-legend="true" className="whitespace-nowrap">
            {legend}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
