"use client";

export type TableData = { columns: string[]; rows: string[][] };

function normalizeRow(row: string[], length: number, fill = ""): string[] {
  const next = row.slice(0, length);
  while (next.length < length) next.push(fill);
  return next;
}

function normalizeRows(rows: string[][], length: number): string[][] {
  return rows.map((row) => normalizeRow(row, length));
}

export function normalizeTable(data: TableData): TableData {
  return {
    columns: [...data.columns],
    rows: normalizeRows(data.rows, data.columns.length),
  };
}

export function addRow(data: TableData, index?: number): TableData {
  const at = index ?? data.rows.length;
  if (!Number.isInteger(at) || at < 0 || at > data.rows.length) return data;
  const rows = normalizeRows(data.rows, data.columns.length);
  rows.splice(at, 0, normalizeRow([], data.columns.length));
  return { columns: [...data.columns], rows };
}

export function addColumn(data: TableData, index?: number, name = ""): TableData {
  const at = index ?? data.columns.length;
  if (!Number.isInteger(at) || at < 0 || at > data.columns.length) return data;
  const columns = [...data.columns];
  columns.splice(at, 0, name);
  const rows = data.rows.map((row) => {
    const next = normalizeRow(row, data.columns.length);
    next.splice(at, 0, "");
    return next;
  });
  return { columns, rows };
}

export function removeRow(data: TableData, index: number): TableData {
  if (!Number.isInteger(index) || index < 0 || index > data.rows.length - 1) {
    return data;
  }
  return {
    columns: [...data.columns],
    rows: normalizeRows(
      data.rows.filter((_, i) => i !== index),
      data.columns.length,
    ),
  };
}

export function removeColumn(data: TableData, index: number): TableData {
  if (data.columns.length <= 1) return data;
  if (!Number.isInteger(index) || index < 0 || index > data.columns.length - 1) {
    return data;
  }
  return {
    columns: data.columns.filter((_, i) => i !== index),
    rows: data.rows.map((row) =>
      normalizeRow(row, data.columns.length).filter((_, i) => i !== index),
    ),
  };
}

export function moveRow(data: TableData, from: number, to: number): TableData {
  const last = data.rows.length - 1;
  if (!Number.isInteger(from) || from < 0 || from > last) return data;
  if (!Number.isInteger(to) || to < 0 || to > last) return data;
  const rows = normalizeRows(data.rows, data.columns.length);
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved);
  return { columns: [...data.columns], rows };
}

export function moveColumn(data: TableData, from: number, to: number): TableData {
  const last = data.columns.length - 1;
  if (!Number.isInteger(from) || from < 0 || from > last) return data;
  if (!Number.isInteger(to) || to < 0 || to > last) return data;
  const columns = [...data.columns];
  const [movedColumn] = columns.splice(from, 1);
  columns.splice(to, 0, movedColumn);
  const rows = data.rows.map((row) => {
    const next = normalizeRow(row, data.columns.length);
    const [movedCell] = next.splice(from, 1);
    next.splice(to, 0, movedCell);
    return next;
  });
  return { columns, rows };
}

export function duplicateRow(data: TableData, index: number): TableData {
  if (!Number.isInteger(index) || index < 0 || index > data.rows.length - 1) {
    return data;
  }
  const rows = normalizeRows(data.rows, data.columns.length);
  rows.splice(index + 1, 0, [...rows[index]]);
  return { columns: [...data.columns], rows };
}

export function duplicateColumn(data: TableData, index: number): TableData {
  if (!Number.isInteger(index) || index < 0 || index > data.columns.length - 1) {
    return data;
  }
  const columns = [...data.columns];
  columns.splice(index + 1, 0, columns[index]);
  const rows = data.rows.map((row) => {
    const next = normalizeRow(row, data.columns.length);
    next.splice(index + 1, 0, next[index]);
    return next;
  });
  return { columns, rows };
}

export function clearRow(data: TableData, index: number): TableData {
  if (!Number.isInteger(index) || index < 0 || index > data.rows.length - 1) {
    return data;
  }
  const rows = normalizeRows(data.rows, data.columns.length);
  rows[index] = rows[index].map(() => "");
  return { columns: [...data.columns], rows };
}

export function clearColumn(data: TableData, index: number): TableData {
  if (!Number.isInteger(index) || index < 0 || index > data.columns.length - 1) {
    return data;
  }
  const rows = data.rows.map((row) => {
    const next = normalizeRow(row, data.columns.length);
    next[index] = "";
    return next;
  });
  return { columns: [...data.columns], rows };
}

export function updateCell(
  data: TableData,
  rowIndex: number,
  columnIndex: number,
  value: string,
): TableData {
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex > data.rows.length - 1) {
    return data;
  }
  if (
    !Number.isInteger(columnIndex) ||
    columnIndex < 0 ||
    columnIndex > data.columns.length - 1
  ) {
    return data;
  }
  const rows = normalizeRows(data.rows, data.columns.length);
  rows[rowIndex][columnIndex] = value;
  return { columns: [...data.columns], rows };
}

export function updateHeader(
  data: TableData,
  columnIndex: number,
  value: string,
): TableData {
  if (
    !Number.isInteger(columnIndex) ||
    columnIndex < 0 ||
    columnIndex > data.columns.length - 1
  ) {
    return data;
  }
  const columns = [...data.columns];
  columns[columnIndex] = value;
  return { columns, rows: normalizeRows(data.rows, data.columns.length) };
}
