import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkStateProps } from "../../validate";
import { callStackAgentView } from "../agent-view";

const CTX = { listDepth: 0, listIndex: 0 };

function block(props: Record<string, unknown>): DocBlock {
  return { id: "cs", type: "call-stack", props, children: [] };
}

const FRAMES = [
  {
    text: "runDaemon()",
    source: "src/daemon.ts:7",
    frames: [
      { text: "createInteractionService({ globalThemesRoot })", change: "removed" },
      { text: "createInteractionService({ codeThemesRoot })", change: "added", comment: "<state dir>/code-themes", source: "service.ts:15" },
      { text: "!codeThemesRoot", kind: "branch", change: "modified", frames: [{ text: "set.status = 409", comment: "no code-themes folder" }] },
    ],
  },
];

describe("call-stack state", () => {
  it("accepts nested frames with kinds, comments, changes and sources", () => {
    expect(checkStateProps("call-stack", { frames: FRAMES })).toEqual([]);
  });

  it.each([
    ["a process-outline note kind", { frames: [{ text: "x", kind: "note" }] }, "$.op.props.frames[0].kind"],
    ["a renamed change", { frames: [{ text: "x", change: "renamed" }] }, "$.op.props.frames[0].change"],
    ["process-outline steps", { frames: [{ text: "x", steps: [] }] }, "$.op.props.frames[0].steps"],
    ["empty text", { frames: [{ text: "" }] }, "$.op.props.frames[0].text"],
  ])("rejects %s", (_label, props, path) => {
    expect(checkStateProps("call-stack", props).map((issue) => issue.path)).toContain(path);
  });
});

describe("call-stack agent view", () => {
  it("projects indented rows with a diff column, branch marker, comments and sources", () => {
    expect(callStackAgentView(block({ frames: FRAMES }), CTX)).toBe(
      [
        "```call-stack",
        "  runDaemon()  @src/daemon.ts:7",
        "-   createInteractionService({ globalThemesRoot })",
        "+   createInteractionService({ codeThemesRoot })  # <state dir>/code-themes  @service.ts:15",
        "~   ? !codeThemesRoot",
        "      set.status = 409  # no code-themes folder",
        "```",
      ].join("\n"),
    );
  });

  it("keeps the diff column out of a stack with no changed frame", () => {
    expect(callStackAgentView(block({ frames: [{ text: "run()", frames: [{ text: "drain()", comment: "all of it" }] }] }), CTX)).toBe(
      "```call-stack\nrun()\n  drain()  # all of it\n```",
    );
  });
});
