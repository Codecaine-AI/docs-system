"use client";

import type { ReactNode } from "react";
import type { TableCell } from "@codecaine-ai/docs-model";
import { renderDeltaSpans } from "../../render/delta-spans";
import { liftBacktickCode } from "./cell-code";
import { WHOLE_CHIP_MAX_CHARS } from "./column-layout";

/**
 * Static (read-surface) cell rendering: a plain-string cell renders exactly
 * as it always has (raw text, `whitespace-pre-wrap` shows its newlines); a
 * span cell reuses the rich-text read surface's shared inline renderer, so
 * bold/italic/strike/code-chip/link styling matches prose blocks one-for-one.
 * A string written with backtick code renders its chips (cell-code.ts).
 * A chip of up to WHOLE_CHIP_MAX_CHARS characters stays on one line, so a
 * flag and its value (`--root <path>`) or a short path never splits.
 */
export function renderTableCell(cell: TableCell): ReactNode {
  const value = liftBacktickCode(cell);
  return typeof value === "string" ? value : renderDeltaSpans(value, { wholeChipMaxChars: WHOLE_CHIP_MAX_CHARS });
}
