"use client";

import type { TableCell } from "@codecaine-ai/docs-model";
import { cn } from "../../ui/cn";
import { renderTableCell } from "./cell-render";
import {
  TABLE_BODY_CELL_TEXT_CLASSES,
  TABLE_CELL_SPACING_CLASS,
  TABLE_COLUMN_GAP_CLASS,
  TABLE_ELEMENT_CLASSES,
  TABLE_HEAD_CLASSES,
  TABLE_HEADER_CELL_TEXT_CLASSES,
  TABLE_LAST_COLUMN_CLASS,
  TABLE_ROW_HOVER_CLASSES,
  TABLE_ROW_RULE_CLASSES,
  TABLE_SECTION_CLASSES,
  TABLE_TITLE_CLASSES,
  TABLE_WRAPPER_CLASSES,
} from "./table-classes";

export const STRUCTURED_TABLE_LABEL = "Structured Table";

export const STRUCTURED_TABLE_AGENT_DESCRIPTION =
  'A structured table rendered from typed props: { title?: string; density?: "compact" | "normal" | "relaxed"; columns: TableCell[]; rows: TableCell[][] }. A TableCell is a plain string (canonical for unmarked content) or a DeltaSpan[] carrying bold/italic/strike/code/link marks (never reference). `columns` is the header row; each entry in `rows` is one body row whose cells align positionally with `columns` (short rows are padded with empty cells). `density` is accepted for schema compatibility; visual spacing is controlled by theme tokens.';

export type StructuredTableDensity = "compact" | "normal" | "relaxed";

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
  columns: TableCell[];
  rows: TableCell[][];
}) {
  return (
    <section
      className={TABLE_SECTION_CLASSES}
      data-docs-block-type="structured-table"
      data-source-id={id}
    >
      {title && <div className={TABLE_TITLE_CLASSES}>{title}</div>}
      <div className={TABLE_WRAPPER_CLASSES}>
        <table className={TABLE_ELEMENT_CLASSES}>
          <thead className={TABLE_HEAD_CLASSES}>
            <tr>
              {columns.map((column, columnIndex) => (
                <th
                  key={columnIndex}
                  className={cn(
                    TABLE_CELL_SPACING_CLASS,
                    TABLE_HEADER_CELL_TEXT_CLASSES,
                    columnIndex === columns.length - 1
                      ? TABLE_LAST_COLUMN_CLASS
                      : TABLE_COLUMN_GAP_CLASS,
                  )}
                >
                  {renderTableCell(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={`${id}-row-${rowIndex}`}
                className={cn(
                  TABLE_ROW_HOVER_CLASSES,
                  rowIndex !== rows.length - 1 && TABLE_ROW_RULE_CLASSES,
                )}
              >
                {columns.map((_, columnIndex) => (
                  <td
                    key={columnIndex}
                    className={cn(
                      TABLE_CELL_SPACING_CLASS,
                      TABLE_BODY_CELL_TEXT_CLASSES,
                      columnIndex === columns.length - 1
                        ? TABLE_LAST_COLUMN_CLASS
                        : TABLE_COLUMN_GAP_CLASS,
                    )}
                  >
                    {renderTableCell(row[columnIndex] ?? "")}
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
