"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import * as callStack from "../../call-stack";
import * as componentTree from "../../component-tree";
import { checkParams } from "../../define";
import type { ComponentAction, ComponentActionResult } from "../../types";

function run(action: ComponentAction, block: DocBlock, params: Record<string, unknown>): ComponentActionResult {
  const before = JSON.stringify(block);
  const issues = checkParams(action, params);
  if (issues.length > 0) return { ok: false, issues };
  if (!("apply" in action)) throw new Error("Expected a local action.");
  const result = action.apply(block, params as never);
  expect(JSON.stringify(block)).toBe(before);
  return result;
}

function mustOk(result: ComponentActionResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected ok, got issues: ${JSON.stringify(result.issues)}`);
  return result.props;
}

function issuePaths(result: ComponentActionResult): string[] {
  if (result.ok) throw new Error("Expected issues");
  return result.issues.map((issue) => issue.path);
}

const csBlock = (): DocBlock => ({
  id: "cs",
  type: "call-stack",
  props: {
    frames: [
      {
        text: "runDaemon()",
        source: "src/daemon.ts:7",
        frames: [
          { text: "start()", comment: "boot", change: "added" },
          { text: "!ready", kind: "branch", frames: [{ text: "exit(1)" }] },
        ],
      },
      { text: "shutdown()" },
    ],
  },
  children: [],
});

const ctBlock = (): DocBlock => ({
  id: "ct",
  type: "component-tree",
  props: { nodes: [{ text: "<DocPage>", nodes: [{ text: "useDoc()", kind: "hook" }] }] },
  children: [],
});

describe("call-stack row actions", () => {
  it("insertRow inserts at a root position and under a nested row", () => {
    const root = mustOk(run(callStack.insertRow, csBlock(), { path: [2], row: { text: "flush()" } }));
    expect((root.frames as { text: string }[]).map((f) => f.text)).toEqual(["runDaemon()", "shutdown()", "flush()"]);

    const nested = mustOk(
      run(callStack.insertRow, csBlock(), {
        path: [0, 1, 0],
        row: { text: "log()", kind: "call", frames: [{ text: "write()" }] },
      }),
    );
    expect(nested.frames).toEqual([
      {
        text: "runDaemon()",
        source: "src/daemon.ts:7",
        frames: [
          { text: "start()", comment: "boot", change: "added" },
          {
            text: "!ready",
            kind: "branch",
            frames: [{ text: "log()", kind: "call", frames: [{ text: "write()" }] }, { text: "exit(1)" }],
          },
        ],
      },
      { text: "shutdown()" },
    ]);
  });

  it("insertRow rejects an unresolved path, an out-of-range position and an invalid row", () => {
    expect(issuePaths(run(callStack.insertRow, csBlock(), { path: [5, 0], row: { text: "x" } }))).toEqual(["$.params.path"]);
    expect(issuePaths(run(callStack.insertRow, csBlock(), { path: [0, 9], row: { text: "x" } }))).toEqual(["$.params.path"]);
    expect(issuePaths(run(callStack.insertRow, csBlock(), { path: [0], row: { text: "x", kind: "hook" } }))).toContain("$.params.row.kind");
    expect(issuePaths(run(callStack.insertRow, csBlock(), { path: [0], row: { text: "x", nodes: [] } }))).toContain("$.params.row.nodes");
  });

  it("updateRow patches fields, null clears them, children stay", () => {
    const props = mustOk(
      run(callStack.updateRow, csBlock(), {
        path: [0, 0],
        patch: { text: "begin()", comment: null, change: "modified", source: "a.ts:1" },
      }),
    );
    const frames = props.frames as { frames: unknown[] }[];
    expect(frames[0].frames[0]).toEqual({ text: "begin()", change: "modified", source: "a.ts:1" });

    const cleared = mustOk(run(callStack.updateRow, csBlock(), { path: [0, 1], patch: { kind: null } }));
    expect((cleared.frames as { frames: unknown[] }[])[0].frames[1]).toEqual({ text: "!ready", frames: [{ text: "exit(1)" }] });
  });

  it("updateRow rejects bad paths, unknown kinds and empty patches", () => {
    expect(issuePaths(run(callStack.updateRow, csBlock(), { path: [1, 0], patch: { text: "x" } }))).toEqual(["$.params.path"]);
    expect(issuePaths(run(callStack.updateRow, csBlock(), { path: [0], patch: { kind: "hook" } }))).toContain("$.params.patch.kind");
    expect(run(callStack.updateRow, csBlock(), { path: [0], patch: {} }).ok).toBe(false);
    expect(issuePaths(run(callStack.updateRow, csBlock(), { path: [0], patch: { text: "" } }))).toContain("$.params.patch.text");
  });

  it("removeRow removes a row with its subtree", () => {
    const props = mustOk(run(callStack.removeRow, csBlock(), { path: [0, 1] }));
    expect((props.frames as { frames: unknown[] }[])[0].frames).toEqual([{ text: "start()", comment: "boot", change: "added" }]);
    expect(issuePaths(run(callStack.removeRow, csBlock(), { path: [0, 5] }))).toEqual(["$.params.path"]);
    expect(run(callStack.removeRow, csBlock(), { path: [] }).ok).toBe(false);
  });

  it("moveRow interprets `to` after removal", () => {
    const props = mustOk(run(callStack.moveRow, csBlock(), { from: [1], to: [0, 1, 1] }));
    expect(props.frames).toEqual([
      {
        text: "runDaemon()",
        source: "src/daemon.ts:7",
        frames: [
          { text: "start()", comment: "boot", change: "added" },
          { text: "!ready", kind: "branch", frames: [{ text: "exit(1)" }, { text: "shutdown()" }] },
        ],
      },
    ]);
    // [0, 1] moved to the root end: after removal the root has 2 rows.
    const hoisted = mustOk(run(callStack.moveRow, csBlock(), { from: [0, 1], to: [2] }));
    expect((hoisted.frames as { text: string }[]).map((f) => f.text)).toEqual(["runDaemon()", "shutdown()", "!ready"]);
    expect(issuePaths(run(callStack.moveRow, csBlock(), { from: [9], to: [0] }))).toEqual(["$.params.from"]);
    expect(issuePaths(run(callStack.moveRow, csBlock(), { from: [1], to: [1, 0] }))).toEqual(["$.params.to"]);
    expect(issuePaths(run(callStack.moveRow, csBlock(), { from: [1], to: [5] }))).toEqual(["$.params.to"]);
  });

  it("setRows replaces the tree and validates rows", () => {
    const rows = [{ text: "main()", frames: [{ text: "?ok", kind: "branch" }] }];
    expect(mustOk(run(callStack.setRows, csBlock(), { rows }))).toEqual({ frames: rows });
    expect(mustOk(run(callStack.setRows, csBlock(), { rows: [] }))).toEqual({ frames: [] });
    expect(issuePaths(run(callStack.setRows, csBlock(), { rows: [{ text: "" }] }))).toContain("$.params.rows[0].text");
  });
});

describe("component-tree row actions", () => {
  it("edits nodes with the component-tree kind vocabulary", () => {
    const inserted = mustOk(
      run(componentTree.insertRow, ctBlock(), { path: [0, 1], row: { text: "<CodeBlock />", kind: "component", change: "added" } }),
    );
    expect(inserted).toEqual({
      nodes: [{ text: "<DocPage>", nodes: [{ text: "useDoc()", kind: "hook" }, { text: "<CodeBlock />", kind: "component", change: "added" }] }],
    });
    expect(issuePaths(run(componentTree.insertRow, ctBlock(), { path: [0], row: { text: "x", kind: "call" } }))).toContain("$.params.row.kind");

    const updated = mustOk(run(componentTree.updateRow, ctBlock(), { path: [0, 0], patch: { kind: null, comment: "reads doc" } }));
    expect(updated).toEqual({ nodes: [{ text: "<DocPage>", nodes: [{ text: "useDoc()", comment: "reads doc" }] }] });

    expect(mustOk(run(componentTree.moveRow, ctBlock(), { from: [0, 0], to: [0] }))).toEqual({
      nodes: [{ text: "useDoc()", kind: "hook" }, { text: "<DocPage>" }],
    });
    expect(mustOk(run(componentTree.removeRow, ctBlock(), { path: [0] }))).toEqual({ nodes: [] });
    expect(issuePaths(run(componentTree.setRows, ctBlock(), { rows: [{ text: "x", frames: [] }] }))).toContain("$.params.rows[0].frames");
  });

  it("registers the five actions on each bundle", () => {
    const names = (bundle: { actions: readonly ComponentAction[] }) => bundle.actions.map((action) => action.action).sort();
    expect(names(callStack.callStackComponent)).toEqual(
      ["insertRow", "moveRow", "removeRow", "setRows", "updateRow"].map((verb) => `call-stack.${verb}`),
    );
    expect(names(componentTree.componentTreeComponent)).toEqual(
      ["insertRow", "moveRow", "removeRow", "setRows", "updateRow"].map((verb) => `component-tree.${verb}`),
    );
  });
});
