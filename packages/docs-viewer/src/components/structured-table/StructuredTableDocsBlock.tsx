"use client";

import { cn } from "../../ui/cn";

export const STRUCTURED_TABLE_LABEL = "Structured Table";

export const STRUCTURED_TABLE_AGENT_DESCRIPTION =
  'A structured table rendered from typed props: { title?: string; density?: "compact" | "normal" | "relaxed"; columns: string[]; rows: string[][] }. `columns` is the header row; each entry in `rows` is one body row whose cells align positionally with `columns` (short rows are padded with empty cells). `density` is accepted for schema compatibility; visual spacing is controlled by theme tokens.';

export type StructuredTableDensity = "compact" | "normal" | "relaxed";

const CELL_SPACING_CLASS =
  "py-[length:var(--docs-table-cell-pad-y,10px)] pl-0";
const COLUMN_GAP_CLASS =
  "pr-[length:var(--docs-table-cell-pad-x,16px)]";

/**
 * Structured table block. Data arrives as structured props (no body parsing):
 * an accent rule below the header, light row separators, and theme-controlled
 * cell spacing. Ragged rows are padded with empty cells so every row spans the
 * full column set.
 */
export function StructuredTableBlock({
  id,
  title,
  columns,
  rows,
}: {
  id: string;
  title?: string;
  density?: StructuredTableDensity;
  columns: string[];
  rows: string[][];
}) {
  return (
    <section
      className="not-prose my-4"
      data-docs-block-type="structured-table"
      data-source-id={id}
    >
      {title && (
        <div className="mb-1.5 text-sm font-medium text-foreground">{title}</div>
      )}
      <div className="overflow-auto rounded-md border border-[color:var(--docs-table-border,transparent)] bg-background">
        <table className="w-full border-collapse text-left leading-[1.55]">
          <thead className="border-b border-solid border-b-[length:var(--docs-table-header-rule-width,1.5px)] border-b-[color:color-mix(in_srgb,var(--docs-table-header-rule,var(--docs-table-header-fg,currentColor))_calc(var(--docs-table-header-rule-opacity,0.5)*100%),transparent)] bg-[color:var(--docs-table-header-bg,transparent)] text-[color:var(--docs-table-header-fg,currentColor)]">
            <tr>
              {columns.map((column, columnIndex) => (
                <th
                  key={`${column}-${columnIndex}`}
                  className={cn(
                    CELL_SPACING_CLASS,
                    "align-top text-[length:calc(var(--docs-table-font-size,14px)-1px)] font-medium",
                    columnIndex === columns.length - 1 ? "pr-0" : COLUMN_GAP_CLASS,
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={`${id}-row-${rowIndex}`}
                className={cn(
                  "transition-colors hover:bg-muted/20",
                  rowIndex !== rows.length - 1 &&
                    "border-b border-solid border-b-[length:var(--docs-table-row-rule-width,1px)] border-b-[color:color-mix(in_srgb,var(--docs-table-row-rule,var(--border))_calc(var(--docs-table-row-rule-opacity,1)*100%),transparent)]",
                )}
              >
                {columns.map((column, columnIndex) => (
                  <td
                    key={`${column}-${columnIndex}`}
                    className={cn(
                      CELL_SPACING_CLASS,
                      "align-top text-[length:var(--docs-table-font-size,14px)]",
                      columnIndex === columns.length - 1 ? "pr-0" : COLUMN_GAP_CLASS,
                    )}
                  >
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
