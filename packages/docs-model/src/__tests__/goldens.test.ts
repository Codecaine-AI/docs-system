"use client";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import {
  ACTION_REGISTRY,
  BLOCK_TYPE_CATEGORY,
  DOC_BLOCK_TYPES,
  deriveParamSpecs,
  listBlockActions,
  projectToMarkdown,
  serializeDocDocument,
  validateDocDocument,
} from "../index";
import type { BlockActionParamSpec, DocDocument } from "../index";

const REPO_ROOT = join(import.meta.dir, "../../../..");
const FIXTURE_PATH = "packages/docs-model/src/__fixtures__/sample.doc.json";
const CORPUS_PATHS = [
  "docs/00-foundation/00-manifesto/doc.json",
  "docs/10-system-design/00-data-model/doc.json",
  "docs/10-system-design/10-block-vocabulary/doc.json",
  "docs/10-system-design/20-mutation-model/doc.json",
  "docs/20-implementation/00-overview/doc.json",
  "docs/20-implementation/10-package-map/doc.json",
  "docs/20-implementation/20-workbench/doc.json",
  "docs/20-implementation/30-save-pipeline/doc.json",
  "docs/20-implementation/99-appendix/00-local-dev-loop/doc.json",
] as const;
const DOCUMENT_PATHS = [FIXTURE_PATH, ...CORPUS_PATHS] as const;

const LEGACY_ACTION_KEYS = [
  "file-tree.addEntry",
  "file-tree.removeEntry",
  "file-tree.updateEntry",
  "structured-table.addRow",
  "structured-table.removeRow",
  "structured-table.updateCell",
  "structured-table.addColumn",
  "structured-table.removeColumn",
  "interaction-surface.addOperation",
  "interaction-surface.updateOperation",
  "interaction-surface.removeOperation",
  "code.setAnnotation",
  "code.removeAnnotation",
] as const;

async function readValidatedDocument(relativePath: string): Promise<{
  bytes: string;
  document: DocDocument;
}> {
  const bytes = await readFile(join(REPO_ROOT, relativePath), "utf8");
  const result = validateDocDocument(JSON.parse(bytes));
  if (!result.ok) {
    throw new Error(`${relativePath} failed validation: ${JSON.stringify(result.issues)}`);
  }
  return { bytes, document: result.document };
}

function projectionGoldenPath(documentPath: string): string {
  const name = documentPath === FIXTURE_PATH
    ? "fixture__sample.md"
    : documentPath.replace(/\/doc\.json$/, "").replaceAll("/", "__") + ".md";
  return `packages/docs-model/src/__tests__/goldens/projection/${name}`;
}

const genericOps = [
  {
    op: "insertBlock",
    description:
      "Insert a new block (fresh, non-colliding blockId) of blockType under parentId at the given child index, with props and optional delta text.",
    appliesTo: "all",
  },
  {
    op: "updateBlock",
    description:
      "Shallow-merge a props patch into a block (a key set to undefined removes that prop) and/or replace its text (null clears); the block id is preserved.",
    appliesTo: "all",
  },
  {
    op: "deleteBlock",
    description:
      'Delete a block — mode "subtree" (default) removes it and all descendants; "reparent" splices its children into its parent at the block\'s former position.',
    appliesTo: "all",
  },
  {
    op: "moveBlock",
    description:
      "Move a block under toParentId at toIndex — the index within the destination children AFTER the block is detached.",
    appliesTo: "all",
  },
  {
    op: "splitBlock",
    description:
      "Split a block's delta text at a character offset in [0, textLength] into two blocks; the new sibling gets a freshly minted id.",
    appliesTo: "all",
  },
  {
    op: "mergeBlocks",
    description:
      "Merge two or more contiguous sibling blocks (in document order) into a single block with a freshly minted id.",
    appliesTo: "all",
  },
  {
    op: "blockAction",
    description:
      "Run a named typed action from the block-actions registry against a structured block; the validated result applies as a shallow-merge updateBlock patch (same inverse/undo path).",
    appliesTo: "all",
  },
];

function discoveryPayload() {
  return {
    schemaVersion: 1,
    genericOps,
    blockTypes: DOC_BLOCK_TYPES.map((type) => ({
      type,
      category: BLOCK_TYPE_CATEGORY[type],
      actions: listBlockActions(type).map(({ action, description, params }) => ({
        action,
        description,
        params,
      })),
    })),
  };
}

describe("captured integration goldens", () => {
  it("re-serializes the fixture and corpus to their on-disk bytes", async () => {
    for (const relativePath of DOCUMENT_PATHS) {
      const { bytes, document } = await readValidatedDocument(relativePath);
      expect(serializeDocDocument(document), relativePath).toBe(bytes);
    }
  });

  it("projects the fixture and corpus byte-for-byte", async () => {
    for (const relativePath of DOCUMENT_PATHS) {
      const { document } = await readValidatedDocument(relativePath);
      const expected = await readFile(join(REPO_ROOT, projectionGoldenPath(relativePath)), "utf8");
      expect(projectToMarkdown(document), relativePath).toBe(expected);
    }
  });

  it("rebuilds the v1 block discovery payload byte-for-byte", async () => {
    const expected = await readFile(
      join(REPO_ROOT, "packages/docs-model/src/__tests__/goldens/blocks-discovery.v1.json"),
      "utf8",
    );
    expect(JSON.stringify(discoveryPayload(), null, 2) + "\n").toBe(expected);
  });

  it("derives every legacy action param spec from its TypeBox schema", async () => {
    const goldenBytes = await readFile(
      join(REPO_ROOT, "packages/docs-model/src/__tests__/goldens/blocks-discovery.v1.json"),
      "utf8",
    );
    const golden = JSON.parse(goldenBytes) as {
      blockTypes: Array<{
        actions: Array<{ action: string; params: BlockActionParamSpec[] }>;
      }>;
    };
    const expectedByAction = new Map(
      golden.blockTypes.flatMap((blockType) =>
        blockType.actions.map((action) => [action.action, action.params] as const),
      ),
    );

    for (const key of LEGACY_ACTION_KEYS) {
      const action = ACTION_REGISTRY.get(key);
      const expected = expectedByAction.get(key);
      expect(action, key).toBeDefined();
      expect(expected, key).toBeDefined();
      expect(deriveParamSpecs(action!.params), key).toEqual(expected!);
    }
  });
});
