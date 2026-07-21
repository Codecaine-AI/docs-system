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

  it("renders marked cells (rows and columns) as inline markdown", () => {
    const block: DocBlock = {
      id: "b1",
      type: "structured-table",
      props: {
        columns: ["Name", [{ insert: "Value", attributes: { code: true } }]],
        rows: [
          [
            [
              { insert: "bold", attributes: { bold: true } },
              { insert: " rest" },
            ],
            "plain",
          ],
          ["a", [{ insert: "site", attributes: { link: "https://e.com" } }]],
        ],
      },
      children: [],
    };
    expect(structuredTableAgentView(block, context)).toBe(
      "| Name | `Value` |\n| --- | --- |\n| **bold** rest | plain |\n| a | [site](https://e.com) |",
    );
  });

  it("is byte-identical to the plain projection for all-plain tables with junk tolerated", () => {
    const block: DocBlock = {
      id: "b1",
      type: "structured-table",
      props: {
        title: "T",
        columns: ["A", 42, "B"],
        rows: [["x", 7], "junk"],
      } as unknown as Record<string, unknown>,
      children: [],
    };
    expect(structuredTableAgentView(block, context)).toBe(
      "**T**\n\n| A | B |\n| --- | --- |\n| x | 7 |",
    );
  });
});
