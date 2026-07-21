"use client";

import { describe, expect, it } from "bun:test";
import { printJsonLines } from "../json-lines";

describe("printJsonLines", () => {
  it("prints a flat object one entry per line with single-line ranges", () => {
    const { lines, ranges } = printJsonLines({ name: "title", type: "string", required: false });
    expect(lines).toEqual([
      "{",
      '  "name": "title",',
      '  "type": "string",',
      '  "required": false',
      "}",
    ]);
    expect(ranges).toEqual([
      { path: "name", start: 2, end: 2 },
      { path: "type", start: 3, end: 3 },
      { path: "required", start: 4, end: 4 },
    ]);
  });

  it("records spanning ranges for nested objects, key line through closing token", () => {
    const { lines, ranges } = printJsonLines({
      name: "StateShapeState",
      source: { path: "state.ts", symbol: "StateShapeState" },
    });
    expect(lines).toEqual([
      "{",
      '  "name": "StateShapeState",',
      '  "source": {',
      '    "path": "state.ts",',
      '    "symbol": "StateShapeState"',
      "  }",
      "}",
    ]);
    expect(ranges).toEqual([
      { path: "name", start: 2, end: 2 },
      { path: "source", start: 3, end: 6 },
      { path: "source.path", start: 4, end: 4 },
      { path: "source.symbol", start: 5, end: 5 },
    ]);
  });

  it("addresses arrays of objects with [i] indices and dot keys", () => {
    const { lines, ranges } = printJsonLines({
      fields: [{ name: "operations", fields: [{ name: "params", required: false }] }],
    });
    expect(lines).toEqual([
      "{",
      '  "fields": [',
      "    {",
      '      "name": "operations",',
      '      "fields": [',
      "        {",
      '          "name": "params",',
      '          "required": false',
      "        }",
      "      ]",
      "    }",
      "  ]",
      "}",
    ]);
    expect(ranges).toEqual([
      { path: "fields", start: 2, end: 12 },
      { path: "fields[0]", start: 3, end: 11 },
      { path: "fields[0].name", start: 4, end: 4 },
      { path: "fields[0].fields", start: 5, end: 10 },
      { path: "fields[0].fields[0]", start: 6, end: 9 },
      { path: "fields[0].fields[0].name", start: 7, end: 7 },
      { path: "fields[0].fields[0].required", start: 8, end: 8 },
    ]);
  });

  it("prints array elements of every primitive kind with escaped strings", () => {
    const { lines, ranges } = printJsonLines(["a \"quoted\"\nline", 4.5, true, null]);
    expect(lines).toEqual([
      "[",
      '  "a \\"quoted\\"\\nline",',
      "  4.5,",
      "  true,",
      "  null",
      "]",
    ]);
    expect(ranges).toEqual([
      { path: "[0]", start: 2, end: 2 },
      { path: "[1]", start: 3, end: 3 },
      { path: "[2]", start: 4, end: 4 },
      { path: "[3]", start: 5, end: 5 },
    ]);
  });

  it("prints root primitives as a single line with no ranges", () => {
    expect(printJsonLines("text")).toEqual({ lines: ['"text"'], ranges: [] });
    expect(printJsonLines(7)).toEqual({ lines: ["7"], ranges: [] });
    expect(printJsonLines(null)).toEqual({ lines: ["null"], ranges: [] });
  });

  it("keeps empty objects and arrays inline", () => {
    const { lines, ranges } = printJsonLines({ fields: [], source: {} });
    expect(lines).toEqual(["{", '  "fields": [],', '  "source": {}', "}"]);
    expect(ranges).toEqual([
      { path: "fields", start: 2, end: 2 },
      { path: "source", start: 3, end: 3 },
    ]);
    expect(printJsonLines({})).toEqual({ lines: ["{}"], ranges: [] });
    expect(printJsonLines([])).toEqual({ lines: ["[]"], ranges: [] });
  });

  it("matches JSON.stringify(value, null, 2) byte-for-byte on JSON values", () => {
    const values: unknown[] = [
      { name: "op", params: [{ name: "path", required: false }, "x", 1, null], nested: { a: {} } },
      [[], [{}], [1, [2, [3]]]],
      { "weird key.with[chars]": { "": true } },
      "plain",
      false,
    ];
    for (const value of values) {
      expect(printJsonLines(value).lines.join("\n")).toBe(JSON.stringify(value, null, 2));
    }
  });

  it("is deterministic: repeated calls produce identical bytes and ranges", () => {
    const value = {
      name: "InteractionSurfaceOperation",
      params: [{ name: "path" }, { name: "note", required: false }],
    };
    const first = printJsonLines(value);
    const second = printJsonLines(JSON.parse(JSON.stringify(value)));
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("lists ranges in document order, parents before their children", () => {
    const { ranges } = printJsonLines({ a: { b: [{ c: 1 }] }, d: 2 });
    const starts = ranges.map((range) => range.start);
    expect(starts).toEqual([...starts].sort((left, right) => left - right));
    expect(ranges.map((range) => range.path)).toEqual(["a", "a.b", "a.b[0]", "a.b[0].c", "d"]);
  });
});
