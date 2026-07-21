"use client";

import type { DocBlock } from "../../doc-schema";
import { stringProp } from "../projection-utils";
import type { ComponentBundle } from "../types";
import { readTableColumns, readTableRows, tableCellToMarkdown } from "./lib";

function projectStructuredTable(block: DocBlock): string {
  const title = stringProp(block, "title");
  // Defensive reads (junk-tolerant, like the rest of the projection):
  // plain-string cells pass through VERBATIM — the pipe-table projection is
  // byte-identical to the pre-rich-cell form for all-plain tables — and span
  // cells render their marks as inline markdown.
  const columns = readTableColumns(block).map(tableCellToMarkdown);
  const rows = readTableRows(block).map((row) => row.map(tableCellToMarkdown));

  const tableLines: string[] = [];
  if (columns.length > 0) {
    tableLines.push(`| ${columns.join(" | ")} |`);
    tableLines.push(`| ${columns.map(() => "---").join(" | ")} |`);
    for (const row of rows) tableLines.push(`| ${row.join(" | ")} |`);
  }
  const table = tableLines.join("\n");
  if (title && table) return `**${title}**\n\n${table}`;
  return title ? `**${title}**` : table;
}

export const structuredTableAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "structured-table":
      return projectStructuredTable(block);
    default:
      return null;
  }
};
