"use client";

import { describe, expect, it } from "bun:test";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { structuredTableAgentView } from "../agent-view";

const fixtureBlock = sampleFixture.blocks["table-1"] as DocBlock;
const context = { listDepth: 0, listIndex: 0 };

describe("structured-table agent view", () => {
  it("projects the fixture byte-for-byte", () => {
    expect(structuredTableAgentView(fixtureBlock, context)).toBe(
      "**Structured table sample**\n\n| Name | Value |\n| --- | --- |\n| answer | 42 |\n| question | unknown |",
    );
  });
});
