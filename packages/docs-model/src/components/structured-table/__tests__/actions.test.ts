"use client";

import { describe, expect, it } from "bun:test";
import type { Static, TObject } from "@sinclair/typebox";
import type { DocBlock, DocValidationIssue } from "../../../doc-schema";
import { checkParams } from "../../define";
import type { ComponentActionResult, ComponentAction } from "../../types";
import { addColumn } from "../actions/add-column";
import { addRow } from "../actions/add-row";
import { removeColumn } from "../actions/remove-column";
import { removeRow } from "../actions/remove-row";
import { updateCell } from "../actions/update-cell";

function tableBlock(): DocBlock {
  return {
    id: "b1",
    type: "structured-table",
    props: {
      title: "T",
      columns: ["Name", "Value"],
      rows: [
        ["answer", "42"],
        ["question", "unknown"],
      ],
    },
    children: [],
  };
}

/** Mirrors the dispatcher and asserts that actions never mutate their input block. */
function run<P extends TObject>(
  action: ComponentAction<P>,
  block: DocBlock,
  params: Record<string, unknown>,
): ComponentActionResult {
  const before = JSON.stringify(block);
  const issues = checkParams(action, params);
  let result: ComponentActionResult;
  if (issues.length > 0) {
    result = { ok: false, issues };
  } else if ("apply" in action) {
    result = action.apply(block, params as Static<P>);
  } else {
    throw new Error(`Action ${action.action} cannot be applied locally.`);
  }
  expect(JSON.stringify(block)).toBe(before);
  return result;
}

