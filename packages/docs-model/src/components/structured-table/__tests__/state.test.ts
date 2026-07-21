"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { checkStateProps } from "../../validate";
import { StructuredTableState } from "../state";

const fixtureBlock = sampleFixture.blocks["table-1"] as DocBlock;

describe("structured-table state", () => {
  it("accepts the table fixture props", () => {
    expect(Value.Check(StructuredTableState, fixtureBlock.props)).toBe(true);
  });

  it("accepts marked span cells in rows and columns alongside plain strings", () => {
    const props = {
      columns: ["Name", [{ insert: "Config", attributes: { code: true } }]],
      rows: [
        [
          [
            { insert: "bold", attributes: { bold: true } },
            { insert: " rest" },
          ],
          "plain",
        ],
        ["a", [{ insert: "site", attributes: { link: "https://example.com" } }]],
      ],
    };
    expect(Value.Check(StructuredTableState, props)).toBe(true);
    expect(checkStateProps("structured-table", props)).toEqual([]);
  });

  it("rejects a reference attribute in a cell span", () => {
    const props = {
      columns: ["Name"],
      rows: [
        [
          [
            {
              insert: "x",
              attributes: { reference: { kind: "doc", path: "docs/a/doc.json" } },
            },
          ],
        ],
      ],
    };
    expect(Value.Check(StructuredTableState, props)).toBe(false);
  });

  it("rejects unknown span attributes and malformed mark values", () => {
    const base = { columns: ["Name"] };
    expect(
      Value.Check(StructuredTableState, {
        ...base,
        rows: [[[{ insert: "x", attributes: { underline: true } }]]],
      }),
    ).toBe(false);
    expect(
      Value.Check(StructuredTableState, {
        ...base,
        rows: [[[{ insert: "x", attributes: { bold: false } }]]],
      }),
    ).toBe(false);
    expect(
      Value.Check(StructuredTableState, {
        ...base,
        rows: [[[{ insert: "x", attributes: { link: "" } }]]],
      }),
    ).toBe(false);
  });

  it("rejects non-canonical unmarked span-array cells through checkStateProps", () => {
    const rowsIssue = checkStateProps("structured-table", {
      columns: ["Name", "Value"],
      rows: [["ok", "ok"], ["ok", [{ insert: "plain" }]]],
    });
    expect(rowsIssue).toHaveLength(1);
    expect(rowsIssue[0].path).toBe("$.op.props.rows[1][1]");

    const columnsIssue = checkStateProps("structured-table", {
      columns: [[{ insert: "Name", attributes: {} }]],
      rows: [],
    });
    expect(columnsIssue).toHaveLength(1);
    expect(columnsIssue[0].path).toBe("$.op.props.columns[0]");
  });

  it("rejects an unknown density", () => {
    expect(Value.Check(StructuredTableState, { ...fixtureBlock.props, density: "wide" })).toBe(false);
  });

  it("requires columns", () => {
    const { columns: _columns, ...withoutColumns } = fixtureBlock.props;
    expect(Value.Check(StructuredTableState, withoutColumns)).toBe(false);
  });

  it("rejects stray properties", () => {
    expect(Value.Check(StructuredTableState, { ...fixtureBlock.props, stray: true })).toBe(false);
  });
});
