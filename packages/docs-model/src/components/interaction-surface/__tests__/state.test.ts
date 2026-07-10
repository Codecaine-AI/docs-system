"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { InteractionSurfaceState } from "../state";

const fixtureBlock = sampleFixture.blocks["interaction-surface-1"] as DocBlock;

describe("interaction-surface component state", () => {
  it("accepts the fixture props, including operation params", () => {
    expect(Value.Check(InteractionSurfaceState, fixtureBlock.props)).toBe(true);
  });

  it("rejects a stray operation property", () => {
    const operations = structuredClone(fixtureBlock.props.operations) as Array<Record<string, unknown>>;
    operations[0] = { ...operations[0], stray: true };
    expect(Value.Check(InteractionSurfaceState, { ...fixtureBlock.props, operations })).toBe(false);
  });

  it("rejects a missing operations property", () => {
    expect(Value.Check(InteractionSurfaceState, { title: fixtureBlock.props.title })).toBe(false);
  });

  it("rejects a stray top-level property", () => {
    expect(Value.Check(InteractionSurfaceState, { ...fixtureBlock.props, stray: true })).toBe(false);
  });
});
