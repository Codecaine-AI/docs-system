"use client";

import type { ReactNode } from "react";
import type { TableCell } from "@codecaine-ai/docs-model";
import { renderDeltaSpans } from "../../render/delta-spans";

/**
 * Static (read-surface) cell rendering: a plain-string cell renders exactly
 * as it always has (raw text, `whitespace-pre-wrap` shows its newlines); a
 * span cell reuses the rich-text read surface's shared inline renderer, so
 * bold/italic/strike/code-chip/link styling matches prose blocks one-for-one.
 */
export function renderTableCell(cell: TableCell): ReactNode {
  return typeof cell === "string" ? cell : renderDeltaSpans(cell);
}
