"use client";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { StructuredTableState } from "../state";

const fixtureBlock = sampleFixture.blocks["table-1"] as DocBlock;

describe("structured-table state", () => {
  it("accepts the table fixture props", () => {
    expect(Value.Check(StructuredTableState, fixtureBlock.props)).toBe(true);
  });

  it("rejects an unknown density", () => {
    expect(Value.Check(StructuredTableState, { ...fixtureBlock.props, density: "wide" })).toBe(false);
  });

  it("requires columns", () => {
    const { columns: _columns, ...withoutColumns } = fixtureBlock.props;
    expect(Value.Check(StructuredTableState, withoutColumns)).toBe(false);
  });

  it("rejects stray properties", () => {
    expect(Value.Check(StructuredTableState, { ...fixtureBlock.props, stray: true })).toBe(false);
  });
});
