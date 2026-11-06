import { describe, expect, it } from "bun:test";
import type { DocBlock, DocDocument } from "../../../doc-schema";
import { checkStateProps } from "../../validate";
import { componentTreeAgentView } from "../agent-view";
import { lintDocument } from "../../../lint";

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

  it("warns on a row that marks dropped props with a bare ellipsis, and not on an omitted value or a spread", () => {
    const rows = [
      { text: "<StyleRailPanel settings={settings} …>", nodes: [{ text: "<Pane id={id} ... />" }, { text: "else …", kind: "branch" }] },
      { text: "<Row left={…} {...props} />" },
      { text: '<Label text="Loading…" />' },
    ];
    const doc: DocDocument = {
      schemaVersion: 1, id: "doc-ct", title: "Tree", root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["ct"] },
        ct: { id: "ct", type: "component-tree", props: { nodes: rows }, children: [] },
      },
    };
    const findings = lintDocument(doc, { phase: "complete" }).findings.filter((f) => f.ruleId === "component-tree.bare-ellipsis");
    expect(findings.map((f) => f.evidence)).toEqual(["<StyleRailPanel settings={settings} …>", "<Pane id={id} ... />"]);
  });
});
