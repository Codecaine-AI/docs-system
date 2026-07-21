"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { sequenceAgentView } from "../agent-view";
import { SequenceState } from "../state";

const fixtureBlock = sampleFixture.blocks["sequence-1"] as DocBlock;
const context = { listDepth: 0, listIndex: 0 };

describe("sequence state", () => {
  it("accepts the fixture sequence props", () => {
    expect(Value.Check(SequenceState, fixtureBlock.props)).toBe(true);
  });

  it("accepts a placeholder with neither sequenceId nor src", () => {
    expect(Value.Check(SequenceState, {})).toBe(true);
  });

  it("rejects an empty sequenceId", () => {
    expect(Value.Check(SequenceState, { sequenceId: "" })).toBe(false);
  });

  it("rejects stray properties", () => {
    expect(Value.Check(SequenceState, { ...fixtureBlock.props, stray: true })).toBe(false);
  });
});

describe("sequence agent view", () => {
  it("projects the fixture byte-for-byte", () => {
    expect(sequenceAgentView(fixtureBlock, context)).toBe(
      '<!-- sequence: ./assets/sequences/sample.sequence.json title="Login flow" -->',
    );
  });

  it("projects a missing-src placeholder", () => {
    const block: DocBlock = { id: "sequence-empty", type: "sequence", props: {}, children: [] };
    expect(sequenceAgentView(block, context)).toBe("<!-- sequence: (missing src) -->");
  });

  it("projects a central sequenceId when no sidecar src is present", () => {
    const block: DocBlock = {
      id: "sequence-central",
      type: "sequence",
      props: { sequenceId: "login-flow" },
      children: [],
    };
    expect(sequenceAgentView(block, context)).toBe("<!-- sequence: login-flow -->");
  });
});
