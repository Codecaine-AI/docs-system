"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkParams } from "../../define";
import type { ComponentAction, ComponentActionResult } from "../../types";
import { stackComponent } from "..";
import { addNode } from "../actions/add-node";
import { moveNode } from "../actions/move-node";
import { removeBoundary } from "../actions/remove-boundary";
import { removeNode } from "../actions/remove-node";
import { setBoundary } from "../actions/set-boundary";
import { updateNode } from "../actions/update-node";

function stackBlock(): DocBlock {
  return {
    id: "b1",
    type: "stack",
    props: {
      nodes: [
        { name: "Hosts", uses: "imports" },
        {
          name: "Framework",
          color: "blue",
          children: [
            { name: "docs-editor", uses: true },
            { name: "docs-model", badge: "pure" },
          ],
        },
        { name: "Storage" },
      ],
      boundaries: [
        { after: "Hosts", rule: "no host imports" },
        { after: "docs-editor", rule: "no React below" },
      ],
    },
    children: [],
  };
}

function run(action: ComponentAction, block: DocBlock, params: Record<string, unknown>): ComponentActionResult {
  const before = JSON.stringify(block);
  const issues = checkParams(action, params);
  const result =
    issues.length > 0
      ? { ok: false as const, issues }
      : "apply" in action
        ? action.apply(block, params)
        : (() => {
            throw new Error("Expected a local action.");
          })();
  expect(JSON.stringify(block)).toBe(before);
  return result;
}

