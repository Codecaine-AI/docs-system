import { describe, expect, test } from "bun:test";
import { lintDocument } from "../../../lint/index";
import { document } from "../../../lint/fixtures";
import type { StackNode } from "../state";

const badgeFindings = (nodes: StackNode[]) =>
  lintDocument(document({ id: "s", type: "stack", props: { nodes }, children: [] }), { phase: "complete" })
    .findings.filter((f) => f.ruleId === "stack.badge-repeats-name")
    .map((f) => f.field);

describe("stack.badge-repeats-name", () => {
  test.each([
    ["Host app", "host", true],
    ["Docs store on disk", "Store", true],
    ["docs-model", "docs model", true],
    ["docs-model", "pure", false],
    ["Docs-root chokepoint", "safe-path.ts", false],
  ])("a node named %p with badge %p is flagged: %p", (name, badge, flagged) => {
    expect(badgeFindings([{ name, badge }])).toEqual(flagged ? ["props.nodes[0].badge"] : []);
  });

  test("finds a repeated badge on a leaf nested in a container", () => {
    expect(badgeFindings([{ name: "Clients", children: [{ name: "pi", badge: "role" }, { name: "Agent client", badge: "client" }] }]))
      .toEqual(["props.nodes[0].children[1].badge"]);
  });
});
