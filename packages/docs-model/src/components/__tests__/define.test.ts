"use client";

import { describe, expect, it } from "bun:test";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { DOC_BLOCK_TYPES } from "../../doc-schema";
import type { BlockActionParamSpec } from "../compat";
import { collectRegistryIssues } from "../checks";
import { checkParams, deriveParamSpecs, schemaIssues } from "../define";
import type { ComponentAction, ComponentBundle } from "../types";

describe("schemaIssues", () => {
  it("maps JSON-pointer paths to repository issue paths", () => {
    const schema = Type.Object(
      {
        entries: Type.Array(
          Type.Object({ path: Type.String() }, { additionalProperties: false }),
        ),
      },
      { additionalProperties: false },
    );
    const issues = schemaIssues(Value.Errors(schema, { entries: [{ path: 42 }] }));
    expect(issues.some((issue) => issue.path === "$.params.entries[0].path")).toBe(true);
  });

  it("keeps an empty pointer at the base path", () => {
    expect(schemaIssues(Value.Errors(Type.String(), 42))[0]?.path).toBe("$.params");
  });

  it("maps missing required properties beneath the base path", () => {
    const schema = Type.Object({ name: Type.String() }, { additionalProperties: false });
    const issues = schemaIssues(Value.Errors(schema, {}));
    expect(issues.some((issue) => issue.path === "$.params.name")).toBe(true);
  });
});

describe("deriveParamSpecs", () => {
  it("reproduces file-tree.addEntry specs", () => {
    const schema = Type.Object(
      {
        path: Type.String({
          description: '/-separated path, no leading "./"; a trailing "/" marks an explicit directory.',
        }),
        note: Type.Optional(Type.String({ description: "Short annotation rendered after the path." })),
        change: Type.Optional(
          Type.Union(
            [Type.Literal("added"), Type.Literal("removed"), Type.Literal("modified"), Type.Literal("renamed")],
            { description: 'Change marker: "added" | "removed" | "modified" | "renamed".' },
          ),
        ),
      },
      { additionalProperties: false },
    );
    const expected: BlockActionParamSpec[] = [
      {
        name: "path",
        type: "string",
        required: true,
        description: '/-separated path, no leading "./"; a trailing "/" marks an explicit directory.',
      },
      { name: "note", type: "string", required: false, description: "Short annotation rendered after the path." },
      {
        name: "change",
        type: "string",
        required: false,
        description: 'Change marker: "added" | "removed" | "modified" | "renamed".',
      },
    ];
    expect(deriveParamSpecs(schema)).toEqual(expected);
  });

  it("resolves a nullable optional string to the non-null member", () => {
    const schema = Type.Object(
      {
        note: Type.Optional(
          Type.Union([Type.String(), Type.Null()], { description: "New note; pass null to clear." }),
        ),
      },
      { additionalProperties: false },
    );
    expect(deriveParamSpecs(schema)).toEqual([
      { name: "note", type: "string", required: false, description: "New note; pass null to clear." },
    ]);
  });

  it("reproduces structured-table.addRow specs", () => {
    const schema = Type.Object(
      {
        cells: Type.Array(Type.String(), { description: "Cell strings, in column order." }),
        index: Type.Optional(
          Type.Integer({ description: "Insert position in [0, rows.length]; default end." }),
        ),
      },
      { additionalProperties: false },
    );
    expect(deriveParamSpecs(schema)).toEqual([
      { name: "cells", type: "array", required: true, description: "Cell strings, in column order." },
      {
        name: "index",
        type: "number",
        required: false,
        description: "Insert position in [0, rows.length]; default end.",
      },
    ]);
  });

  it("reproduces interaction-surface.updateOperation specs", () => {
    const schema = Type.Object(
      {
        name: Type.String({ description: "Current operation name." }),
        patch: Type.Object({}, {
          additionalProperties: false,
          description: "Partial operation; patch.name renames, null clears.",
        }),
      },
      { additionalProperties: false },
    );
    expect(deriveParamSpecs(schema)).toEqual([
      { name: "name", type: "string", required: true, description: "Current operation name." },
      {
        name: "patch",
        type: "object",
        required: true,
        description: "Partial operation; patch.name renames, null clears.",
      },
    ]);
  });
});

describe("checkParams", () => {
  it("accepts conforming objects and rejects extra properties", () => {
    const params = Type.Object(
      { path: Type.String({ description: "Path." }) },
      { additionalProperties: false },
    );
    const action: ComponentAction<typeof params> = {
      action: "file-tree.addEntry",
      blockType: "file-tree",
      description: "Add an entry.",
      params,
      apply: () => ({ ok: true, props: {} }),
    };
    expect(checkParams(action, { path: "src/index.ts" })).toEqual([]);
    const issues = checkParams(action, { path: "src/index.ts", extra: true });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((issue) => issue.path === "$.params.extra")).toBe(true);
  });
});

describe("collectRegistryIssues", () => {
  it("reports every canonical type missing from an empty registry", () => {
    const issues = collectRegistryIssues([]);
    expect(issues).toHaveLength(14);
    for (const type of DOC_BLOCK_TYPES) {
      expect(issues.some((issue) => issue.includes(type))).toBe(true);
    }
  });

  it("accepts a synthetic minimal registry covering all canonical types", () => {
    const states = Object.fromEntries(
      DOC_BLOCK_TYPES.map((type) => [
        type,
        { schema: Type.Object({}, { additionalProperties: false }), carriesText: false },
      ]),
    ) as ComponentBundle["states"];
    const bundle: ComponentBundle = {
      manifest: {
        name: "synthetic",
        ownedTypes: DOC_BLOCK_TYPES,
        description: "Synthetic complete registry used by the boot-check smoke test.",
      },
      states,
      actions: [],
      agentView: () => null,
    };
    expect(collectRegistryIssues([bundle])).toEqual([]);
  });
});
