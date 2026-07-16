"use client";

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
 * a tinted data header row, zebra body rows, hover highlight, and
 * density-driven cell padding. Ragged rows are padded with empty cells so every
 * row spans the full column set.
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
      className="not-prose my-4"
      data-docs-block-type="structured-table"
      data-source-id={id}
    >
      {title && (
        <div className="mb-1.5 text-sm font-medium text-foreground">{title}</div>
      )}
      <div className="overflow-auto rounded-md border border-[color:var(--docs-table-border,var(--border))] bg-background">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="border-b border-[color:var(--docs-table-border,color-mix(in_srgb,var(--color-indigo-500)_20%,transparent))] bg-[color:var(--docs-table-header-bg,color-mix(in_srgb,var(--color-indigo-500)_10%,transparent))] text-[color:var(--docs-table-header-fg,var(--color-indigo-700))] dark:border-[color:var(--docs-table-border,color-mix(in_srgb,var(--color-indigo-400)_20%,transparent))] dark:bg-[color:var(--docs-table-header-bg,color-mix(in_srgb,var(--color-indigo-400)_10%,transparent))] dark:text-[color:var(--docs-table-header-fg,var(--color-indigo-300))]">
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
          <tbody className="divide-y divide-[color:var(--docs-table-border,var(--border))]">
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
