import { describe, expect, it } from "bun:test";
import {
  addColumn,
  addRow,
  clearColumn,
  clearRow,
  duplicateColumn,
  duplicateRow,
  moveColumn,
  moveRow,
  normalizeTable,
  removeColumn,
  removeRow,
  type TableData,
  updateCell,
  updateHeader,
} from "../components/structured-table/editor/mutations";

const table = (): TableData => ({
  columns: ["Name", "Role", "Team"],
  rows: [
    ["Ada", "Engineer", "Core"],
    ["Grace", "Admiral", "Navy"],
  ],
});

describe("normalizeTable", () => {
  it("pads short rows and truncates long rows to the column count", () => {
    const result = normalizeTable({
      columns: ["A", "B", "C"],
      rows: [["1"], ["1", "2", "3", "4"], []],
    });
    expect(result.rows).toEqual([
      ["1", "", ""],
      ["1", "2", "3"],
      ["", "", ""],
    ]);
  });

  it("returns new objects without mutating the input", () => {
    const input = table();
    const result = normalizeTable(input);
    expect(result).not.toBe(input);
    expect(result.columns).not.toBe(input.columns);
    expect(result.rows[0]).not.toBe(input.rows[0]);
    expect(result).toEqual(input);
  });
});

describe("addRow", () => {
  it("appends an empty row by default", () => {
    const result = addRow(table());
    expect(result.rows).toHaveLength(3);
    expect(result.rows[2]).toEqual(["", "", ""]);
  });

  it("inserts at the start and middle", () => {
    expect(addRow(table(), 0).rows[0]).toEqual(["", "", ""]);
    const middle = addRow(table(), 1);
    expect(middle.rows[1]).toEqual(["", "", ""]);
    expect(middle.rows[0][0]).toBe("Ada");
    expect(middle.rows[2][0]).toBe("Grace");
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(addRow(input, 3)).toBe(input);
    expect(addRow(input, -1)).toBe(input);
  });
});

describe("addColumn", () => {
  it("appends an unnamed column by default and extends every row", () => {
    const result = addColumn(table());
    expect(result.columns).toEqual(["Name", "Role", "Team", ""]);
    expect(result.rows).toEqual([
      ["Ada", "Engineer", "Core", ""],
      ["Grace", "Admiral", "Navy", ""],
    ]);
  });

  it("inserts a named column mid-table", () => {
    const result = addColumn(table(), 1, "Status");
    expect(result.columns).toEqual(["Name", "Status", "Role", "Team"]);
    expect(result.rows[0]).toEqual(["Ada", "", "Engineer", "Core"]);
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(addColumn(input, 4)).toBe(input);
    expect(addColumn(input, -1)).toBe(input);
  });
});

describe("removeRow", () => {
  it("removes rows at the ends and middle", () => {
    expect(removeRow(table(), 0).rows).toEqual([["Grace", "Admiral", "Navy"]]);
    expect(removeRow(table(), 1).rows).toEqual([["Ada", "Engineer", "Core"]]);
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(removeRow(input, 2)).toBe(input);
    expect(removeRow(input, -1)).toBe(input);
  });
});

describe("removeColumn", () => {
  it("removes the column header and every row cell", () => {
    const result = removeColumn(table(), 1);
    expect(result.columns).toEqual(["Name", "Team"]);
    expect(result.rows).toEqual([
      ["Ada", "Core"],
      ["Grace", "Navy"],
    ]);
  });

  it("never removes the last column", () => {
    const input: TableData = { columns: ["Only"], rows: [["x"]] };
    expect(removeColumn(input, 0)).toBe(input);
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(removeColumn(input, 3)).toBe(input);
    expect(removeColumn(input, -1)).toBe(input);
  });
});

describe("moveRow", () => {
  it("moves a row forward and backward", () => {
    expect(moveRow(table(), 0, 1).rows.map((row) => row[0])).toEqual([
      "Grace",
      "Ada",
    ]);
    expect(moveRow(table(), 1, 0).rows.map((row) => row[0])).toEqual([
      "Grace",
      "Ada",
    ]);
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(moveRow(input, 0, 2)).toBe(input);
    expect(moveRow(input, 2, 0)).toBe(input);
    expect(moveRow(input, -1, 0)).toBe(input);
  });
});

