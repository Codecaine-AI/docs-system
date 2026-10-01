import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkStateProps } from "../../validate";
import { componentTreeAgentView } from "../agent-view";

describe("component-tree", () => {
  const nodes = [{ text: "<DocPage path={path}>", nodes: [{ text: "useCodeTheme()", kind: "hook", change: "added" }] }];

  it("accepts components and hooks nested under nodes, and rejects a call-stack kind", () => {
    expect(checkStateProps("component-tree", { nodes })).toEqual([]);
    expect(checkStateProps("component-tree", { nodes: [{ text: "f()", kind: "call" }] }).map((i) => i.path)).toContain(
      "$.op.props.nodes[0].kind",
    );
  });

  it("projects under its own fence tag", () => {
    const block: DocBlock = { id: "ct", type: "component-tree", props: { nodes }, children: [] };
    expect(componentTreeAgentView(block, { listDepth: 0, listIndex: 0 })).toBe(
      "```component-tree\n  <DocPage path={path}>\n+   useCodeTheme()\n```",
    );
  });
});
