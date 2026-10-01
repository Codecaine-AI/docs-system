import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { checkStateProps } from "../../validate";
import { pseudocodeAgentView } from "../agent-view";

describe("pseudocode", () => {
  it("accepts a boolean diff flag and nothing else", () => {
    expect(checkStateProps("pseudocode", { diff: true })).toEqual([]);
    expect(checkStateProps("pseudocode", { diff: "yes" }).length).toBeGreaterThan(0);
    expect(checkStateProps("pseudocode", { language: "pseudo" }).length).toBeGreaterThan(0);
  });

  it("projects the text verbatim and marks a diff in the fence info string", () => {
    const block: DocBlock = {
      id: "p",
      type: "pseudocode",
      props: { diff: true },
      text: [{ insert: " keep()\n-old()\n+new()" }],
      children: [],
    };
    expect(pseudocodeAgentView(block, { listDepth: 0, listIndex: 0 })).toBe("```pseudocode diff\n keep()\n-old()\n+new()\n```");
    expect(pseudocodeAgentView({ ...block, props: {} }, { listDepth: 0, listIndex: 0 })).toStartWith("```pseudocode\n");
  });
});
