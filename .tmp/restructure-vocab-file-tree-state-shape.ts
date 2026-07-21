/**
 * Restructures two block-vocabulary reference pages to the canonical order:
 * lead → Example (new live block) → State → Typed actions → Renderers
 * (merged "Markdown render" + "In the editor") → Agent notes → Theming.
 *
 *   - docs/10-system-design/40-block-vocabulary/40-file-tree/doc.json
 *   - docs/10-system-design/40-block-vocabulary/50-state-shape/doc.json
 *
 * Validate → transform → canonical serialize; hard-fails on issues.
 * Goldens are NOT regenerated here (orchestrator regenerates once at the end).
 * Run from repo root: bun .tmp/restructure-vocab-file-tree-state-shape.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocBlock,
  type DocDocument,
} from "../packages/docs-model/src/index.ts";

const t = (text: string) => ({ insert: text });

function loadValidated(docPath: string): DocDocument {
  const doc = JSON.parse(readFileSync(docPath, "utf8")) as DocDocument;
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${docPath} invalid BEFORE transform:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  return doc;
}

function saveValidated(docPath: string, doc: DocDocument): void {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${docPath} invalid AFTER transform:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  const bytes = serializeDocDocument(doc);
  writeFileSync(docPath, bytes);
  // Canonical-bytes idempotence: re-read, re-validate, re-serialize, compare.
  const reread = JSON.parse(readFileSync(docPath, "utf8")) as DocDocument;
  const recheck = validateDocDocument(reread);
  if (!recheck.ok) {
    console.error(`${docPath} invalid on RE-READ:`, JSON.stringify(recheck.issues, null, 2));
    process.exit(1);
  }
  if (serializeDocDocument(reread) !== bytes) {
    console.error(`${docPath}: serialized bytes are not idempotent`);
    process.exit(1);
  }
  console.log(`wrote (canonical, idempotent): ${docPath}`);
}

/** Replace root children with newOrder; every old child must be kept or explicitly deleted. */
function reorder(doc: DocDocument, newOrder: string[], deleted: string[]): void {
  const root = doc.blocks[doc.root];
  const keep = new Set(newOrder);
  const drop = new Set(deleted);
  for (const id of root.children) {
    if (!keep.has(id) && !drop.has(id)) throw new Error(`unaccounted child: ${id}`);
  }
  for (const id of newOrder) {
    if (!doc.blocks[id]) throw new Error(`missing block: ${id}`);
  }
  for (const id of deleted) delete doc.blocks[id];
  root.children = newOrder;
}

function addBlocks(doc: DocDocument, blocks: DocBlock[]): void {
  for (const block of blocks) {
    if (doc.blocks[block.id]) throw new Error(`id collision: ${block.id}`);
    doc.blocks[block.id] = block;
  }
}

/** Prepend text to the first insert of a block, lowercasing its old first letter. */
function prefixFirstInsert(doc: DocDocument, id: string, prefix: string): void {
  const block = doc.blocks[id];
  const first = block.text?.[0];
  if (!first || typeof first.insert !== "string") throw new Error(`no text to prefix: ${id}`);
  first.insert = prefix + first.insert.charAt(0).toLowerCase() + first.insert.slice(1);
}

// ---------------------------------------------------------------------------
// A. file-tree
// ---------------------------------------------------------------------------
{
  const docPath = "docs/10-system-design/40-block-vocabulary/40-file-tree/doc.json";
  const doc = loadValidated(docPath);
  if (doc.blocks["b-21-file-tree-example-block"]) {
    console.log(`skip (already restructured): ${docPath}`);
  } else {
    addBlocks(doc, [
      {
        id: "b-21-file-tree-example-heading",
        type: "heading",
        props: { level: 2 },
        text: [t("Example")],
        children: [],
      },
      {
        id: "b-21-file-tree-example-intro",
        type: "paragraph",
        props: {},
        text: [t("A live instance: a refactor slice of this block's own source folder.")],
        children: [],
      },
      {
        id: "b-21-file-tree-example-block",
        type: "file-tree",
        props: {
          entries: [
            {
              path: "packages/docs-model/src/components/file-tree/state.ts",
              note: "entry schema + tolerant read",
            },
            {
              path: "packages/docs-model/src/components/file-tree/agent-view.ts",
              change: "modified",
              note: "tree drawing",
            },
            {
              path: "packages/docs-model/src/components/file-tree/actions/update-entry.ts",
              change: "added",
            },
            {
              path: "packages/docs-model/src/components/file-tree/lib.ts",
              change: "renamed",
              from: "packages/docs-model/src/components/file-tree/render.ts",
            },
            { path: "packages/docs-model/src/components/file-tree/manifest.ts" },
          ],
        },
        children: [],
      },
      {
        id: "b-21-file-tree-renderers-heading",
        type: "heading",
        props: { level: 2 },
        text: [t("Renderers")],
        children: [],
      },
    ]);
    // Attribute the merged paragraphs to their surfaces (old headings are gone).
    prefixFirstInsert(doc, "b-21-file-tree-editor-13", "In the editor: ");
    prefixFirstInsert(doc, "b-21-file-tree-proj-8", "In the markdown render: ");
    reorder(
      doc,
      [
        "b-21-file-tree-lead-2",
        "b-21-file-tree-example-heading",
        "b-21-file-tree-example-intro",
        "b-21-file-tree-example-block",
        "b-21-file-tree-state-h-3",
        "b-21-file-tree-state-4",
        "b-21-file-tree-entry-state-5",
        "b-21-file-tree-state-note-6",
        "b-21-file-tree-actions-h-9",
        "b-21-file-tree-actions-note-10",
        "b-21-file-tree-actions-11",
        "b-21-file-tree-renderers-heading",
        "b-21-file-tree-editor-13",
        "b-21-file-tree-proj-8",
        "b-21-file-tree-agent-h-14",
        "b-21-file-tree-agent-1-15",
        "b-21-file-tree-agent-2-16",
        "b-21-file-tree-theming-heading",
        "b-21-file-tree-theming-para",
        "b-21-file-tree-theming-table",
      ],
      ["b-21-file-tree-proj-h-7", "b-21-file-tree-editor-h-12"],
    );
    saveValidated(docPath, doc);
  }
}

