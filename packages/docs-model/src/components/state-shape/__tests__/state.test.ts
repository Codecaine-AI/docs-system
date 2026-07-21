"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { StateShapeState, stateShapeState } from "../state";

function shapeProps(): Record<string, unknown> {
  return {
    name: "InteractionSurfaceState",
    description: "Operation list block state.",
    source: {
      path: "packages/docs-model/src/components/interaction-surface/state.ts",
      symbol: "InteractionSurfaceState",
    },
    fields: [
      { name: "title", type: "string", required: false },
      {
        name: "operations",
        type: "Operation[]",
        description: "Operation signatures",
        fields: [
          { name: "name", type: "string" },
          {
            name: "params",
            type: "Param[]",
            required: false,
            fields: [{ name: "name", type: "string" }],
          },
        ],
      },
    ],
  };
}

describe("state-shape component state", () => {
  it("accepts a full recursive props object", () => {
    expect(Value.Check(StateShapeState, shapeProps())).toBe(true);
  });

  it("accepts the minimal props object", () => {
    expect(Value.Check(StateShapeState, { fields: [] })).toBe(true);
  });

  it("rejects a missing fields property", () => {
    expect(Value.Check(StateShapeState, { name: "X" })).toBe(false);
  });

  it("rejects a stray top-level property", () => {
    expect(Value.Check(StateShapeState, { ...shapeProps(), stray: true })).toBe(false);
  });

  it("rejects a stray source property", () => {
    const props = shapeProps();
    props.source = { path: "a.ts", stray: true };
    expect(Value.Check(StateShapeState, props)).toBe(false);
  });

  it("rejects a stray property on a nested field", () => {
    const props = shapeProps();
    (props.fields as Array<Record<string, unknown>>)[1] = {
      name: "operations",
      fields: [{ name: "name", stray: true }],
    };
    expect(Value.Check(StateShapeState, props)).toBe(false);
  });

  it("rejects a field missing its name at any depth", () => {
    const props = shapeProps();
    (props.fields as Array<Record<string, unknown>>)[0] = {
      name: "title",
      fields: [{ type: "string" }],
    };
    expect(Value.Check(StateShapeState, props)).toBe(false);
  });

  it("reports duplicate sibling field names via the custom check", () => {
    const props = {
      fields: [
        { name: "title" },
        { name: "operations", fields: [{ name: "name" }, { name: "name" }] },
      ],
    };
    expect(Value.Check(StateShapeState, props)).toBe(true);
    expect(stateShapeState.check?.(props, "$.op.props")).toEqual([
      {
        path: "$.op.props.fields[1].fields[1].name",
        message: 'Duplicate sibling field name "name".',
      },
    ]);
  });

  it("passes the custom check when names repeat only across levels", () => {
    const props = shapeProps();
    expect(stateShapeState.check?.(props, "$.op.props")).toEqual([]);
  });

  it("accepts a JSON example string", () => {
    const props = { ...shapeProps(), example: '{ "title": "Ops", "operations": [] }' };
    expect(Value.Check(StateShapeState, props)).toBe(true);
    expect(stateShapeState.check?.(props, "$.op.props")).toEqual([]);
  });

  it("rejects an empty example string at the schema", () => {
    expect(Value.Check(StateShapeState, { fields: [], example: "" })).toBe(false);
  });

  it("rejects a non-string example at the schema", () => {
    expect(Value.Check(StateShapeState, { fields: [], example: { title: "Ops" } })).toBe(false);
  });

  it("reports an example that does not parse as JSON via the custom check", () => {
    const props = { fields: [], example: '{ "title": ' };
    expect(Value.Check(StateShapeState, props)).toBe(true);
    expect(stateShapeState.check?.(props, "$.op.props")).toEqual([
      {
        path: "$.op.props.example",
        message: "example does not parse as JSON.",
      },
    ]);
  });
});
