"use client";

import { describe, expect, it } from "bun:test";
import { Type } from "@sinclair/typebox";

import { DOC_BLOCK_TYPES } from "../../doc-schema";
import type { DocBlockType } from "../../doc-schema";
import {
  ACTION_REGISTRY,
  ALL_COMPONENTS,
  collectRegistryIssues,
} from "../index";
import type { ComponentAction, ComponentBundle } from "../types";

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
  "structured-table.addColumn",
  "structured-table.addRow",
  "structured-table.removeColumn",
  "structured-table.removeRow",
  "structured-table.updateCell",
] as const;

function closedState() {
  return {
    schema: Type.Object({}, { additionalProperties: false }),
    carriesText: false,
  };
}

function completeBundle(
  actions: readonly ComponentAction[] = [],
): ComponentBundle {
  return {
    manifest: {
      name: "synthetic",
      ownedTypes: DOC_BLOCK_TYPES,
      description: "Complete synthetic component registry.",
    },
    states: Object.fromEntries(
      DOC_BLOCK_TYPES.map((type) => [type, closedState()]),
    ) as ComponentBundle["states"],
    actions,
    agentView: () => null,
  };
}

function syntheticAction(
  action: string,
  blockType: DocBlockType,
): ComponentAction {
  return {
    action,
    blockType,
    description: "Synthetic action.",
    params: Type.Object({}, { additionalProperties: false }),
    apply: () => ({ ok: true, props: {} }),
  };
}

describe("component registry", () => {
  it("imports ../index with a healthy registry", () => {
    expect(ALL_COMPONENTS).toHaveLength(7);
    expect(collectRegistryIssues(ALL_COMPONENTS)).toEqual([]);
  });

  it("partitions every canonical block type exactly once", () => {
    const ownedTypes = ALL_COMPONENTS.flatMap((component) =>
      [...component.manifest.ownedTypes],
    );

    expect(ownedTypes).toHaveLength(DOC_BLOCK_TYPES.length);
    expect([...ownedTypes].sort()).toEqual([...DOC_BLOCK_TYPES].sort());
    for (const type of DOC_BLOCK_TYPES) {
      expect(ownedTypes.filter((ownedType) => ownedType === type)).toHaveLength(1);
    }
  });

  it("registers the 13 legacy and 5 canvas action keys", () => {
    expect([...ACTION_REGISTRY.keys()].sort()).toEqual([...ACTION_KEYS]);
  });

  it("reports block types left unowned by a missing bundle", () => {
    const bundle = completeBundle();
    const withoutCode: ComponentBundle = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        ownedTypes: bundle.manifest.ownedTypes.filter((type) => type !== "code"),
      },
    };

    expect(collectRegistryIssues([withoutCode])).toContain(
      'Missing component ownership for block type "code".',
    );
  });

  it("reports extra unknown owned types", () => {
    const bundle = completeBundle();
    const unknownType = "unknown-block" as DocBlockType;
    const malformed: ComponentBundle = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        ownedTypes: [...bundle.manifest.ownedTypes, unknownType],
      },
      states: { ...bundle.states, [unknownType]: closedState() },
    };

    expect(collectRegistryIssues([malformed])).toContain(
      'Unknown owned block type "unknown-block".',
    );
  });

  it("reports double ownership", () => {
    const duplicateOwner: ComponentBundle = {
      manifest: {
        name: "duplicate",
        ownedTypes: ["paragraph"],
        description: "Synthetic duplicate owner.",
      },
      states: { paragraph: closedState() },
      actions: [],
      agentView: () => null,
    };

    expect(collectRegistryIssues([completeBundle(), duplicateOwner])).toContain(
      'Duplicate ownership for block type "paragraph" by components: synthetic, duplicate.',
    );
  });

  it("reports malformed action keys", () => {
    const action = syntheticAction("paragraph", "paragraph");

    expect(collectRegistryIssues([completeBundle([action])])).toContain(
      'Component "synthetic" action "paragraph" must use the key "<type>.<verb>" with a non-empty verb.',
    );
  });

  it("reports unknown forward authorities", () => {
    const action: ComponentAction = {
      action: "canvas.forward",
      blockType: "canvas",
      description: "Synthetic forwarded action.",
      params: Type.Object({}, { additionalProperties: false }),
      forward: { authority: "unknown" },
    };

    expect(collectRegistryIssues([completeBundle([action])])).toContain(
      'Component "synthetic" action "canvas.forward" has unknown forward authority "unknown".',
    );
  });

  it("reports open schemas", () => {
    const bundle = completeBundle();
    const malformed: ComponentBundle = {
      ...bundle,
      states: {
        ...bundle.states,
        paragraph: {
          schema: Type.Object({}),
          carriesText: true,
        },
      },
    };

    expect(collectRegistryIssues([malformed])).toContain(
      'Component "synthetic" state "paragraph" schema must be closed (additionalProperties must be false).',
    );
  });
});