function mustOk(result: ComponentActionResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected ok, got issues: ${JSON.stringify(result.issues)}`);
  return result.props;
}

function mustFail(result: ComponentActionResult, path: string): DocValidationIssue {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected action to fail.");
  expect(result.issues.length).toBeGreaterThan(0);
  const issue = result.issues.find((candidate) => candidate.path === path);
  expect(issue).toBeDefined();
  if (!issue) throw new Error(`Expected issue at ${path}.`);
  return issue;
}

describe("structured-table.addRow", () => {
  it("appends at the end by default, padding cells to the column count", () => {
    const props = mustOk(run(addRow, tableBlock(), { cells: ["only-name"] }));
    expect(props.rows).toEqual([
      ["answer", "42"],
      ["question", "unknown"],
      ["only-name", ""],
    ]);
  });

  it("truncates extra cells and honors an explicit index", () => {
    const props = mustOk(run(addRow, tableBlock(), { cells: ["a", "b", "EXTRA"], index: 0 }));
    expect(props.rows).toEqual([
      ["a", "b"],
      ["answer", "42"],
      ["question", "unknown"],
    ]);
  });

  it("parses markdown cells to spans and keeps plain cells plain", () => {
    const props = mustOk(run(addRow, tableBlock(), { cells: ["**a**", "plain"] }));
    expect(props.rows).toEqual([
      ["answer", "42"],
      ["question", "unknown"],
      [[{ insert: "a", attributes: { bold: true } }], "plain"],
    ]);
  });

  it("rejects a non-array cells param and non-string cells through the schema", () => {
    mustFail(run(addRow, tableBlock(), { cells: "nope" }), "$.params.cells");
    mustFail(run(addRow, tableBlock(), { cells: ["ok", 42] }), "$.params.cells[1]");
  });

  it("rejects an out-of-range index with the legacy domain message", () => {
    const issue = mustFail(run(addRow, tableBlock(), { cells: ["x"], index: 3 }), "$.params.index");
    expect(issue.message).toBe('"index" must be an integer in [0, 2].');
  });
});

describe("structured-table.removeRow", () => {
  it("removes the row at the index", () => {
    const props = mustOk(run(removeRow, tableBlock(), { index: 0 }));
    expect(props.rows).toEqual([["question", "unknown"]]);
  });

  it("rejects an out-of-range or missing index", () => {
    const issue = mustFail(run(removeRow, tableBlock(), { index: 2 }), "$.params.index");
    expect(issue.message).toBe('"index" must be an integer in [0, 1].');
    mustFail(run(removeRow, tableBlock(), {}), "$.params.index");
  });
});

describe("structured-table.updateCell", () => {
  it("sets a cell addressed by column name", () => {
    const props = mustOk(
      run(updateCell, tableBlock(), { rowIndex: 1, column: "Value", value: "43" }),
    );
    expect(props.rows).toEqual([
      ["answer", "42"],
      ["question", "43"],
    ]);
  });

  it("sets a cell addressed by columnIndex", () => {
    const props = mustOk(
      run(updateCell, tableBlock(), { rowIndex: 0, columnIndex: 0, value: "ANSWER" }),
    );
    expect(props.rows).toEqual([
      ["ANSWER", "42"],
      ["question", "unknown"],
    ]);
  });

  it("accepts an empty cell value", () => {
    const props = mustOk(
      run(updateCell, tableBlock(), { rowIndex: 0, column: "Value", value: "" }),
    );
    expect(props.rows).toEqual([
      ["answer", ""],
      ["question", "unknown"],
    ]);
  });

  it("rejects when both or neither of column/columnIndex are given", () => {
    const both = mustFail(
      run(updateCell, tableBlock(), {
        rowIndex: 0,
        column: "Name",
        columnIndex: 0,
        value: "x",
      }),
      "$.params.column",
    );
    expect(both.message).toBe('Provide exactly one of "column" or "columnIndex".');

    const neither = mustFail(
      run(updateCell, tableBlock(), { rowIndex: 0, value: "x" }),
      "$.params.column",
    );
    expect(neither.message).toBe('Provide exactly one of "column" or "columnIndex".');
  });

  it("rejects an empty or unknown column name", () => {
    const empty = mustFail(
      run(updateCell, tableBlock(), { rowIndex: 0, column: "", value: "x" }),
      "$.params.column",
    );
    expect(empty.message).toBe('"column" is required and must be a non-empty string.');

    const unknown = mustFail(
      run(updateCell, tableBlock(), { rowIndex: 0, column: "Nope", value: "x" }),
      "$.params.column",
    );
    expect(unknown.message).toBe('Unknown column "Nope". Columns: "Name", "Value".');
  });

  it("rejects an out-of-range columnIndex", () => {
    const issue = mustFail(
      run(updateCell, tableBlock(), { rowIndex: 0, columnIndex: 2, value: "x" }),
      "$.params.columnIndex",
    );
    expect(issue.message).toBe('"columnIndex" must be an integer in [0, 1].');
  });

  it("stores a markdown value as normalized spans", () => {
    const props = mustOk(
      run(updateCell, tableBlock(), { rowIndex: 0, column: "Value", value: "**42** exactly" }),
    );
    expect(props.rows).toEqual([
      ["answer", [{ insert: "42", attributes: { bold: true } }, { insert: " exactly" }]],
      ["question", "unknown"],
    ]);
  });

  it("stores a plain value as a plain string (existing plain tables stay plain)", () => {
    const props = mustOk(
      run(updateCell, tableBlock(), { rowIndex: 0, column: "Value", value: "still plain" }),
    );
    expect(props.rows).toEqual([
      ["answer", "still plain"],
      ["question", "unknown"],
    ]);
  });

  it("downgrades link-reference markdown to a plain link mark", () => {
    const props = mustOk(
      run(updateCell, tableBlock(), {
        rowIndex: 0,
        column: "Value",
        value: "[fn](src/foo.ts#L42)",
      }),
    );
    expect(props.rows).toEqual([
      ["answer", [{ insert: "fn", attributes: { link: "src/foo.ts#L42" } }]],
      ["question", "unknown"],
    ]);
  });

  it("addresses a marked column header by its plain-text name", () => {
    const block = tableBlock();
    block.props.columns = [
      [{ insert: "Name", attributes: { bold: true } }],
      "Value",
    ];
    const props = mustOk(run(updateCell, block, { rowIndex: 0, column: "Name", value: "x" }));
    expect(props.rows).toEqual([
      ["x", "42"],
      ["question", "unknown"],
    ]);
  });

  it("rejects an out-of-range rowIndex and a missing value", () => {
    const issue = mustFail(
      run(updateCell, tableBlock(), { rowIndex: 5, column: "Name", value: "x" }),
      "$.params.rowIndex",
    );
    expect(issue.message).toBe('"rowIndex" must be an integer in [0, 1].');
    mustFail(run(updateCell, tableBlock(), { rowIndex: 0, column: "Name" }), "$.params.value");
  });
});

describe("structured-table.addColumn", () => {
  it('appends a column at the end, extending every row with the default fill ""', () => {
    const props = mustOk(run(addColumn, tableBlock(), { name: "Notes" }));
    expect(props.columns).toEqual(["Name", "Value", "Notes"]);
    expect(props.rows).toEqual([
      ["answer", "42", ""],
      ["question", "unknown", ""],
    ]);
  });

  it("inserts at an explicit index with a custom fill", () => {
    const props = mustOk(run(addColumn, tableBlock(), { name: "Id", index: 0, fill: "?" }));
    expect(props.columns).toEqual(["Id", "Name", "Value"]);
    expect(props.rows).toEqual([
      ["?", "answer", "42"],
      ["?", "question", "unknown"],
    ]);
  });

  it("parses a markdown name and fill to spans", () => {
    const props = mustOk(run(addColumn, tableBlock(), { name: "`Id`", fill: "*n/a*" }));
    expect(props.columns).toEqual([
      "Name",
      "Value",
      [{ insert: "Id", attributes: { code: true } }],
    ]);
    expect(props.rows).toEqual([
      ["answer", "42", [{ insert: "n/a", attributes: { italic: true } }]],
      ["question", "unknown", [{ insert: "n/a", attributes: { italic: true } }]],
    ]);
  });

  it("rejects a duplicate column name", () => {
    const issue = mustFail(run(addColumn, tableBlock(), { name: "Name" }), "$.params.name");
    expect(issue.message).toBe('Column "Name" already exists.');
  });

  it("rejects a markdown name whose plain text duplicates an existing column", () => {
    mustFail(run(addColumn, tableBlock(), { name: "**Name**" }), "$.params.name");
  });

  it("rejects an out-of-range index", () => {
    const issue = mustFail(
      run(addColumn, tableBlock(), { name: "X", index: 5 }),
      "$.params.index",
    );
    expect(issue.message).toBe('"index" must be an integer in [0, 2].');
  });
});

describe("structured-table.removeColumn", () => {
  it("removes a column by name, shrinking every row", () => {
    const props = mustOk(run(removeColumn, tableBlock(), { column: "Name" }));
    expect(props.columns).toEqual(["Value"]);
    expect(props.rows).toEqual([["42"], ["unknown"]]);
  });

  it("removes a column by index", () => {
    const props = mustOk(run(removeColumn, tableBlock(), { columnIndex: 1 }));
    expect(props.columns).toEqual(["Name"]);
    expect(props.rows).toEqual([["answer"], ["question"]]);
  });

  it("rejects when both or neither of column/columnIndex are given", () => {
    const both = mustFail(
      run(removeColumn, tableBlock(), { column: "Name", columnIndex: 0 }),
      "$.params.column",
    );
    expect(both.message).toBe('Provide exactly one of "column" or "columnIndex".');

    const neither = mustFail(run(removeColumn, tableBlock(), {}), "$.params.column");
    expect(neither.message).toBe('Provide exactly one of "column" or "columnIndex".');
  });

  it("rejects an empty or unknown column name", () => {
    const empty = mustFail(run(removeColumn, tableBlock(), { column: "" }), "$.params.column");
    expect(empty.message).toBe('"column" is required and must be a non-empty string.');

    const unknown = mustFail(
      run(removeColumn, tableBlock(), { column: "Nope" }),
      "$.params.column",
    );
    expect(unknown.message).toBe('Unknown column "Nope". Columns: "Name", "Value".');
  });

  it("rejects an out-of-range columnIndex", () => {
    const issue = mustFail(
      run(removeColumn, tableBlock(), { columnIndex: 2 }),
      "$.params.columnIndex",
    );
    expect(issue.message).toBe('"columnIndex" must be an integer in [0, 1].');
  });
});