// ---------------------------------------------------------------------------
// B. state-shape
// ---------------------------------------------------------------------------
{
  const docPath = "docs/10-system-design/40-block-vocabulary/50-state-shape/doc.json";
  const doc = loadValidated(docPath);
  if (doc.blocks["b-25-state-shape-example-block"]) {
    console.log(`skip (already restructured): ${docPath}`);
  } else {
    const exampleJson = JSON.stringify(
      {
        accent: "#6d4cf0",
        headerBg: { light: "#f5f2ff", dark: "#262040" },
        slider: { kind: "length", max: 24 },
      },
      null,
      2,
    );
    addBlocks(doc, [
      {
        id: "b-25-state-shape-example-heading",
        type: "heading",
        props: { level: 2 },
        text: [t("Example")],
        children: [],
      },
      {
        id: "b-25-state-shape-example-intro",
        type: "paragraph",
        props: {},
        text: [
          t(
            "A live instance: a compact theme shape beside its linked JSON example pane. The shape that documents this block's own state sits under State below.",
          ),
        ],
        children: [],
      },
      {
        id: "b-25-state-shape-example-block",
        type: "state-shape",
        props: {
          name: "TableTheme",
          fields: [
            { name: "accent", type: "string", description: "Accent rule color." },
            {
              name: "headerBg",
              type: "string | { light, dark }",
              required: false,
              description: "Header row background; one value or a per-mode pair.",
            },
            {
              name: "slider",
              type: "object",
              required: false,
              description: "Numeric control metadata.",
              fields: [
                { name: "kind", type: '"color" | "length" | "number"' },
                { name: "max", type: "number", required: false },
              ],
            },
          ],
          example: exampleJson,
        },
        children: [],
      },
      {
        id: "b-25-state-shape-renderers-heading",
        type: "heading",
        props: { level: 2 },
        text: [t("Renderers")],
        children: [],
      },
    ]);
    // Attribute the merged paragraphs to their surfaces (old headings are gone).
    prefixFirstInsert(doc, "b-25-state-shape-editor-13", "In the editor: ");
    prefixFirstInsert(doc, "b-25-state-shape-proj-7", "In the markdown render: ");
    reorder(
      doc,
      [
        "b-25-state-shape-lead-2",
        "b-25-state-shape-example-heading",
        "b-25-state-shape-example-intro",
        "b-25-state-shape-example-block",
        "b-25-state-shape-state-h-3",
        "b-25-state-shape-state-4",
        "b-25-state-shape-state-note-5",
        "b-25-state-shape-actions-h-9",
        "b-25-state-shape-actions-note-10",
        "b-25-state-shape-actions-11",
        "b-25-state-shape-renderers-heading",
        "b-25-state-shape-editor-13",
        "b-25-state-shape-proj-7",
        "b-25-state-shape-proj-example-8",
        "b-25-state-shape-proj-example-json",
        "b-25-state-shape-agent-h-14",
        "b-25-state-shape-agent-1-15",
        "b-25-state-shape-agent-2-16",
        "b-25-state-shape-theming-heading",
        "b-25-state-shape-theming-para",
        "b-25-state-shape-theming-table",
        "b-25-state-shape-theming-linking",
      ],
      ["b-25-state-shape-proj-h-6", "b-25-state-shape-editor-h-12"],
    );
    saveValidated(docPath, doc);
  }
}

console.log("done");
