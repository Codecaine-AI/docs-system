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
  "docs/10-system-design/doc.json",
  "docs/10-system-design/10-interaction-surfaces/doc.json",
  "docs/10-system-design/20-doc-architecture/doc.json",
  "docs/10-system-design/20-doc-architecture/10-hierarchy-layers/doc.json",
  "docs/10-system-design/20-doc-architecture/20-directory-structure/doc.json",
  "docs/10-system-design/20-doc-architecture/30-numbering/doc.json",
  "docs/10-system-design/20-doc-architecture/40-titles-and-openings/doc.json",
  "docs/10-system-design/20-doc-architecture/50-doc-linking/doc.json",
  "docs/10-system-design/20-doc-architecture/60-code-linking/doc.json",
  "docs/10-system-design/20-doc-architecture/70-writing-standards/doc.json",
  "docs/10-system-design/30-data-model/doc.json",
  "docs/10-system-design/30-data-model/10-document-tree/doc.json",
  "docs/10-system-design/30-data-model/20-rich-text/doc.json",
  "docs/10-system-design/30-data-model/30-block-state/doc.json",
  "docs/10-system-design/30-data-model/40-comments/doc.json",
  "docs/10-system-design/30-data-model/50-canonical-bytes/doc.json",
  "docs/10-system-design/30-data-model/60-mutation-model/doc.json",
  "docs/10-system-design/40-block-vocabulary/doc.json",
  "docs/10-system-design/40-block-vocabulary/10-rich-text/doc.json",
  "docs/10-system-design/40-block-vocabulary/10-rich-text/10-paragraph/doc.json",
  "docs/10-system-design/40-block-vocabulary/10-rich-text/11-heading/doc.json",
  "docs/10-system-design/40-block-vocabulary/10-rich-text/12-list-item/doc.json",
  "docs/10-system-design/40-block-vocabulary/10-rich-text/13-quote/doc.json",
  "docs/10-system-design/40-block-vocabulary/10-rich-text/14-callout/doc.json",
  "docs/10-system-design/40-block-vocabulary/10-rich-text/15-divider/doc.json",
  "docs/10-system-design/40-block-vocabulary/10-rich-text/16-image/doc.json",
  "docs/10-system-design/40-block-vocabulary/10-rich-text/17-video/doc.json",
  "docs/10-system-design/40-block-vocabulary/20-code/doc.json",
  "docs/10-system-design/40-block-vocabulary/30-structured-table/doc.json",
  "docs/10-system-design/40-block-vocabulary/40-file-tree/doc.json",
  "docs/10-system-design/40-block-vocabulary/50-interaction-surface/doc.json",
  "docs/10-system-design/40-block-vocabulary/60-sequence/doc.json",
  "docs/10-system-design/40-block-vocabulary/70-canvas/doc.json",
  "docs/10-system-design/50-package-boundaries/doc.json",
  "docs/20-implementation/doc.json",
  "docs/20-implementation/10-packages/doc.json",
  "docs/20-implementation/10-packages/10-docs-model/doc.json",
  "docs/20-implementation/10-packages/20-docs-index/doc.json",
  "docs/20-implementation/10-packages/30-docs-server/doc.json",
  "docs/20-implementation/10-packages/40-docs-viewer/doc.json",
  "docs/20-implementation/10-packages/50-docs-workbench/doc.json",
  "docs/20-implementation/10-packages/60-docs-cli/doc.json",
  "docs/20-implementation/10-packages/70-framework/doc.json",
  "docs/20-implementation/10-packages/80-external-canvas/doc.json",
  "docs/20-implementation/20-workbench/doc.json",
  "docs/20-implementation/30-save-pipeline/doc.json",
  "docs/20-implementation/40-theming/doc.json",
  "docs/20-implementation/40-theming/10-global-themes/doc.json",
  "docs/20-implementation/40-theming/20-component-themes/doc.json",
  "docs/20-implementation/40-theming/30-fonts/doc.json",
  "docs/20-implementation/40-theming/40-system-ui/doc.json",
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
