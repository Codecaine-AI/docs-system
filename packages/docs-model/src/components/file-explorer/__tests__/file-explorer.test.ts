import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkStateProps } from "../../validate";
import { fileExplorerAgentView } from "../agent-view";

describe("file-explorer", () => {
  it.each([
    ["the title and maxRows", { title: "Layout", maxRows: 12 }, true],
    ["a non-positive maxRows", { maxRows: 0 }, false],
    ["a fractional maxRows", { maxRows: 2.5 }, false],
    ["the file-tree display prop", { display: "explorer" }, false],
  ])("validates %s", (_label, extra, valid) => {
    const issues = checkStateProps("file-explorer", { entries: [{ path: "src/index.ts" }], ...extra });
    expect(issues.length === 0).toBe(valid);
  });

  it("projects the tree listing, led by the title when one is set", () => {
    const block: DocBlock = {
      id: "fe",
      type: "file-explorer",
      props: { entries: [{ path: "src/index.ts" }], title: "Entry point" },
      children: [],
    };
    expect(fileExplorerAgentView(block, { listDepth: 0, listIndex: 0 })).toBe(
      "**Entry point**\n\n```\nsrc/\n└── index.ts\n```",
    );
  });
});
