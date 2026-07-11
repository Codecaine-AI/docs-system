"use client";

import { describe, expect, it } from "bun:test";

import {
  ACTION_REGISTRY,
  ALL_COMPONENTS,
  COMPONENT_BY_TYPE,
  buildBlocksDiscovery,
} from "../index";

const OP_NAMES = [
  "insertBlock",
  "updateBlock",
  "deleteBlock",
  "moveBlock",
  "splitBlock",
  "mergeBlocks",
  "blockAction",
] as const;

describe("buildBlocksDiscovery", () => {
  it("folds components in registry order", () => {
    const discovery = buildBlocksDiscovery();

    expect(discovery.schemaVersion).toBe(2);
    expect(discovery.components).toHaveLength(ALL_COMPONENTS.length);
    expect(discovery.components.map((component) => component.name)).toEqual(
      ALL_COMPONENTS.map((component) => component.manifest.name),
    );
  });

  it("serves registered state schemas verbatim", () => {
    const discovery = buildBlocksDiscovery();

    for (const type of ["file-tree", "heading", "canvas"] as const) {
      const served = discovery.components
        .flatMap((component) => component.types)
        .find((entry) => entry.type === type);
      const bundle = COMPONENT_BY_TYPE.get(type);

      expect(served, type).toBeDefined();
      expect(bundle, type).toBeDefined();
      expect(served!.state, type).toBe(bundle!.states[type]!.schema);
    }
  });

  it("serves registered action parameter schemas verbatim", () => {
    const discovery = buildBlocksDiscovery();

    for (const action of [
      "file-tree.addEntry",
      "structured-table.updateCell",
    ] as const) {
      const served = discovery.components
        .flatMap((component) => component.actions)
        .find((entry) => entry.action === action);
      const registered = ACTION_REGISTRY.get(action);

      expect(served, action).toBeDefined();
      expect(registered, action).toBeDefined();
      expect(served!.params, action).toBe(registered!.params);
    }
  });

  it("publishes all seven documented kernel operations", () => {
    const { ops } = buildBlocksDiscovery();

    expect(ops).toHaveLength(7);
    expect(ops.map((entry) => entry.op)).toEqual([...OP_NAMES]);
    for (const entry of ops) {
      expect(entry.description.trim().length, entry.op).toBeGreaterThan(0);
    }
  });

  it("reports the rich-text bundle's eight types and no actions", () => {
    const richText = buildBlocksDiscovery().components.find(
      (component) => component.name === "rich-text",
    );

    expect(richText).toBeDefined();
    expect(richText!.types).toHaveLength(8);
    expect(richText!.actions).toHaveLength(0);
  });
});
