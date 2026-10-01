"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkStateProps } from "../../validate";
import { stackAgentView } from "../agent-view";

const LAYERING = {
  nodes: [
    { name: "Host apps", detail: "outside the framework", children: [{ name: "Spectre", badge: "host app" }] },
    {
      name: "Docs framework",
      color: "blue",
      uses: true,
      children: [
        { name: "docs-workbench", uses: "DocsClient" },
        { name: "docs-viewer" },
        { name: "Pure", color: "green", children: [{ name: "docs-model" }] },
      ],
    },
    { name: "External", columns: 2, children: [{ name: "canvas" }, { name: "sequence" }] },
  ],
  boundaries: [
    { after: "Host apps", rule: "framework never imports host-app code" },
    { after: "docs-viewer", rule: "docs-model stays pure" },
  ],
};

function block(props: Record<string, unknown>): DocBlock {
  return { id: "s1", type: "stack", props, children: [] };
}

describe("stack state", () => {
  it("accepts a nested stack with uses, columns and boundaries", () => {
    expect(checkStateProps("stack", LAYERING)).toEqual([]);
  });

  it.each([
    ["a duplicate name", { nodes: [{ name: "a" }, { name: "b", children: [{ name: "a" }] }] }, "$.op.props.nodes[1].children[0].name"],
    ["uses on the last sibling", { nodes: [{ name: "a" }, { name: "b", uses: true }] }, "$.op.props.nodes[1].uses"],
    ["a boundary after an unknown node", { nodes: [{ name: "a" }], boundaries: [{ after: "z", rule: "r" }] }, "$.op.props.boundaries[0].after"],
    ["two boundaries after one node", { nodes: [{ name: "a" }], boundaries: [{ after: "a", rule: "r" }, { after: "a", rule: "s" }] }, "$.op.props.boundaries[1].after"],
    ["an unknown color", { nodes: [{ name: "a", color: "teal" }] }, "$.op.props.nodes[0].color"],
    ["three columns", { nodes: [{ name: "a", columns: 3 }] }, "$.op.props.nodes[0].columns"],
  ])("rejects %s", (_label, props, path) => {
    expect(checkStateProps("stack", props).map((issue) => issue.path)).toContain(path);
  });
});

describe("stack agent view", () => {
  it("projects an indented outline with arrows and rule lines", () => {
    expect(stackAgentView(block(LAYERING), { listDepth: 0, listIndex: 0 })).toBe(
      [
        "```",
        "Host apps — outside the framework",
        "  Spectre [host app]",
        "── framework never imports host-app code ──",
        "Docs framework",
        "  docs-workbench",
        "  ↓ DocsClient",
        "  docs-viewer",
        "  ── docs-model stays pure ──",
        "  Pure",
        "    docs-model",
        "↓",
        "External",
        "  canvas",
        "  sequence",
        "```",
      ].join("\n"),
    );
  });

  it("projects an empty stack as nothing", () => {
    expect(stackAgentView(block({ nodes: [] }), { listDepth: 0, listIndex: 0 })).toBe("");
  });
});
