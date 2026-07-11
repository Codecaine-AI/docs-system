"use client";

import type { TObject } from "@sinclair/typebox";

import { ALL_COMPONENTS } from "./components";
import type { DocBlockType } from "./doc-schema";
import type { DocOp } from "./doc-ops";

export type BlocksDiscoveryOp = {
  op: DocOp["type"];
  description: string;
};

export type BlocksDiscoveryType = {
  type: DocBlockType;
  carriesText: boolean;
  state: TObject;
};

export type BlocksDiscoveryAction = {
  action: string;
  description: string;
  params: TObject;
};

export type BlocksDiscoveryComponent = {
  name: string;
  description: string;
  types: BlocksDiscoveryType[];
  actions: BlocksDiscoveryAction[];
};

export type BlocksDiscovery = {
  schemaVersion: 2;
  ops: BlocksDiscoveryOp[];
  components: BlocksDiscoveryComponent[];
};

// Keep these agent-facing descriptions in sync with the authoritative DocOp
// JSDoc in doc-ops.ts.
const OPS: readonly BlocksDiscoveryOp[] = [
  {
    op: "insertBlock",
    description:
      "Insert a new block (fresh, non-colliding blockId) of blockType under parentId at the given child index, with props and optional delta text.",
  },
  {
    op: "updateBlock",
    description:
      "Shallow-merge a props patch into a block (a key set to undefined removes that prop) and/or replace its text (null clears); the block id is preserved.",
  },
  {
    op: "deleteBlock",
    description:
      'Delete a block — mode "subtree" (default) removes it and all descendants; "reparent" splices its children into its parent at the block\'s former position.',
  },
  {
    op: "moveBlock",
    description:
      "Move a block under toParentId at toIndex — the index within the destination children AFTER the block is detached.",
  },
  {
    op: "splitBlock",
    description:
      "Split a block's delta text at a character offset in [0, textLength] into two blocks; the new sibling gets a freshly minted id.",
  },
  {
    op: "mergeBlocks",
    description:
      "Merge two or more contiguous sibling blocks (in document order) into a single block with a freshly minted id.",
  },
  {
    op: "blockAction",
    description:
      "Run a named typed action from the block-actions registry against a structured block; the validated result applies as a shallow-merge updateBlock patch (same inverse/undo path).",
  },
];

export function buildBlocksDiscovery(): BlocksDiscovery {
  return {
    schemaVersion: 2,
    ops: OPS.map((entry) => ({ ...entry })),
    components: ALL_COMPONENTS.map((component) => ({
      name: component.manifest.name,
      description: component.manifest.description,
      types: component.manifest.ownedTypes.map((type) => {
        const state = component.states[type];
        if (!state) {
          throw new Error(
            `Component "${component.manifest.name}" is missing state for owned type "${type}".`,
          );
        }
        return {
          type,
          carriesText: state.carriesText,
          state: state.schema,
        };
      }),
      actions: component.actions.map((action) => ({
        action: action.action,
        description: action.description,
        params: action.params,
      })),
    })),
  };
}
