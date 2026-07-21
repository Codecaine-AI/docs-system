"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkParams } from "../../define";
import type { ComponentActionResult, ComponentAction } from "../../types";
import { addOperation } from "../actions/add-operation";
import { removeOperation } from "../actions/remove-operation";
import { updateOperation } from "../actions/update-operation";

function surfaceBlock(): DocBlock {
  return {
    id: "b1",
    type: "interaction-surface",
    props: {
      title: "File-tree block surface",
      operations: [
        {
          name: "file-tree.addEntry",
          description: "Append a path entry",
          params: [
            { name: "path", type: "string", required: true },
            { name: "note", type: "string", required: false },
          ],
          returns: "props patch",
          kind: "action",
        },
        {
          name: "file-tree.removeEntry",
          params: [{ name: "path", type: "string", required: true }],
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

function opNames(props: Record<string, unknown>): string[] {
  return (props.operations as Array<{ name: string }>).map((operation) => operation.name);
}

describe("interaction-surface.addOperation component action", () => {
  it("appends an operation with only the provided keys", () => {
    const props = mustOk(run(addOperation, surfaceBlock(), {
      name: "file-tree.updateEntry",
      description: "Patch an entry in place",
      params: [{ name: "path", type: "string", required: true, description: "Exact path" }],
      returns: "props patch",
      kind: "action",
    }));
    expect(opNames(props)).toEqual([
      "file-tree.addEntry",
      "file-tree.removeEntry",
      "file-tree.updateEntry",
    ]);
    expect((props.operations as unknown[]).at(-1)).toEqual({
      name: "file-tree.updateEntry",
      description: "Patch an entry in place",
      params: [{ name: "path", type: "string", required: true, description: "Exact path" }],
      returns: "props patch",
      kind: "action",
    });
  });

  it("appends an operation with nested param fields verbatim", () => {
    const props = mustOk(run(addOperation, surfaceBlock(), {
      name: "state-shape.addField",
      params: [
        {
          name: "field",
          type: "Field",
          fields: [
            { name: "name", type: "string" },
            { name: "fields", type: "Field[]", required: false, fields: [{ name: "name" }] },
          ],
        },
      ],
    }));
    expect((props.operations as unknown[]).at(-1)).toEqual({
      name: "state-shape.addField",
      params: [
        {
          name: "field",
          type: "Field",
          fields: [
            { name: "name", type: "string" },
            { name: "fields", type: "Field[]", required: false, fields: [{ name: "name" }] },
          ],
        },
      ],
    });
  });

  it("rejects a duplicate name", () => {
    mustFail(run(addOperation, surfaceBlock(), { name: "file-tree.addEntry" }), "$.params.name");
  });

  it("rejects a malformed param element at the precise path", () => {
    mustFail(
      run(addOperation, surfaceBlock(), { name: "x", params: [{}] }),
      "$.params.params[0].name",
    );
  });

  it("rejects an unknown kind", () => {
    mustFail(run(addOperation, surfaceBlock(), { name: "x", kind: "mutation" }), "$.params.kind");
  });
});

describe("interaction-surface.updateOperation component action", () => {
  it("patches an operation description in place", () => {
    const props = mustOk(run(updateOperation, surfaceBlock(), {
      name: "file-tree.removeEntry",
      patch: { description: "Remove the entry" },
    }));
    expect((props.operations as unknown[])[1]).toEqual({
      name: "file-tree.removeEntry",
      description: "Remove the entry",
      params: [{ name: "path", type: "string", required: true }],
    });
  });

  it("clears description, params, returns, and kind with null", () => {
    const props = mustOk(run(updateOperation, surfaceBlock(), {
      name: "file-tree.addEntry",
      patch: { description: null, params: null, returns: null, kind: null },
    }));
    expect((props.operations as unknown[])[0]).toEqual({ name: "file-tree.addEntry" });
  });

  it("renames in place", () => {
    const props = mustOk(run(updateOperation, surfaceBlock(), {
      name: "file-tree.addEntry",
      patch: { name: "file-tree.appendEntry" },
    }));
    expect(opNames(props)).toEqual(["file-tree.appendEntry", "file-tree.removeEntry"]);
  });

  it("rejects a rename collision", () => {
    mustFail(run(updateOperation, surfaceBlock(), {
      name: "file-tree.addEntry",
      patch: { name: "file-tree.removeEntry" },
    }), "$.params.patch.name");
  });

  it("replaces params with a nested field tree", () => {
    const props = mustOk(run(updateOperation, surfaceBlock(), {
      name: "file-tree.removeEntry",
      patch: {
        params: [
          { name: "target", type: "Entry", fields: [{ name: "path", type: "string" }] },
        ],
      },
    }));
    expect((props.operations as unknown[])[1]).toEqual({
      name: "file-tree.removeEntry",
      params: [
        { name: "target", type: "Entry", fields: [{ name: "path", type: "string" }] },
      ],
    });
  });

  it("rejects a malformed patch params element at the precise path", () => {
    mustFail(run(updateOperation, surfaceBlock(), {
      name: "file-tree.addEntry",
      patch: { params: [{}] },
    }), "$.params.patch.params[0].name");
  });

  it("rejects a missing operation", () => {
    mustFail(run(updateOperation, surfaceBlock(), { name: "nope", patch: {} }), "$.params.name");
  });
});

describe("interaction-surface.removeOperation component action", () => {
  it("removes an existing operation", () => {
    const props = mustOk(run(removeOperation, surfaceBlock(), { name: "file-tree.addEntry" }));
    expect(opNames(props)).toEqual(["file-tree.removeEntry"]);
  });

  it("rejects a missing operation", () => {
    mustFail(run(removeOperation, surfaceBlock(), { name: "nope" }), "$.params.name");
  });
});
