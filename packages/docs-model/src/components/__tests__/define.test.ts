"use client";

import { describe, expect, it } from "bun:test";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { DOC_BLOCK_TYPES } from "../../doc-schema";
import { collectRegistryIssues } from "../checks";
import { checkParams, schemaIssues } from "../define";
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

  it("deduplicates overlapping missing-property issues", () => {
    const schema = Type.Object(
      { rowIndex: Type.Integer(), value: Type.String() },
      { additionalProperties: false },
    );
    const issues = schemaIssues(Value.Errors(schema, {}));
    expect(issues).toHaveLength(2);
    expect(new Set(issues.map((issue) => issue.path))).toEqual(
      new Set(["$.params.rowIndex", "$.params.value"]),
    );
  });
});

describe("checkParams", () => {
  it("accepts conforming objects and ignores extra properties", () => {
    const params = Type.Object({ path: Type.String({ description: "Path." }) });
    const action: ComponentAction<typeof params> = {
      action: "file-tree.addEntry",
      blockType: "file-tree",
      description: "Add an entry.",
      params,
      apply: (_block, actionParams) => ({
        ok: true,
        props: { path: actionParams.path },
      }),
    };
    expect(checkParams(action, { path: "src/index.ts" })).toEqual([]);
    const supplied = { path: "src/index.ts", extra: true };
    expect(checkParams(action, supplied)).toEqual([]);
    if (!("apply" in action)) throw new Error("Expected a local action.");
    const result = action.apply(
      { id: "b1", type: "file-tree", props: {}, children: [] },
      supplied,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.props).toEqual({ path: "src/index.ts" });
    expect(result.props).not.toHaveProperty("extra");
  });
});

describe("collectRegistryIssues", () => {
  it("reports every canonical type missing from an empty registry", () => {
    const issues = collectRegistryIssues([]);
    expect(issues).toHaveLength(16);
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
