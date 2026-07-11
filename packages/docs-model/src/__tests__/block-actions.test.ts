import { describe, expect, it } from "bun:test";
import { BLOCK_ACTIONS, getBlockAction, listBlockActions } from "..";
import type { BlockActionResult } from "..";
import type { DocBlock, DocBlockType } from "../doc-schema";

function makeBlock(type: DocBlockType, props: Record<string, unknown>): DocBlock {
  return { id: "b1", type, props, children: [] };
}

/** Runs an action and asserts the input block was NOT mutated. */
function run(action: string, block: DocBlock, params: Record<string, unknown>): BlockActionResult {
  const definition = getBlockAction(action);
  if (!definition) throw new Error(`Unknown action in test: ${action}`);
  const before = JSON.stringify(block);
  const result = definition.apply(block, params);
  expect(JSON.stringify(block)).toBe(before);
  return result;
}

function mustOk(result: BlockActionResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected ok, got issues: ${JSON.stringify(result.issues)}`);
  return result.props;
}

function mustFail(result: BlockActionResult, ...paths: string[]): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issues.length).toBeGreaterThan(0);
  for (const path of paths) {
    expect(result.issues.map((issue) => issue.path)).toContain(path);
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("block-actions registry", () => {
  it("keys every definition by its action string, shaped '<blockType>.<verb>'", () => {
    for (const [key, definition] of BLOCK_ACTIONS) {
      expect(definition.action).toBe(key);
      expect(key.startsWith(`${definition.blockType}.`)).toBe(true);
      expect(definition.description.length).toBeGreaterThan(0);
      expect(typeof definition.params).toBe("object");
      expect(definition.params.type).toBe("object");
      expect(typeof definition.params.properties).toBe("object");
      expect(Object.keys(definition.params.properties).length).toBeGreaterThan(0);
    }
  });

  it("exposes the full expected catalog", () => {
    expect([...BLOCK_ACTIONS.keys()].sort()).toEqual(
      [
        "file-tree.addEntry",
        "file-tree.removeEntry",
        "file-tree.updateEntry",
        "structured-table.addRow",
        "structured-table.removeRow",
        "structured-table.updateCell",
        "structured-table.addColumn",
        "structured-table.removeColumn",
        "interaction-surface.addOperation",
        "interaction-surface.updateOperation",
        "interaction-surface.removeOperation",
        "code.setAnnotation",
        "code.removeAnnotation",
      ].sort(),
    );
  });

  it("getBlockAction resolves known actions and returns undefined for unknown ones", () => {
    expect(getBlockAction("file-tree.addEntry")?.blockType).toBe("file-tree");
    expect(getBlockAction("file-tree.nope")).toBeUndefined();
  });

  it("listBlockActions filters by block type and returns everything unfiltered", () => {
    expect(listBlockActions().length).toBe(BLOCK_ACTIONS.size);
    const fileTree = listBlockActions("file-tree").map((d) => d.action);
    expect(fileTree.sort()).toEqual(["file-tree.addEntry", "file-tree.removeEntry", "file-tree.updateEntry"]);
    expect(listBlockActions("paragraph")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// file-tree
// ---------------------------------------------------------------------------

function fileTreeBlock(): DocBlock {
  return makeBlock("file-tree", {
    title: "Layout",
    entries: [
      { path: "src/a.ts", note: "alpha", change: "added" },
      { path: "src/b.ts" },
      { path: "docs/" },
    ],
  });
}

describe("file-tree.addEntry", () => {
  it("appends a new entry (stable ordering) with note and change", () => {
    const props = mustOk(
      run("file-tree.addEntry", fileTreeBlock(), { path: "src/c.ts", note: "new", change: "added" }),
    );
    expect(props.entries).toEqual([
      { path: "src/a.ts", note: "alpha", change: "added" },
      { path: "src/b.ts" },
      { path: "docs/" },
      { path: "src/c.ts", note: "new", change: "added" },
    ]);
  });

  it("accepts a trailing-/ explicit directory entry", () => {
    const props = mustOk(run("file-tree.addEntry", fileTreeBlock(), { path: "assets/" }));
    expect((props.entries as unknown[]).at(-1)).toEqual({ path: "assets/" });
  });

  it("rejects a duplicate path", () => {
    mustFail(run("file-tree.addEntry", fileTreeBlock(), { path: "src/a.ts" }), "$.params.path");
  });

  it("rejects a missing path param", () => {
    mustFail(run("file-tree.addEntry", fileTreeBlock(), {}), "$.params.path");
  });

  it('rejects a leading "./" path and an absolute path', () => {
    mustFail(run("file-tree.addEntry", fileTreeBlock(), { path: "./src/x.ts" }), "$.params.path");
    mustFail(run("file-tree.addEntry", fileTreeBlock(), { path: "/src/x.ts" }), "$.params.path");
  });

  it("rejects an unknown change marker", () => {
    mustFail(
      run("file-tree.addEntry", fileTreeBlock(), { path: "src/c.ts", change: "edited" }),
      "$.params.change",
    );
  });
});

describe("file-tree.removeEntry", () => {
  it("removes the entry with the given path", () => {
    const props = mustOk(run("file-tree.removeEntry", fileTreeBlock(), { path: "src/b.ts" }));
    expect(props.entries).toEqual([{ path: "src/a.ts", note: "alpha", change: "added" }, { path: "docs/" }]);
  });

  it("rejects a missing path", () => {
    mustFail(run("file-tree.removeEntry", fileTreeBlock(), { path: "src/nope.ts" }), "$.params.path");
  });
});

describe("file-tree.updateEntry", () => {
  it("patches note/change/from on the entry, in place", () => {
    const props = mustOk(
      run("file-tree.updateEntry", fileTreeBlock(), {
        path: "src/b.ts",
        note: "beta",
        change: "modified",
      }),
    );
    expect(props.entries).toEqual([
      { path: "src/a.ts", note: "alpha", change: "added" },
      { path: "src/b.ts", note: "beta", change: "modified" },
      { path: "docs/" },
    ]);
  });

  it("renames in place via newPath", () => {
    const props = mustOk(
      run("file-tree.updateEntry", fileTreeBlock(), {
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

  it("clears note/change/from when null is passed", () => {
    const props = mustOk(
      run("file-tree.updateEntry", fileTreeBlock(), { path: "src/a.ts", note: null, change: null }),
    );
    expect((props.entries as unknown[])[0]).toEqual({ path: "src/a.ts" });
  });

  it("rejects a newPath that collides with another entry", () => {
    mustFail(
      run("file-tree.updateEntry", fileTreeBlock(), { path: "src/a.ts", newPath: "src/b.ts" }),
      "$.params.newPath",
    );
  });

  it("rejects a missing path", () => {
    mustFail(run("file-tree.updateEntry", fileTreeBlock(), { path: "src/nope.ts", note: "x" }), "$.params.path");
  });
});

// ---------------------------------------------------------------------------
// structured-table
// ---------------------------------------------------------------------------

function tableBlock(): DocBlock {
  return makeBlock("structured-table", {
    title: "T",
    columns: ["Name", "Value"],
    rows: [
      ["answer", "42"],
      ["question", "unknown"],
    ],
  });
}

describe("structured-table.addRow", () => {
  it("appends at the end by default, padding cells to the column count", () => {
    const props = mustOk(run("structured-table.addRow", tableBlock(), { cells: ["only-name"] }));
    expect(props.rows).toEqual([
      ["answer", "42"],
      ["question", "unknown"],
      ["only-name", ""],
    ]);
  });

  it("truncates extra cells and honors an explicit index", () => {
    const props = mustOk(
      run("structured-table.addRow", tableBlock(), { cells: ["a", "b", "EXTRA"], index: 0 }),
    );
    expect(props.rows).toEqual([
      ["a", "b"],
      ["answer", "42"],
      ["question", "unknown"],
    ]);
  });

  it("rejects a non-array cells param and non-string cells", () => {
    mustFail(run("structured-table.addRow", tableBlock(), { cells: "nope" }), "$.params.cells");
    mustFail(run("structured-table.addRow", tableBlock(), { cells: ["ok", 42] }), "$.params.cells[1]");
  });

  it("rejects an out-of-range index", () => {
    mustFail(run("structured-table.addRow", tableBlock(), { cells: ["x"], index: 3 }), "$.params.index");
  });
});

describe("structured-table.removeRow", () => {
  it("removes the row at the index", () => {
    const props = mustOk(run("structured-table.removeRow", tableBlock(), { index: 0 }));
    expect(props.rows).toEqual([["question", "unknown"]]);
  });

  it("rejects an out-of-range or missing index", () => {
    mustFail(run("structured-table.removeRow", tableBlock(), { index: 2 }), "$.params.index");
    mustFail(run("structured-table.removeRow", tableBlock(), {}), "$.params.index");
  });
});

describe("structured-table.updateCell", () => {
  it("sets a cell addressed by column name", () => {
    const props = mustOk(
      run("structured-table.updateCell", tableBlock(), { rowIndex: 1, column: "Value", value: "43" }),
    );
    expect(props.rows).toEqual([
      ["answer", "42"],
      ["question", "43"],
    ]);
  });

  it("sets a cell addressed by columnIndex", () => {
    const props = mustOk(
      run("structured-table.updateCell", tableBlock(), { rowIndex: 0, columnIndex: 0, value: "ANSWER" }),
    );
    expect(props.rows).toEqual([
      ["ANSWER", "42"],
      ["question", "unknown"],
    ]);
  });

  it("rejects when both or neither of column/columnIndex are given", () => {
    mustFail(
      run("structured-table.updateCell", tableBlock(), { rowIndex: 0, column: "Name", columnIndex: 0, value: "x" }),
      "$.params.column",
    );
    mustFail(run("structured-table.updateCell", tableBlock(), { rowIndex: 0, value: "x" }), "$.params.column");
  });

  it("rejects an unknown column name and an out-of-range columnIndex", () => {
    mustFail(
      run("structured-table.updateCell", tableBlock(), { rowIndex: 0, column: "Nope", value: "x" }),
      "$.params.column",
    );
    mustFail(
      run("structured-table.updateCell", tableBlock(), { rowIndex: 0, columnIndex: 2, value: "x" }),
      "$.params.columnIndex",
    );
  });

  it("rejects an out-of-range rowIndex and a missing value", () => {
    mustFail(
      run("structured-table.updateCell", tableBlock(), { rowIndex: 5, column: "Name", value: "x" }),
      "$.params.rowIndex",
    );
    mustFail(
      run("structured-table.updateCell", tableBlock(), { rowIndex: 0, column: "Name" }),
      "$.params.value",
    );
  });
});

describe("structured-table.addColumn", () => {
  it("appends a column at the end, extending every row with the default fill \"\"", () => {
    const props = mustOk(run("structured-table.addColumn", tableBlock(), { name: "Notes" }));
    expect(props.columns).toEqual(["Name", "Value", "Notes"]);
    expect(props.rows).toEqual([
      ["answer", "42", ""],
      ["question", "unknown", ""],
    ]);
  });

  it("inserts at an explicit index with a custom fill", () => {
    const props = mustOk(
      run("structured-table.addColumn", tableBlock(), { name: "Id", index: 0, fill: "?" }),
    );
    expect(props.columns).toEqual(["Id", "Name", "Value"]);
    expect(props.rows).toEqual([
      ["?", "answer", "42"],
      ["?", "question", "unknown"],
    ]);
  });

  it("rejects a duplicate column name and an out-of-range index", () => {
    mustFail(run("structured-table.addColumn", tableBlock(), { name: "Name" }), "$.params.name");
    mustFail(run("structured-table.addColumn", tableBlock(), { name: "X", index: 5 }), "$.params.index");
  });
});

describe("structured-table.removeColumn", () => {
  it("removes a column by name, shrinking every row", () => {
    const props = mustOk(run("structured-table.removeColumn", tableBlock(), { column: "Name" }));
    expect(props.columns).toEqual(["Value"]);
    expect(props.rows).toEqual([["42"], ["unknown"]]);
  });

  it("removes a column by index", () => {
    const props = mustOk(run("structured-table.removeColumn", tableBlock(), { columnIndex: 1 }));
    expect(props.columns).toEqual(["Name"]);
    expect(props.rows).toEqual([["answer"], ["question"]]);
  });

  it("rejects when both or neither of column/columnIndex are given, or the column is unknown", () => {
    mustFail(
      run("structured-table.removeColumn", tableBlock(), { column: "Name", columnIndex: 0 }),
      "$.params.column",
    );
    mustFail(run("structured-table.removeColumn", tableBlock(), {}), "$.params.column");
    mustFail(run("structured-table.removeColumn", tableBlock(), { column: "Nope" }), "$.params.column");
  });
});

// ---------------------------------------------------------------------------
// interaction-surface
// ---------------------------------------------------------------------------

function surfaceBlock(): DocBlock {
  return makeBlock("interaction-surface", {
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
      { name: "file-tree.removeEntry", params: [{ name: "path", type: "string", required: true }] },
    ],
  });
}

function opNames(props: Record<string, unknown>): string[] {
  return (props.operations as Array<{ name: string }>).map((operation) => operation.name);
}

describe("interaction-surface.addOperation", () => {
  it("appends an operation with only the provided keys", () => {
    const props = mustOk(
      run("interaction-surface.addOperation", surfaceBlock(), {
        name: "file-tree.updateEntry",
        description: "Patch an entry in place",
        params: [{ name: "path", type: "string", required: true, description: "Exact path" }],
        returns: "props patch",
        kind: "action",
      }),
    );
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

  it("appends a minimal operation (name only)", () => {
    const props = mustOk(
      run("interaction-surface.addOperation", surfaceBlock(), { name: "file-tree.clear" }),
    );
    expect((props.operations as unknown[]).at(-1)).toEqual({ name: "file-tree.clear" });
  });

  it("rejects a duplicate name and a missing name", () => {
    mustFail(
      run("interaction-surface.addOperation", surfaceBlock(), { name: "file-tree.addEntry" }),
      "$.params.name",
    );
    mustFail(run("interaction-surface.addOperation", surfaceBlock(), {}), "$.params.name");
  });

  it("rejects an unknown kind", () => {
    mustFail(
      run("interaction-surface.addOperation", surfaceBlock(), { name: "x", kind: "mutation" }),
      "$.params.kind",
    );
  });

  it("rejects a malformed params array with precise element paths", () => {
    mustFail(
      run("interaction-surface.addOperation", surfaceBlock(), { name: "x", params: "nope" }),
      "$.params.params",
    );
    mustFail(
      run("interaction-surface.addOperation", surfaceBlock(), { name: "x", params: [{}] }),
      "$.params.params[0].name",
    );
    mustFail(
      run("interaction-surface.addOperation", surfaceBlock(), {
        name: "x",
        params: [{ name: "ok" }, { name: "bad", required: "yes" }],
      }),
      "$.params.params[1].required",
    );
    mustFail(
      run("interaction-surface.addOperation", surfaceBlock(), {
        name: "x",
        params: [{ name: "bad", type: 42 }],
      }),
      "$.params.params[0].type",
    );
  });
});

describe("interaction-surface.updateOperation", () => {
  it("patches operation attributes in place", () => {
    const props = mustOk(
      run("interaction-surface.updateOperation", surfaceBlock(), {
        name: "file-tree.removeEntry",
        patch: { description: "Remove the entry", returns: "props patch", kind: "action" },
      }),
    );
    expect((props.operations as unknown[])[1]).toEqual({
      name: "file-tree.removeEntry",
      description: "Remove the entry",
      params: [{ name: "path", type: "string", required: true }],
      returns: "props patch",
      kind: "action",
    });
  });

  it("renames via patch.name, keeping position", () => {
    const props = mustOk(
      run("interaction-surface.updateOperation", surfaceBlock(), {
        name: "file-tree.addEntry",
        patch: { name: "file-tree.appendEntry" },
      }),
    );
    expect(opNames(props)).toEqual(["file-tree.appendEntry", "file-tree.removeEntry"]);
  });

  it("replaces the params array wholesale when patched", () => {
    const props = mustOk(
      run("interaction-surface.updateOperation", surfaceBlock(), {
        name: "file-tree.addEntry",
        patch: { params: [{ name: "entry", type: "FileTreeEntry", required: true }] },
      }),
    );
    expect((props.operations as Array<{ params: unknown }>)[0].params).toEqual([
      { name: "entry", type: "FileTreeEntry", required: true },
    ]);
  });

  it("clears description/params/returns/kind when null is passed", () => {
    const props = mustOk(
      run("interaction-surface.updateOperation", surfaceBlock(), {
        name: "file-tree.addEntry",
        patch: { description: null, params: null, returns: null, kind: null },
      }),
    );
    expect((props.operations as unknown[])[0]).toEqual({ name: "file-tree.addEntry" });
  });

  it("rejects a rename collision", () => {
    mustFail(
      run("interaction-surface.updateOperation", surfaceBlock(), {
        name: "file-tree.addEntry",
        patch: { name: "file-tree.removeEntry" },
      }),
      "$.params.patch.name",
    );
  });

  it("rejects an unknown operation, a missing patch, and malformed patch fields", () => {
    mustFail(
      run("interaction-surface.updateOperation", surfaceBlock(), { name: "nope", patch: {} }),
      "$.params.name",
    );
    mustFail(
      run("interaction-surface.updateOperation", surfaceBlock(), { name: "file-tree.addEntry" }),
      "$.params.patch",
    );
    mustFail(
      run("interaction-surface.updateOperation", surfaceBlock(), {
        name: "file-tree.addEntry",
        patch: { kind: "mutation" },
      }),
      "$.params.patch.kind",
    );
    mustFail(
      run("interaction-surface.updateOperation", surfaceBlock(), {
        name: "file-tree.addEntry",
        patch: { description: 42 },
      }),
      "$.params.patch.description",
    );
    mustFail(
      run("interaction-surface.updateOperation", surfaceBlock(), {
        name: "file-tree.addEntry",
        patch: { params: [{ name: "" }] },
      }),
      "$.params.patch.params[0].name",
    );
  });
});

describe("interaction-surface.removeOperation", () => {
  it("removes the named operation", () => {
    const props = mustOk(
      run("interaction-surface.removeOperation", surfaceBlock(), { name: "file-tree.addEntry" }),
    );
    expect(opNames(props)).toEqual(["file-tree.removeEntry"]);
  });

  it("rejects an unknown operation and a missing name", () => {
    mustFail(
      run("interaction-surface.removeOperation", surfaceBlock(), { name: "nope" }),
      "$.params.name",
    );
    mustFail(run("interaction-surface.removeOperation", surfaceBlock(), {}), "$.params.name");
  });
});

// ---------------------------------------------------------------------------
// code (annotations only — the source stays on generic text ops)
// ---------------------------------------------------------------------------

function codeBlock(): DocBlock {
  return makeBlock("code", {
    language: "ts",
    annotations: [
      { lines: "1", label: "Export", note: "answer" },
      { lines: "2-3", note: "double" },
    ],
  });
}

describe("code.setAnnotation", () => {
  it("inserts a new annotation (appended)", () => {
    const props = mustOk(run("code.setAnnotation", codeBlock(), { lines: "5", note: "new", label: "L" }));
    expect(props.annotations).toEqual([
      { lines: "1", label: "Export", note: "answer" },
      { lines: "2-3", note: "double" },
      { lines: "5", note: "new", label: "L" },
    ]);
  });

  it("upserts in place when the exact lines key already exists (replacing the whole annotation)", () => {
    const props = mustOk(run("code.setAnnotation", codeBlock(), { lines: "1", note: "replaced" }));
    expect(props.annotations).toEqual([
      { lines: "1", note: "replaced" },
      { lines: "2-3", note: "double" },
    ]);
  });

  it("rejects a missing lines or note", () => {
    mustFail(run("code.setAnnotation", codeBlock(), { note: "x" }), "$.params.lines");
    mustFail(run("code.setAnnotation", codeBlock(), { lines: "1" }), "$.params.note");
  });
});

describe("code.removeAnnotation", () => {
  it("removes the annotation keyed by exact lines", () => {
    const props = mustOk(run("code.removeAnnotation", codeBlock(), { lines: "2-3" }));
    expect(props.annotations).toEqual([{ lines: "1", label: "Export", note: "answer" }]);
  });

  it("rejects an unknown lines key", () => {
    mustFail(run("code.removeAnnotation", codeBlock(), { lines: "9" }), "$.params.lines");
  });
});