function mustOk(result: ComponentActionResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected ok, got issues: ${JSON.stringify(result.issues)}`);
  return result.props;
}

function mustFail(result: ComponentActionResult): string[] {
  if (result.ok) throw new Error(`Expected issues, got props: ${JSON.stringify(result.props)}`);
  return result.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

const names = (nodes: unknown): unknown =>
  (nodes as { name: string; children?: unknown[] }[]).map((node) =>
    node.children ? { [node.name]: names(node.children) } : node.name,
  );

describe("stack component registration", () => {
  it("registers all six actions", () => {
    expect(stackComponent.actions.map((action) => action.action)).toEqual([
      "stack.addNode",
      "stack.updateNode",
      "stack.removeNode",
      "stack.moveNode",
      "stack.setBoundary",
      "stack.removeBoundary",
    ]);
  });
});

describe("stack.addNode", () => {
  it("appends at the top level by default", () => {
    const props = mustOk(run(addNode, stackBlock(), { node: { name: "Disk" } }));
    expect(names(props.nodes)).toEqual(["Hosts", { Framework: ["docs-editor", "docs-model"] }, "Storage", "Disk"]);
    expect(props.boundaries).toBeUndefined();
  });

  it("inserts under a parent at an index, creating children on a leaf", () => {
    const into = mustOk(run(addNode, stackBlock(), { node: { name: "docs-mcp" }, parent: "Framework", index: 1 }));
    expect(names(into.nodes)).toEqual(["Hosts", { Framework: ["docs-editor", "docs-mcp", "docs-model"] }, "Storage"]);
    const leaf = mustOk(run(addNode, stackBlock(), { node: { name: "sqlite" }, parent: "Storage" }));
    expect(names(leaf.nodes)).toEqual(["Hosts", { Framework: ["docs-editor", "docs-model"] }, { Storage: ["sqlite"] }]);
  });

  it("rejects a duplicate name anywhere in the tree, including inside the new subtree", () => {
    expect(mustFail(run(addNode, stackBlock(), { node: { name: "docs-model" } }))[0]).toContain(
      'Duplicate node name "docs-model"',
    );
    expect(
      mustFail(run(addNode, stackBlock(), { node: { name: "X", children: [{ name: "Hosts" }] } }))[0],
    ).toContain('Duplicate node name "Hosts"');
  });

  it("rejects a missing parent, an out-of-range index, and a trailing uses", () => {
    expect(mustFail(run(addNode, stackBlock(), { node: { name: "X" }, parent: "Nope" }))).toEqual([
      '$.params.parent: No node named "Nope".',
    ]);
    expect(mustFail(run(addNode, stackBlock(), { node: { name: "X" }, index: 9 }))).toEqual([
      "$.params.index: index must be in [0, 3].",
    ]);
    expect(mustFail(run(addNode, stackBlock(), { node: { name: "X", uses: true } }))[0]).toContain(
      "uses needs a next sibling",
    );
  });
});

describe("stack.updateNode", () => {
  it("sets and clears fields without touching children", () => {
    const props = mustOk(
      run(updateNode, stackBlock(), {
        name: "Framework",
        patch: { color: null, detail: "the docs framework", columns: 2 },
      }),
    );
    const framework = (props.nodes as Record<string, unknown>[])[1];
    expect(framework).toEqual({
      name: "Framework",
      detail: "the docs framework",
      columns: 2,
      children: [{ name: "docs-editor", uses: true }, { name: "docs-model", badge: "pure" }],
    });
    expect(props.boundaries).toBeUndefined();
  });

  it("renames and cascades to the boundary after it", () => {
    const props = mustOk(run(updateNode, stackBlock(), { name: "docs-editor", patch: { name: "editor" } }));
    expect(names(props.nodes)).toEqual(["Hosts", { Framework: ["editor", "docs-model"] }, "Storage"]);
    expect(props.boundaries).toEqual([
      { after: "Hosts", rule: "no host imports" },
      { after: "editor", rule: "no React below" },
    ]);
  });

  it("rejects a rename onto an existing name and a uses on the last sibling", () => {
    expect(mustFail(run(updateNode, stackBlock(), { name: "Storage", patch: { name: "Hosts" } }))[0]).toContain(
      'Duplicate node name "Hosts"',
    );
    expect(mustFail(run(updateNode, stackBlock(), { name: "Storage", patch: { uses: true } }))[0]).toContain(
      "uses needs a next sibling",
    );
  });

  it("rejects an unknown node and unknown patch keys", () => {
    expect(mustFail(run(updateNode, stackBlock(), { name: "Nope", patch: {} }))).toEqual([
      '$.params.name: No node named "Nope".',
    ]);
    expect(mustFail(run(updateNode, stackBlock(), { name: "Hosts", patch: { children: [] } })).length).toBeGreaterThan(0);
  });
});

describe("stack.removeNode", () => {
  it("removes a subtree and every boundary after a removed node", () => {
    const props = mustOk(run(removeNode, stackBlock(), { name: "Framework" }));
    // Hosts' uses now points at Storage, still a valid next sibling.
    expect(names(props.nodes)).toEqual(["Hosts", "Storage"]);
    expect(props.boundaries).toEqual([{ after: "Hosts", rule: "no host imports" }]);
  });

  it("leaves boundaries out of the patch when none are affected", () => {
    const props = mustOk(run(removeNode, stackBlock(), { name: "Storage" }));
    expect(props.boundaries).toBeUndefined();
  });

  it("rejects a removal that leaves a uses arrow with no next sibling", () => {
    expect(mustFail(run(removeNode, stackBlock(), { name: "docs-model" }))[0]).toContain("uses needs a next sibling");
    // Dropping the only child also drops the emptied children array.
    const props = mustOk(
      run(removeNode, { ...stackBlock(), props: { nodes: [{ name: "A", children: [{ name: "B" }] }] } }, { name: "B" }),
    );
    expect(props.nodes).toEqual([{ name: "A" }]);
  });

  it("rejects an unknown node", () => {
    expect(mustFail(run(removeNode, stackBlock(), { name: "Nope" }))).toEqual(['$.params.name: No node named "Nope".']);
  });
});

describe("stack.moveNode", () => {
  it("moves out of a container to the top level, keeping its boundary", () => {
    const block = stackBlock();
    (block.props.nodes as Record<string, unknown>[])[1].children = [{ name: "docs-editor" }, { name: "docs-model" }];
    const props = mustOk(run(moveNode, block, { name: "docs-model", parent: null, index: 2 }));
    expect(names(props.nodes)).toEqual(["Hosts", { Framework: ["docs-editor"] }, "docs-model", "Storage"]);
    expect(props.boundaries).toBeUndefined();
  });

  it("moves into a container, creating children on a leaf", () => {
    const props = mustOk(run(moveNode, stackBlock(), { name: "Storage", parent: "Framework", index: 0 }));
    expect(names(props.nodes)).toEqual(["Hosts", { Framework: ["Storage", "docs-editor", "docs-model"] }]);
    const leaf = mustOk(run(moveNode, stackBlock(), { name: "Storage", parent: "docs-model" }));
    expect(names(leaf.nodes)).toEqual(["Hosts", { Framework: ["docs-editor", { "docs-model": ["Storage"] }] }]);
  });

  it("reorders within the current parent when parent is omitted, resolving index after detaching", () => {
    const props = mustOk(run(moveNode, stackBlock(), { name: "Hosts", index: 1 }));
    expect(names(props.nodes)).toEqual([{ Framework: ["docs-editor", "docs-model"] }, "Hosts", "Storage"]);
  });

  it("drops the emptied children array of the old parent", () => {
    const block: DocBlock = { ...stackBlock(), props: { nodes: [{ name: "A", children: [{ name: "B" }] }] } };
    expect(mustOk(run(moveNode, block, { name: "B", parent: null, index: 0 })).nodes).toEqual([
      { name: "B" },
      { name: "A" },
    ]);
  });

  it("rejects moving under itself or a descendant, an unknown parent, and a bad index", () => {
    expect(mustFail(run(moveNode, stackBlock(), { name: "Framework", parent: "docs-model" }))[0]).toContain(
      "under itself or its own descendant",
    );
    expect(mustFail(run(moveNode, stackBlock(), { name: "Framework", parent: "Framework" }))[0]).toContain(
      "under itself or its own descendant",
    );
    expect(mustFail(run(moveNode, stackBlock(), { name: "Storage", parent: "Nope" }))).toEqual([
      '$.params.parent: No node named "Nope".',
    ]);
    expect(mustFail(run(moveNode, stackBlock(), { name: "Storage", index: 3 }))).toEqual([
      "$.params.index: index must be in [0, 2] after detaching the node.",
    ]);
  });

  it("rejects a move that leaves a uses arrow trailing", () => {
    expect(mustFail(run(moveNode, stackBlock(), { name: "Hosts", parent: null }))[0]).toContain(
      "uses needs a next sibling",
    );
  });
});

describe("stack.setBoundary / stack.removeBoundary", () => {
  it("adds a boundary and upserts an existing one by after", () => {
    const added = mustOk(run(setBoundary, stackBlock(), { after: "Framework", rule: "no IO" }));
    expect(added.nodes).toBeUndefined();
    expect(added.boundaries).toEqual([
      { after: "Hosts", rule: "no host imports" },
      { after: "docs-editor", rule: "no React below" },
      { after: "Framework", rule: "no IO" },
    ]);
    const replaced = mustOk(run(setBoundary, stackBlock(), { after: "Hosts", rule: "one way only" }));
    expect(replaced.boundaries).toEqual([
      { after: "Hosts", rule: "one way only" },
      { after: "docs-editor", rule: "no React below" },
    ]);
  });

  it("rejects a boundary after an unknown node or with an empty rule", () => {
    expect(mustFail(run(setBoundary, stackBlock(), { after: "Nope", rule: "x" }))).toEqual([
      '$.params.after: No node named "Nope".',
    ]);
    expect(mustFail(run(setBoundary, stackBlock(), { after: "Hosts", rule: "" })).length).toBeGreaterThan(0);
  });

  it("removes a boundary and rejects removing one that does not exist", () => {
    expect(mustOk(run(removeBoundary, stackBlock(), { after: "Hosts" })).boundaries).toEqual([
      { after: "docs-editor", rule: "no React below" },
    ]);
    expect(mustFail(run(removeBoundary, stackBlock(), { after: "Storage" }))).toEqual([
      '$.params.after: No boundary follows "Storage".',
    ]);
  });
});
