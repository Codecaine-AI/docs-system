"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import sampleDoc from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { codeAgentView } from "../agent-view";
import { CodeState } from "../state";

const codeBlock = sampleDoc.blocks["code-1"] as DocBlock;

describe("code state", () => {
  it("accepts the fixture props", () => {
    expect(Value.Check(CodeState, codeBlock.props)).toBe(true);
  });

  it("rejects stray state and annotation properties", () => {
    expect(Value.Check(CodeState, { ...codeBlock.props, stray: true })).toBe(false);
    const annotations = codeBlock.props.annotations as Record<string, unknown>[];
    expect(
      Value.Check(CodeState, {
        ...codeBlock.props,
        annotations: [{ ...annotations[0], stray: true }, ...annotations.slice(1)],
      }),
    ).toBe(false);
  });

  it("projects the fixture byte-for-byte", () => {
    expect(codeAgentView(codeBlock, { listDepth: 0, listIndex: 0 })).toBe(
      "```typescript\nexport const answer = 42;\nexport const double = () =>\n  answer * 2;\n```\n> **L1 (Export):** The canonical answer constant.\n> **L2-3:** Helper that doubles the answer.",
    );
  });
});
