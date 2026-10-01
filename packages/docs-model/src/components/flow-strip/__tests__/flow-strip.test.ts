import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkStateProps } from "../../validate";
import { flowStripAgentView } from "../agent-view";

const STRIP = {
  title: "Docs MCP edit loop",
  steps: [{ name: "`docs_begin`", detail: "Pins the guidance snapshot." }, { name: "`docs_check`" }],
  caption: "Call docs_end only after every page passes.",
};

describe("flow-strip", () => {
  it.each([
    ["a full strip", STRIP, []],
    ["a step without a name", { steps: [{ detail: "x" }] }, ["$.op.props.steps[0].name"]],
    ["nested steps", { steps: [{ name: "a", steps: [] }] }, ["$.op.props.steps[0].steps"]],
  ])("validates %s", (_label, props, paths) => {
    expect(checkStateProps("flow-strip", props).map((issue) => issue.path)).toEqual(expect.arrayContaining(paths));
    if (paths.length === 0) expect(checkStateProps("flow-strip", props)).toEqual([]);
  });

  it("projects the title, numbered steps with details, and the caption", () => {
    const block: DocBlock = { id: "fs", type: "flow-strip", props: STRIP, children: [] };
    expect(flowStripAgentView(block, { listDepth: 0, listIndex: 0 })).toBe(
      "**Docs MCP edit loop**\n\n1. `docs_begin` — Pins the guidance snapshot.\n2. `docs_check`\n\nCall docs_end only after every page passes.",
    );
  });
});
