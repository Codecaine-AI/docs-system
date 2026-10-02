"use client";

import type { ReactNode } from "react";
import type { TableCell } from "@codecaine-ai/docs-model";
import { renderDeltaSpans } from "../../render/delta-spans";
import { liftBacktickCode } from "./cell-code";

/**
 * Static (read-surface) cell rendering: a plain-string cell renders exactly
 * as it always has (raw text, `whitespace-pre-wrap` shows its newlines); a
 * span cell reuses the rich-text read surface's shared inline renderer, so
 * bold/italic/strike/code-chip/link styling matches prose blocks one-for-one.
 * A string written with backtick code renders its chips (cell-code.ts).
 */
export function renderTableCell(cell: TableCell): ReactNode {
  const value = liftBacktickCode(cell);
  return typeof value === "string" ? value : renderDeltaSpans(value);
}
