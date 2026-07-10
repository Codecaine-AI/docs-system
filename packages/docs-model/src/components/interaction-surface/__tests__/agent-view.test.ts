"use client";

import { describe, expect, it } from "bun:test";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { interactionSurfaceAgentView } from "../agent-view";

const fixtureBlock = sampleFixture.blocks["interaction-surface-1"] as DocBlock;

describe("interaction-surface component agent view", () => {
  it("projects the fixture byte-for-byte", () => {
    expect(interactionSurfaceAgentView(fixtureBlock, { listDepth: 0, listIndex: 0 })).toBe(
      "**File-tree block surface**\n\n```\n" +
        "file-tree.addEntry(path: string, note?: string, change?: string) -> props patch  # Append a path entry to the tree\n" +
        "file-tree.updateEntry(path: string, newPath?: string) -> props patch  # Patch note/change/from, or rename via newPath\n" +
        "file-tree.removeEntry(path: string)\n```",
    );
  });
});
