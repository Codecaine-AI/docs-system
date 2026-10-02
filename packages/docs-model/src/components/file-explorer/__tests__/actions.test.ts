"use client";

import { describe, expect, it } from "bun:test";
import type { Static, TObject } from "@sinclair/typebox";
import type { DocBlock } from "../../../doc-schema";
import { checkParams } from "../../define";
import type { ComponentActionResult, ComponentAction } from "../../types";
import { checkStateProps } from "../../validate";
import { addEntry } from "../actions/add-entry";
import { removeEntry } from "../actions/remove-entry";
import { updateEntry } from "../actions/update-entry";

function explorerBlock(): DocBlock {
  return {
    id: "fe",
    type: "file-explorer",
    props: {
      title: "Touched files",
      maxRows: 6,
      entries: [
        { path: "src/a.ts", note: "alpha", change: "added" },
        { path: "src/b.ts" },
        { path: "docs/" },
      ],
    },
    children: [],
  };
}

function run<P extends TObject>(
  action: ComponentAction<P>,
  block: DocBlock,
  params: Record<string, unknown>,
): ComponentActionResult {
  const before = JSON.stringify(block);
  const issues = checkParams(action, params);
  const result = issues.length > 0
    ? { ok: false as const, issues }
    : "apply" in action
      ? action.apply(block, params as Static<P>)
      : { ok: false as const, issues: [] };
  expect(JSON.stringify(block)).toBe(before);
  return result;
}

/** Ok results patch only `entries`, and the merged props still pass the state schema. */
function mustOk(result: ComponentActionResult, block = explorerBlock()): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected ok, got issues: ${JSON.stringify(result.issues)}`);
  expect(Object.keys(result.props)).toEqual(["entries"]);
  expect(checkStateProps("file-explorer", { ...block.props, ...result.props })).toEqual([]);
  return result.props;
}

function mustFail(result: ComponentActionResult, path: string, message?: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issues.map((issue) => issue.path)).toContain(path);
  if (message !== undefined) expect(result.issues).toContainEqual({ path, message });
}

describe("file-explorer.addEntry", () => {
  it("appends an entry with note and change badge", () => {
    const props = mustOk(run(addEntry, explorerBlock(), { path: "src/c.ts", note: "new", change: "added" }));
    expect((props.entries as unknown[]).at(-1)).toEqual({ path: "src/c.ts", note: "new", change: "added" });
    expect(props.entries as unknown[]).toHaveLength(4);
  });

  it("rejects a duplicate path", () => {
    mustFail(
      run(addEntry, explorerBlock(), { path: "src/a.ts" }),
      "$.params.path",
      'File-explorer entry "src/a.ts" already exists.',
    );
  });

  it.each(["./src/x.ts", "/src/x.ts", "src//x.ts"])("rejects the malformed path %s", (path) => {
    mustFail(run(addEntry, explorerBlock(), { path }), "$.params.path");
  });

  it("rejects an unknown change marker through checkParams", () => {
    mustFail(run(addEntry, explorerBlock(), { path: "src/c.ts", change: "edited" }), "$.params.change");
  });
});

describe("file-explorer.removeEntry", () => {
  it("removes the entry with the exact path", () => {
    const props = mustOk(run(removeEntry, explorerBlock(), { path: "src/b.ts" }));
    expect(props.entries).toEqual([{ path: "src/a.ts", note: "alpha", change: "added" }, { path: "docs/" }]);
  });

  it("rejects a missing entry", () => {
    mustFail(
      run(removeEntry, explorerBlock(), { path: "src/nope.ts" }),
      "$.params.path",
      'File-explorer entry "src/nope.ts" does not exist.',
    );
  });
});

describe("file-explorer.updateEntry", () => {
  it("renames in place and records the rename", () => {
    const props = mustOk(
      run(updateEntry, explorerBlock(), { path: "src/a.ts", newPath: "src/a2.ts", change: "renamed", from: "src/a.ts" }),
    );
    expect((props.entries as unknown[])[0]).toEqual({
      path: "src/a2.ts",
      note: "alpha",
      change: "renamed",
      from: "src/a.ts",
    });
  });

  it("clears note, change and from when null is passed", () => {
    const block = explorerBlock();
    block.props.entries = [{ path: "src/a.ts", note: "alpha", change: "renamed", from: "src/old-a.ts" }];
    const props = mustOk(run(updateEntry, block, { path: "src/a.ts", note: null, change: null, from: null }), block);
    expect(props.entries).toEqual([{ path: "src/a.ts" }]);
  });

  it("rejects a newPath collision and a malformed newPath", () => {
    mustFail(
      run(updateEntry, explorerBlock(), { path: "src/a.ts", newPath: "src/b.ts" }),
      "$.params.newPath",
      'File-explorer entry "src/b.ts" already exists.',
    );
    mustFail(run(updateEntry, explorerBlock(), { path: "src/a.ts", newPath: "./src/z.ts" }), "$.params.newPath");
  });

  it("rejects a missing entry", () => {
    mustFail(
      run(updateEntry, explorerBlock(), { path: "src/nope.ts", note: "x" }),
      "$.params.path",
      'File-explorer entry "src/nope.ts" does not exist.',
    );
  });
});
