"use client";

import { describe, expect, it } from "bun:test";
import type { Static, TObject } from "@sinclair/typebox";
import type { DocBlock } from "../../../doc-schema";
import { checkParams } from "../../define";
import type { ComponentActionResult, ComponentAction } from "../../types";
import { addEntry } from "../actions/add-entry";
import { removeEntry } from "../actions/remove-entry";
import { updateEntry } from "../actions/update-entry";

function fileTreeBlock(): DocBlock {
  return {
    id: "b1",
    type: "file-tree",
    props: {
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

function mustOk(result: ComponentActionResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected ok, got issues: ${JSON.stringify(result.issues)}`);
  return result.props;
}

function mustFail(
  result: ComponentActionResult,
  path: string,
  message?: string,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issues.map((issue) => issue.path)).toContain(path);
  if (message !== undefined) {
    expect(result.issues).toContainEqual({ path, message });
  }
}

describe("file-tree.addEntry", () => {
  it("appends a new entry with stable ordering, note, and change", () => {
    const props = mustOk(
      run(addEntry, fileTreeBlock(), { path: "src/c.ts", note: "new", change: "added" }),
    );
    expect(props.entries).toEqual([
      { path: "src/a.ts", note: "alpha", change: "added" },
      { path: "src/b.ts" },
      { path: "docs/" },
      { path: "src/c.ts", note: "new", change: "added" },
    ]);
  });

  it("accepts a trailing-slash explicit directory entry", () => {
    const props = mustOk(run(addEntry, fileTreeBlock(), { path: "assets/" }));
    expect((props.entries as unknown[]).at(-1)).toEqual({ path: "assets/" });
  });

  it("rejects a duplicate path", () => {
    mustFail(
      run(addEntry, fileTreeBlock(), { path: "src/a.ts" }),
      "$.params.path",
      'File-tree entry "src/a.ts" already exists.',
    );
  });

  it("rejects all three invalid path grammar forms with legacy messages", () => {
    mustFail(
      run(addEntry, fileTreeBlock(), { path: "./src/x.ts" }),
      "$.params.path",
      'File-tree paths must not start with "./": "./src/x.ts".',
    );
    mustFail(
      run(addEntry, fileTreeBlock(), { path: "/src/x.ts" }),
      "$.params.path",
      'File-tree paths are relative (no leading "/"): "/src/x.ts".',
    );
    mustFail(
      run(addEntry, fileTreeBlock(), { path: "src//x.ts" }),
      "$.params.path",
      'File-tree path has empty segments: "src//x.ts".',
    );
  });

  it("rejects a missing path and an unknown change marker through checkParams", () => {
    mustFail(run(addEntry, fileTreeBlock(), {}), "$.params.path");
    mustFail(
      run(addEntry, fileTreeBlock(), { path: "src/c.ts", change: "edited" }),
      "$.params.change",
    );
  });
});

describe("file-tree.removeEntry", () => {
  it("removes the entry with the given path", () => {
    const props = mustOk(run(removeEntry, fileTreeBlock(), { path: "src/b.ts" }));
    expect(props.entries).toEqual([
      { path: "src/a.ts", note: "alpha", change: "added" },
      { path: "docs/" },
    ]);
  });

  it("rejects a missing entry", () => {
    mustFail(
      run(removeEntry, fileTreeBlock(), { path: "src/nope.ts" }),
      "$.params.path",
      'File-tree entry "src/nope.ts" does not exist.',
    );
  });
});

describe("file-tree.updateEntry", () => {
  it("patches note, change, and from in place", () => {
    const props = mustOk(
      run(updateEntry, fileTreeBlock(), {
        path: "src/b.ts",
        note: "beta",
        change: "renamed",
        from: "src/old-b.ts",
      }),
    );
    expect(props.entries).toEqual([
      { path: "src/a.ts", note: "alpha", change: "added" },
      { path: "src/b.ts", note: "beta", change: "renamed", from: "src/old-b.ts" },
      { path: "docs/" },
    ]);
  });

  it("clears note, change, and from when null is passed", () => {
    const block = fileTreeBlock();
    block.props.entries = [
      { path: "src/a.ts", note: "alpha", change: "renamed", from: "src/old-a.ts" },
      { path: "src/b.ts" },
      { path: "docs/" },
    ];
    const props = mustOk(
      run(updateEntry, block, { path: "src/a.ts", note: null, change: null, from: null }),
    );
    expect((props.entries as unknown[])[0]).toEqual({ path: "src/a.ts" });
  });

  it("renames in place via newPath", () => {
    const props = mustOk(
      run(updateEntry, fileTreeBlock(), {
        path: "src/a.ts",
        newPath: "src/a2.ts",
        change: "renamed",
        from: "src/a.ts",
      }),
    );
    expect((props.entries as unknown[])[0]).toEqual({
      path: "src/a2.ts",
      note: "alpha",
      change: "renamed",
      from: "src/a.ts",
    });
  });

  it("rejects a newPath collision", () => {
    mustFail(
      run(updateEntry, fileTreeBlock(), { path: "src/a.ts", newPath: "src/b.ts" }),
      "$.params.newPath",
      'File-tree entry "src/b.ts" already exists.',
    );
  });

  it("rejects an empty newPath in the domain validator", () => {
    mustFail(
      run(updateEntry, fileTreeBlock(), { path: "src/a.ts", newPath: "" }),
      "$.params.newPath",
      'File-tree path has empty segments: "".',
    );
  });

  it("rejects a missing entry", () => {
    mustFail(
      run(updateEntry, fileTreeBlock(), { path: "src/nope.ts", note: "x" }),
      "$.params.path",
      'File-tree entry "src/nope.ts" does not exist.',
    );
  });
});
