"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { canvasAgentView } from "../agent-view";
import { CanvasState } from "../state";

const fixtureBlock = sampleFixture.blocks["canvas-1"] as DocBlock;
const context = { listDepth: 0, listIndex: 0 };

describe("canvas state", () => {
  it("accepts the fixture canvas props", () => {
    expect(Value.Check(CanvasState, fixtureBlock.props)).toBe(true);
  });

  it("accepts a placeholder with neither canvasId nor src", () => {
    expect(Value.Check(CanvasState, {})).toBe(true);
  });

  it("rejects an empty canvasId", () => {
    expect(Value.Check(CanvasState, { canvasId: "" })).toBe(false);
  });

  it("rejects stray properties", () => {
    expect(Value.Check(CanvasState, { ...fixtureBlock.props, stray: true })).toBe(false);
  });
});

describe("canvas agent view", () => {
  it("projects the fixture byte-for-byte", () => {
    expect(canvasAgentView(fixtureBlock, context)).toBe(
      '<!-- canvas: ./assets/canvases/sample.canvas.json view=container-architecture title="Architecture overview" -->',
    );
  });

  it("projects a missing-src placeholder", () => {
    const block: DocBlock = { id: "canvas-empty", type: "canvas", props: {}, children: [] };
    expect(canvasAgentView(block, context)).toBe("<!-- canvas: (missing src) -->");
  });
});
