"use client";

import type { Static, TObject } from "@sinclair/typebox";
import type { DocBlock, DocBlockType, DocValidationIssue } from "../doc-schema";

export type ComponentManifest = {
  /** Component name — folder name, discovery key, viewer mirror key. */
  name: string;
  /** The block types this component owns (bundles together must partition DOC_BLOCK_TYPES). */
  ownedTypes: readonly DocBlockType[];
  /** Agent-facing, one paragraph: what this editing world is. */
  description: string;
};

export type BlockStateDefinition = {
  /** Closed TypeBox object schema (decision A2): additionalProperties: false. */
  schema: TObject;
  /** Per-type fact (D10): does this type carry delta text? */
  carriesText: boolean;
  /**
   * Optional custom invariants beyond the schema (canonical-form rules etc.).
   * Runs only after the schema passes; issue paths must be built on
   * `basePath` (e.g. `${basePath}.rows[1][2]`).
   */
  check?(props: Record<string, unknown>, basePath: string): DocValidationIssue[];
};

export type ComponentActionResult =
  | { ok: true; props: Record<string, unknown> }   // shallow-merge patch; a key set to undefined removes that prop
  | { ok: false; issues: DocValidationIssue[] };

export type ComponentAction<P extends TObject = TObject> = {
  action: string;                 // "<blockType>.<verb>" — key format unchanged from today
  blockType: DocBlockType;
  description: string;
  params: P;                      // validated by the DISPATCHER before apply; served verbatim in P2
} & (
  | { apply(block: DocBlock, params: Static<P>): ComponentActionResult }
  | { forward: { authority: string } }
);

export type ProjectionContext = {
  /** list-item support: nesting depth + index within the current consecutive run. */
  listDepth: number;
  listIndex: number;
};

export type ComponentBundle = {
  manifest: ComponentManifest;
  states: Partial<Record<DocBlockType, BlockStateDefinition>>;  // boot check makes it total over ownedTypes
  actions: readonly ComponentAction[];
  agentView(block: DocBlock, ctx: ProjectionContext): string | null;
};
