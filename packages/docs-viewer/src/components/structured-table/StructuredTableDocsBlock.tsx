"use client";

import { Table2Icon } from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";

export const STRUCTURED_TABLE_LABEL = "Structured Table";

export const STRUCTURED_TABLE_AGENT_DESCRIPTION =
  'A structured table rendered from typed props: { title?: string; density?: "compact" | "normal" | "relaxed"; columns: string[]; rows: string[][] }. `columns` is the header row; each entry in `rows` is one body row whose cells align positionally with `columns` (short rows are padded with empty cells). `density` controls cell padding and defaults to "normal".';

export type StructuredTableDensity = "compact" | "normal" | "relaxed";

const DENSITY_CELL_CLASS: Record<StructuredTableDensity, string> = {
  compact: "px-2 py-1",
  normal: "px-3 py-2",
  relaxed: "px-4 py-3",
};

function resolveDensity(density: string | undefined): StructuredTableDensity {
  return density === "compact" || density === "relaxed" ? density : "normal";
}

/**
 * Structured table block. Data arrives as structured props (no body parsing):
 * indigo identity with a tinted header row, zebra body rows, hover highlight,
 * and density-driven cell padding. Ragged rows are padded with empty cells so
 * every row spans the full column set.
 */
export function StructuredTableBlock({
  id,
  title,
  density,
  columns,
  rows,
}: {
  id: string;
  title?: string;
  density?: StructuredTableDensity;
  columns: string[];
  rows: string[][];
}) {
  const resolvedDensity = resolveDensity(density);
  const cellClass = DENSITY_CELL_CLASS[resolvedDensity];
  return (
    <section
      className="not-prose my-4 rounded-md border bg-muted/20 p-3"
      data-docs-block-type="structured-table"
      data-source-id={id}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Table2Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Structured Table
        </span>
        {title && <span className="text-sm font-medium">{title}</span>}
        <Badge
          variant="outline"
          className="border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-300"
        >
          {resolvedDensity}
        </Badge>
        <span className="font-mono text-[11px] text-muted-foreground">{id}</span>
      </div>
      <div className="overflow-auto rounded-md border bg-background">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="border-b border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">
            <tr>
              {columns.map((column, columnIndex) => (
                <th
                  key={`${column}-${columnIndex}`}
                  className={cn(cellClass, "font-display uppercase tracking-wider")}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, rowIndex) => (
              <tr
                key={`${id}-row-${rowIndex}`}
                className="even:bg-muted/30 hover:bg-indigo-500/5 dark:hover:bg-indigo-400/10 transition-colors"
              >
                {columns.map((column, columnIndex) => (
                  <td key={`${column}-${columnIndex}`} className={cn(cellClass, "align-top")}>
                    {row[columnIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
