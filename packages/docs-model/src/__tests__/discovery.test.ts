"use client";

import { describe, expect, it } from "bun:test";

import {
  ACTION_REGISTRY,
  ALL_COMPONENTS,
  buildBlocksDiscovery,
} from "../index";
import { stateFor } from "../components";

const CARRIES_TEXT = {
  paragraph: true,
  heading: true,
  "list-item": true,
  quote: true,
  callout: true,
  divider: false,
  image: false,
  video: false,
  code: true,
  "structured-table": false,
  "file-tree": false,
  "interaction-surface": false,
  "state-shape": false,
  canvas: false,
  sequence: false,
  waterfall: false,
} as const;

const ACTION_KEYS = [
  "canvas.addAnnotation",
  "canvas.addConnection",
  "canvas.addObject",
  "canvas.fitContainerToChildren",
  "canvas.updateObject",
  "code.removeAnnotation",
  "code.setAnnotation",
  "file-tree.addEntry",
  "file-tree.removeEntry",
  "file-tree.updateEntry",
  "interaction-surface.addOperation",
  "interaction-surface.removeOperation",
  "interaction-surface.updateOperation",
  "sequence.setProgram",
  "sequence.setStyle",
  "sequence.setTitle",
  "state-shape.addField",
  "state-shape.removeField",
  "state-shape.setExample",
  "state-shape.updateField",
  "structured-table.addColumn",
  "structured-table.addRow",
  "structured-table.removeColumn",
  "structured-table.removeRow",
  "structured-table.updateCell",
  "waterfall.insertStep",
  "waterfall.moveStep",
  "waterfall.removeStep",
  "waterfall.setStepText",
  "waterfall.setSteps",
] as const;

const OP_NAMES = [
  "insertBlock",
  "updateBlock",
  "deleteBlock",
  "moveBlock",
  "splitBlock",
  "mergeBlocks",
  "componentAction",
] as const;

const OP_DESCRIPTIONS = [
  "Insert a new block (fresh, non-colliding blockId) of blockType under parentId at the given child index, with props and optional delta text.",
  "Shallow-merge a props patch into a block (a key set to undefined removes that prop) and/or replace its text (null clears); the block id is preserved.",
  'Delete a block — mode "subtree" (default) removes it and all descendants; "reparent" splices its children into its parent at the block\'s former position.',
  "Move a block under toParentId at toIndex — the index within the destination children AFTER the block is detached.",
  "Split a block's delta text at a character offset in [0, textLength] into two blocks; the new sibling gets a freshly minted id.",
  "Merge two or more contiguous sibling blocks (in document order) into a single block with a freshly minted id.",
  "Run a named typed action from the component-actions registry against a structured block; the validated result applies as a shallow-merge updateBlock patch (same inverse/undo path).",
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

    for (const component of discovery.components) {
      for (const served of component.types) {
        const registered = stateFor(served.type);

        expect(served.state, served.type).toBe(registered.schema);
        expect(served.carriesText, served.type).toBe(registered.carriesText);
        expect(served.carriesText, served.type).toBe(CARRIES_TEXT[served.type]);
      }
    }
  });

  it("serves registered action parameter schemas verbatim", () => {
    const discovery = buildBlocksDiscovery();

    const servedActions = discovery.components.flatMap(
      (component) => component.actions,
    );

    expect(servedActions.map((entry) => entry.action).sort()).toEqual([
      ...ACTION_KEYS,
    ]);
    for (const served of servedActions) {
      const registered = ACTION_REGISTRY.get(served.action);

      expect(registered, served.action).toBeDefined();
      expect(served.params, served.action).toBe(registered!.params);
    }
  });

  it("serves the five canvas actions in lifted descriptor order", () => {
    const canvas = buildBlocksDiscovery().components.find(
      (component) => component.name === "canvas",
    );

    expect(canvas?.actions.map((entry) => entry.action)).toEqual([
      "canvas.addObject",
      "canvas.updateObject",
      "canvas.addConnection",
      "canvas.addAnnotation",
      "canvas.fitContainerToChildren",
    ]);
  });

  it("serves the three sequence actions in lifted descriptor order", () => {
    const sequence = buildBlocksDiscovery().components.find(
      (component) => component.name === "sequence",
    );

    expect(sequence?.actions.map((entry) => entry.action)).toEqual([
      "sequence.setProgram",
      "sequence.setStyle",
      "sequence.setTitle",
    ]);
  });

  it("publishes all seven documented kernel operations", () => {
    const { ops } = buildBlocksDiscovery();

    expect(ops).toHaveLength(7);
    expect(ops.map((entry) => entry.op)).toEqual([...OP_NAMES]);
    expect(ops.map((entry) => entry.description)).toEqual([
      ...OP_DESCRIPTIONS,
    ]);
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
