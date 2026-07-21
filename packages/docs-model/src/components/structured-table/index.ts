"use client";

import type { ComponentBundle } from "../types";
import { structuredTableAgentView } from "./agent-view";
import { addColumn } from "./actions/add-column";
import { addRow } from "./actions/add-row";
import { removeColumn } from "./actions/remove-column";
import { removeRow } from "./actions/remove-row";
import { updateCell } from "./actions/update-cell";
import { manifest } from "./manifest";
import { structuredTableState } from "./state";

export const structuredTableComponent: ComponentBundle = {
  manifest,
  states: {
    "structured-table": structuredTableState,
  },
  actions: [addRow, removeRow, updateCell, addColumn, removeColumn],
  agentView: structuredTableAgentView,
};

export { structuredTableAgentView } from "./agent-view";
export { addColumn } from "./actions/add-column";
export { addRow } from "./actions/add-row";
export { removeColumn } from "./actions/remove-column";
export { removeRow } from "./actions/remove-row";
export { updateCell } from "./actions/update-cell";
export { manifest } from "./manifest";
export {
  StructuredTableState,
  TableCellSchema,
  checkStructuredTableProps,
  structuredTableState,
} from "./state";
export {
  normalizeRow,
  normalizeTableCell,
  parseTableCellInput,
  readTableColumns,
  readTableRows,
  resolveColumn,
  tableCellToMarkdown,
  tableCellToPlainText,
} from "./lib";
export type { TableCell } from "./lib";
