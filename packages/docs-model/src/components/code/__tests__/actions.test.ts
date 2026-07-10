"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkParams } from "../../define";
import type { BlockActionResult, ComponentAction } from "../../types";
import { removeAnnotation } from "../actions/remove-annotation";
import { setAnnotation } from "../actions/set-annotation";

function codeBlock(): DocBlock {
  return {
    id: "b1",
    type: "code",
    props: {
      language: "ts",
      annotations: [
        { lines: "1", label: "Export", note: "answer" },
        { lines: "2-3", note: "double" },
      ],
    },
    children: [],
  };
}

function run(action: ComponentAction, block: DocBlock, params: Record<string, unknown>): BlockActionResult {
  const before = JSON.stringify(block);
  const issues = checkParams(action, params);
  const result = issues.length > 0
    ? { ok: false as const, issues }
    : "apply" in action
      ? action.apply(block, params as never)
      : { ok: false as const, issues: [] };
  expect(JSON.stringify(block)).toBe(before);
  return result;
}

function mustOk(result: BlockActionResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected ok, got issues: ${JSON.stringify(result.issues)}`);
  return result.props;
}

function mustFail(result: BlockActionResult, path: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issues.map((issue) => issue.path)).toContain(path);
}

describe("code.setAnnotation", () => {
  it("inserts a new annotation (appended)", () => {
    expect(mustOk(run(setAnnotation, codeBlock(), { lines: "5", note: "new", label: "L" })).annotations).toEqual([
      { lines: "1", label: "Export", note: "answer" },
      { lines: "2-3", note: "double" },
      { lines: "5", note: "new", label: "L" },
    ]);
  });

  it("upserts in place when the exact lines key exists", () => {
    expect(mustOk(run(setAnnotation, codeBlock(), { lines: "1", note: "replaced" })).annotations).toEqual([
      { lines: "1", note: "replaced" },
      { lines: "2-3", note: "double" },
    ]);
  });

  it("rejects missing and empty required params", () => {
    mustFail(run(setAnnotation, codeBlock(), { note: "x" }), "$.params.lines");
    mustFail(run(setAnnotation, codeBlock(), { lines: "1" }), "$.params.note");
    mustFail(run(setAnnotation, codeBlock(), { lines: "", note: "x" }), "$.params.lines");
    mustFail(run(setAnnotation, codeBlock(), { lines: "1", note: "" }), "$.params.note");
  });
});

describe("code.removeAnnotation", () => {
  it("removes the annotation keyed by exact lines", () => {
    expect(mustOk(run(removeAnnotation, codeBlock(), { lines: "2-3" })).annotations).toEqual([
      { lines: "1", label: "Export", note: "answer" },
    ]);
  });

  it("rejects an unknown or empty lines key", () => {
    const missing = run(removeAnnotation, codeBlock(), { lines: "9" });
    mustFail(missing, "$.params.lines");
    if (!missing.ok) expect(missing.issues[0]?.message).toBe('Code annotation for lines "9" does not exist.');
    mustFail(run(removeAnnotation, codeBlock(), { lines: "" }), "$.params.lines");
  });
});