describe("moveColumn", () => {
  it("moves the header and keeps every row cell aligned", () => {
    const result = moveColumn(table(), 0, 2);
    expect(result.columns).toEqual(["Role", "Team", "Name"]);
    expect(result.rows).toEqual([
      ["Engineer", "Core", "Ada"],
      ["Admiral", "Navy", "Grace"],
    ]);
  });

  it("moves backward with cells aligned", () => {
    const result = moveColumn(table(), 2, 0);
    expect(result.columns).toEqual(["Team", "Name", "Role"]);
    expect(result.rows[1]).toEqual(["Navy", "Grace", "Admiral"]);
  });

  it("realigns ragged rows before moving", () => {
    const result = moveColumn(
      { columns: ["A", "B", "C"], rows: [["1"]] },
      0,
      2,
    );
    expect(result.rows).toEqual([["", "", "1"]]);
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(moveColumn(input, 0, 3)).toBe(input);
    expect(moveColumn(input, 3, 0)).toBe(input);
  });
});

describe("duplicateRow", () => {
  it("inserts the copy directly after the source", () => {
    const result = duplicateRow(table(), 0);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[1]).toEqual(["Ada", "Engineer", "Core"]);
    expect(result.rows[1]).not.toBe(result.rows[0]);
    expect(result.rows[2][0]).toBe("Grace");
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(duplicateRow(input, 2)).toBe(input);
  });
});

describe("duplicateColumn", () => {
  it("copies the header name and every cell adjacent to the source", () => {
    const result = duplicateColumn(table(), 1);
    expect(result.columns).toEqual(["Name", "Role", "Role", "Team"]);
    expect(result.rows).toEqual([
      ["Ada", "Engineer", "Engineer", "Core"],
      ["Grace", "Admiral", "Admiral", "Navy"],
    ]);
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(duplicateColumn(input, 3)).toBe(input);
  });
});

describe("clearRow", () => {
  it("empties every cell in the row", () => {
    const result = clearRow(table(), 1);
    expect(result.rows[1]).toEqual(["", "", ""]);
    expect(result.rows[0]).toEqual(["Ada", "Engineer", "Core"]);
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(clearRow(input, 5)).toBe(input);
  });
});

describe("clearColumn", () => {
  it("empties the cell in every row but keeps the header", () => {
    const result = clearColumn(table(), 0);
    expect(result.columns[0]).toBe("Name");
    expect(result.rows).toEqual([
      ["", "Engineer", "Core"],
      ["", "Admiral", "Navy"],
    ]);
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(clearColumn(input, 3)).toBe(input);
  });
});

describe("updateCell", () => {
  it("sets a single cell without touching the input", () => {
    const input = table();
    const result = updateCell(input, 1, 2, "Fleet");
    expect(result.rows[1][2]).toBe("Fleet");
    expect(input.rows[1][2]).toBe("Navy");
  });

  it("normalizes ragged rows while updating", () => {
    const result = updateCell({ columns: ["A", "B"], rows: [["1"]] }, 0, 1, "2");
    expect(result.rows).toEqual([["1", "2"]]);
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(updateCell(input, 2, 0, "x")).toBe(input);
    expect(updateCell(input, 0, 3, "x")).toBe(input);
    expect(updateCell(input, -1, 0, "x")).toBe(input);
  });
});

describe("updateHeader", () => {
  it("renames a column without touching cells", () => {
    const result = updateHeader(table(), 2, "Group");
    expect(result.columns).toEqual(["Name", "Role", "Group"]);
    expect(result.rows).toEqual(table().rows);
  });

  it("is a no-op for out-of-range indices", () => {
    const input = table();
    expect(updateHeader(input, 3, "x")).toBe(input);
    expect(updateHeader(input, -1, "x")).toBe(input);
  });
});
