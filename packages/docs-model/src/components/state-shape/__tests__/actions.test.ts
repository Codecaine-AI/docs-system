"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkParams } from "../../define";
import type { ComponentActionResult, ComponentAction } from "../../types";
import { addField } from "../actions/add-field";
import { removeField } from "../actions/remove-field";
import { setExample } from "../actions/set-example";
import { updateField } from "../actions/update-field";

function shapeBlock(): DocBlock {
  return {
    id: "b1",
    type: "state-shape",
    props: {
      name: "InteractionSurfaceState",
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
    },
    children: [],
  };
}

function run(
  action: ComponentAction,
  block: DocBlock,
  params: Record<string, unknown>,
): ComponentActionResult {
  const before = JSON.stringify(block);
  const issues = checkParams(action, params);
  const result = issues.length > 0
    ? { ok: false as const, issues }
    : "apply" in action
      ? action.apply(block, params)
      : (() => { throw new Error("Expected a local action."); })();
  expect(JSON.stringify(block)).toBe(before);
  return result;
}

function mustOk(result: ComponentActionResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected ok, got issues: ${JSON.stringify(result.issues)}`);
  return result.props;
}

function mustFail(result: ComponentActionResult, path: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issues.map((issue) => issue.path)).toContain(path);
}

type FieldProps = {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
  fields?: FieldProps[];
};

function fieldNames(props: Record<string, unknown>): string[] {
  return (props.fields as FieldProps[]).map((field) => field.name);
}

describe("state-shape.addField component action", () => {
  it("appends to the root fields array when path is omitted", () => {
    const props = mustOk(run(addField, shapeBlock(), {
      field: { name: "source", type: "Source", required: false },
    }));
    expect(fieldNames(props)).toEqual(["title", "operations", "source"]);
    expect((props.fields as unknown[]).at(-1)).toEqual({
      name: "source",
      type: "Source",
      required: false,
    });
  });

  it('treats path "" as the root fields array', () => {
    const props = mustOk(run(addField, shapeBlock(), {
      field: { name: "source" },
      path: "",
    }));
    expect(fieldNames(props)).toEqual(["title", "operations", "source"]);
  });

  it("inserts at index under a nested parent path", () => {
    const props = mustOk(run(addField, shapeBlock(), {
      field: { name: "type", type: "string", fields: [{ name: "raw" }] },
      path: "operations.params",
      index: 0,
    }));
    const params = (props.fields as FieldProps[])[1].fields?.[1];
    expect(params?.fields?.map((field) => field.name)).toEqual(["type", "name"]);
    expect(params?.fields?.[0]).toEqual({ name: "type", type: "string", fields: [{ name: "raw" }] });
  });

  it("rejects a parent path that does not resolve", () => {
    mustFail(run(addField, shapeBlock(), {
      field: { name: "x" },
      path: "operations.nope",
    }), "$.params.path");
  });

  it("rejects a duplicate sibling name", () => {
    mustFail(run(addField, shapeBlock(), {
      field: { name: "name" },
      path: "operations",
    }), "$.params.field.name");
  });

  it("rejects duplicate names inside the provided subtree", () => {
    mustFail(run(addField, shapeBlock(), {
      field: { name: "x", fields: [{ name: "a" }, { name: "a" }] },
    }), "$.params.field.fields");
  });

  it("rejects an out-of-range index", () => {
    mustFail(run(addField, shapeBlock(), {
      field: { name: "x" },
      index: 3,
    }), "$.params.index");
  });

  it("rejects a malformed field at the precise path", () => {
    mustFail(run(addField, shapeBlock(), { field: {} }), "$.params.field.name");
  });

  it("rejects a malformed nested field at the precise path", () => {
    mustFail(
      run(addField, shapeBlock(), { field: { name: "x", fields: [{ stray: true }] } }),
      "$.params.field.fields[0].name",
    );
  });
});

describe("state-shape.updateField component action", () => {
  it("patches a nested field in place", () => {
    const props = mustOk(run(updateField, shapeBlock(), {
      path: "operations.params",
      patch: { type: "InteractionSurfaceParam[]", description: "Signature params" },
    }));
    const params = (props.fields as FieldProps[])[1].fields?.[1];
    expect(params).toEqual({
      name: "params",
      type: "InteractionSurfaceParam[]",
      required: false,
      description: "Signature params",
      fields: [{ name: "name", type: "string" }],
    });
  });

  it("renames in place", () => {
    const props = mustOk(run(updateField, shapeBlock(), {
      path: "title",
      patch: { name: "heading" },
    }));
    expect(fieldNames(props)).toEqual(["heading", "operations"]);
  });

  it("rejects a rename collision among siblings", () => {
    mustFail(run(updateField, shapeBlock(), {
      path: "title",
      patch: { name: "operations" },
    }), "$.params.patch.name");
  });

  it("clears type, required, and description with null", () => {
    const props = mustOk(run(updateField, shapeBlock(), {
      path: "operations",
      patch: { type: null, description: null },
    }));
    const operations = (props.fields as FieldProps[])[1];
    expect(operations).toEqual({
      name: "operations",
      fields: [
        { name: "name", type: "string" },
        { name: "params", type: "Param[]", required: false, fields: [{ name: "name", type: "string" }] },
      ],
    });
    const cleared = mustOk(run(updateField, shapeBlock(), {
      path: "title",
      patch: { required: null },
    }));
    expect((cleared.fields as unknown[])[0]).toEqual({ name: "title", type: "string" });
  });

  it("replaces the subtree via patch.fields", () => {
    const props = mustOk(run(updateField, shapeBlock(), {
      path: "operations",
      patch: { fields: [{ name: "kind", type: '"action" | "query" | "event"', required: false }] },
    }));
    expect((props.fields as FieldProps[])[1].fields).toEqual([
      { name: "kind", type: '"action" | "query" | "event"', required: false },
    ]);
  });

  it("removes the subtree via patch.fields null", () => {
    const props = mustOk(run(updateField, shapeBlock(), {
      path: "operations",
      patch: { fields: null },
    }));
    expect((props.fields as FieldProps[])[1]).toEqual({
      name: "operations",
      type: "Operation[]",
      description: "Operation signatures",
    });
  });

  it("rejects duplicate names inside a replacement subtree", () => {
    mustFail(run(updateField, shapeBlock(), {
      path: "operations",
      patch: { fields: [{ name: "a" }, { name: "a" }] },
    }), "$.params.patch.fields");
  });

  it("rejects a path that does not resolve", () => {
    mustFail(run(updateField, shapeBlock(), {
      path: "operations.nope",
      patch: {},
    }), "$.params.path");
  });
});

describe("state-shape.removeField component action", () => {
  it("removes a nested field and its subtree", () => {
    const props = mustOk(run(removeField, shapeBlock(), { path: "operations.params" }));
    expect((props.fields as FieldProps[])[1].fields).toEqual([{ name: "name", type: "string" }]);
  });

  it("removes a root field", () => {
    const props = mustOk(run(removeField, shapeBlock(), { path: "title" }));
    expect(fieldNames(props)).toEqual(["operations"]);
  });

  it("rejects a path that does not resolve", () => {
    mustFail(run(removeField, shapeBlock(), { path: "nope" }), "$.params.path");
  });
});

describe("state-shape.setExample component action", () => {
  it("sets the example verbatim when it parses as JSON", () => {
    const example = '{ "title": "Ops", "operations": [{ "name": "run" }] }';
    const props = mustOk(run(setExample, shapeBlock(), { example }));
    expect(props).toEqual({ example });
  });

  it("accepts a non-object JSON example", () => {
    const props = mustOk(run(setExample, shapeBlock(), { example: "[1, 2, 3]" }));
    expect(props).toEqual({ example: "[1, 2, 3]" });
  });

  it("clears the example with null", () => {
    const props = mustOk(run(setExample, shapeBlock(), { example: null }));
    expect(Object.keys(props)).toEqual(["example"]);
    expect(props.example).toBeUndefined();
  });

  it("rejects a string that does not parse as JSON", () => {
    mustFail(run(setExample, shapeBlock(), { example: '{ "title": ' }), "$.params.example");
  });

  it("rejects an empty string at the params schema", () => {
    mustFail(run(setExample, shapeBlock(), { example: "" }), "$.params.example");
  });

  it("rejects a missing example param", () => {
    mustFail(run(setExample, shapeBlock(), {}), "$.params.example");
  });
});
