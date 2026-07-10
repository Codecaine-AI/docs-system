"use client";

import type { DocBlock } from "../../doc-schema";
import { stringProp } from "../projection-utils";
import type { ComponentBundle } from "../types";

function projectStructuredTable(block: DocBlock): string {
  const title = stringProp(block, "title");
  const rawColumns = block.props.columns;
  const columns = Array.isArray(rawColumns)
    ? rawColumns.filter((column): column is string => typeof column === "string")
    : [];
  const rawRows = block.props.rows;
  const rows = Array.isArray(rawRows)
    ? rawRows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) =>
          row.map((cell) =>
            typeof cell === "string" ? cell : String(cell ?? ""),
          ),
        )
    : [];

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
