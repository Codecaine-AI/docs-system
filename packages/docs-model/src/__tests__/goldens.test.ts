"use client";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import { projectToMarkdown, serializeDocDocument, validateDocDocument } from "../index";
import type { DocDocument } from "../index";

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
});
