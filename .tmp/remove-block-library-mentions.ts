/**
 * Removes the workbench block-library mentions from the corpus after the
 * `#/blocks` page was deleted (the per-type reference pages under
 * 10-system-design/40-block-vocabulary are the catalog).
 *
 * - 20-implementation/20-workbench: replaces the "Block library" section
 *   (H2 + paragraph describing `#/blocks`) with a "Block catalog" section
 *   pointing at the block-vocabulary reference pages.
 * - 20-implementation/10-packages/50-docs-workbench: rewrites the sentence
 *   tail that credited BlocksPage.tsx with exposing the library.
 *
 * validate -> transform -> validate -> canonical serialize; never hand-edit.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocDocument,
} from "../packages/docs-model/src/index.ts";

function load(path: string): DocDocument {
  const result = validateDocDocument(JSON.parse(readFileSync(path, "utf8")));
  if (!result.ok) {
    console.error(`${path} failed validation:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  return result.document as DocDocument;
}

function save(path: string, doc: DocDocument) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} failed post-transform validation:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document as DocDocument));
  console.log(`wrote ${path}`);
}

// --- 20-implementation/20-workbench ---------------------------------------
{
  const path = "docs/20-implementation/20-workbench/doc.json";
  const doc = load(path);

  const headingId = "b-00-using-the-workbench-block-library-31";
  const paragraphId = "b-00-using-the-workbench-blocks-opens-a-searc-32";

  const heading = doc.blocks[headingId];
  const paragraph = doc.blocks[paragraphId];
  if (!heading || heading.type !== "heading" || !paragraph || paragraph.type !== "paragraph") {
    console.error(`${path}: expected block-library heading + paragraph not found`);
    process.exit(1);
  }

  heading.text = [{ insert: "Block catalog" }];
  paragraph.text = [
    { insert: "The block catalog lives in the corpus, not the workbench: the per-type reference pages under " },
    {
      insert: "block vocabulary",
      attributes: {
        reference: { kind: "doc", path: "10-system-design/40-block-vocabulary" },
      },
    },
    { insert: " cover every block type, each with live examples and its doc.json shape." },
  ];

  save(path, doc);
}

// --- 20-implementation/10-packages/50-docs-workbench ----------------------
{
  const path = "docs/20-implementation/10-packages/50-docs-workbench/doc.json";
  const doc = load(path);

  const blockId = "b-50-docs-workbench-owns-web-7";
  const block = doc.blocks[blockId];
  if (!block || !block.text) {
    console.error(`${path}: block ${blockId} not found`);
    process.exit(1);
  }

  const cutMarker = ". The page also surfaces live SSE change flashes and one-click undo, while ";
  const cutIndex = block.text.findIndex(
    (span) => typeof span.insert === "string" && span.insert === cutMarker,
  );
  if (cutIndex === -1) {
    console.error(`${path}: cut-marker span not found in ${blockId}`);
    process.exit(1);
  }

  block.text = [
    ...block.text.slice(0, cutIndex),
    { insert: ". The page also surfaces live SSE change flashes and one-click undo. The block-type catalog is the per-type reference pages under " },
    {
      insert: "block vocabulary",
      attributes: {
        reference: { kind: "doc", path: "10-system-design/40-block-vocabulary" },
      },
    },
    { insert: "." },
  ];

  save(path, doc);
}
