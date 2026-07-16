/**
 * Appends a "Theming" section (heading + intro + key table) to each of the
 * 14 block-vocabulary docs, stating that block type's theme file, keys, and
 * CSS variables — mirroring THEME_TOKEN_REGISTRY (theme-folders.ts).
 * Canonical serializer bytes + regenerated projection goldens.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  projectToMarkdown,
  serializeDocDocument,
  validateDocDocument,
  type DocDocument,
  type DocBlock,
} from "../packages/docs-model/src/index.ts";

const t = (text: string) => ({ insert: text });
const c = (text: string) => ({ insert: text, attributes: { code: true } });

/** slug -> [key, vars, styles-what][] — MUST mirror THEME_TOKEN_REGISTRY. */
const SECTIONS: Record<string, { folder: string; rows: Array<[string, string, string]> }> = {
  paragraph: { folder: "10-paragraph", rows: [["fg", "--docs-paragraph-fg", "Paragraph text color"]] },
  heading: { folder: "11-heading", rows: [["fg", "--docs-heading-fg", "Heading text color (all levels)"]] },
  "list-item": {
    folder: "12-list-item",
    rows: [["marker", "--docs-list-marker-fg", "Bullet dot / ordered counter color"]],
  },
  quote: {
    folder: "13-quote",
    rows: [
      ["fg", "--docs-quote-fg", "Quote text color"],
      ["border", "--docs-quote-border", "Left border color"],
    ],
  },
  code: {
    folder: "14-code",
    rows: [
      ["bg", "--docs-code-block-bg", "Block background"],
      ["border", "--docs-code-block-border", "Block border"],
      ["string", "--syntax-string", "Syntax: string literals"],
      ["number", "--syntax-number", "Syntax: numbers"],
      ["boolean", "--syntax-boolean", "Syntax: booleans"],
      ["null", "--syntax-null", "Syntax: null/nil tokens"],
      ["key", "--syntax-key", "Syntax: object keys / attributes"],
    ],
  },
  callout: {
    folder: "15-callout",
    rows: [
      ["border", "--docs-viewer-callout-border", "Card border"],
      ["fill", "--docs-viewer-callout-fill", "Card background"],
      ["fg", "--docs-callout-fg", "Body text color"],
    ],
  },
  divider: { folder: "16-divider", rows: [["color", "--docs-divider-color", "Rule color"]] },
  "structured-table": {
    folder: "20-structured-table",
    rows: [
      ["border", "--docs-table-border", "Table and cell borders"],
      ["headerBg", "--docs-table-header-bg", "Header row background"],
      ["headerFg", "--docs-table-header-fg", "Header text color"],
    ],
  },
  "file-tree": {
    folder: "21-file-tree",
    rows: [
      ["border", "--docs-file-tree-border", "Container border"],
      ["note", "--docs-file-tree-note-fg", "Per-entry note text color"],
    ],
  },
  "interaction-surface": {
    folder: "22-interaction-surface",
    rows: [
      ["border", "--docs-interaction-border", "Container border"],
      ["bg", "--docs-interaction-bg", "Container background"],
    ],
  },
  mermaid: {
    folder: "23-mermaid",
    rows: [
      ["border", "--docs-mermaid-border", "Container border"],
      ["bg", "--docs-mermaid-bg", "Container background"],
    ],
  },
  canvas: { folder: "24-canvas", rows: [["border", "--docs-canvas-border", "Embed container border"]] },
  image: {
    folder: "30-image",
    rows: [
      ["border", "--docs-image-border", "Image border"],
      ["caption", "--docs-image-caption-fg", "Caption text color"],
    ],
  },
  video: {
    folder: "31-video",
    rows: [
      ["border", "--docs-video-border", "Frame border"],
      ["caption", "--docs-video-caption-fg", "Caption text color"],
    ],
  },
};

for (const [type, { folder, rows }] of Object.entries(SECTIONS)) {
  const docPath = `docs/10-system-design/10-block-vocabulary/${folder}/doc.json`;
  const doc = JSON.parse(readFileSync(docPath, "utf8")) as DocDocument;

  const mkId = (suffix: string) => {
    const id = `b-${folder}-theming-${suffix}`;
    if (doc.blocks[id]) throw new Error(`id collision: ${id}`);
    return id;
  };
  // Idempotence: skip docs that already carry the section.
  if (Object.keys(doc.blocks).some((id) => id.includes("-theming-"))) {
    console.log(`skip (already has section): ${folder}`);
    continue;
  }

  const headingId = mkId("heading");
  const paraId = mkId("para");
  const tableId = mkId("table");
  const blocks: DocBlock[] = [
    { id: headingId, type: "heading", props: { level: 2 }, text: [t("Theming")], children: [] },
    {
      id: paraId,
      type: "paragraph",
      props: {},
      text: [
        t("This block's theme file is "),
        c(`components/${type}.json`),
        t(" in a theme folder ("),
        c("themes/<id>/"),
        t("; see 20-implementation/40-theming). Every value is one string for both modes or a "),
        c("{ light, dark }"),
        t(" pair, validated against "),
        c("THEME_TOKEN_REGISTRY"),
        t("."),
      ],
      children: [],
    },
    {
      id: tableId,
      type: "structured-table",
      props: {
        columns: ["Key", "CSS variable", "Styles"],
        rows: rows.map(([key, vars, what]) => [key, vars, what]),
      },
      children: [],
    },
  ];
  for (const block of blocks) doc.blocks[block.id] = block;
  doc.blocks[doc.root].children.push(headingId, paraId, tableId);

  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${folder} invalid:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(docPath, serializeDocDocument(doc));
  writeFileSync(
    `packages/docs-model/src/__tests__/goldens/projection/docs__10-system-design__10-block-vocabulary__${folder}.md`,
    projectToMarkdown(doc),
  );
  console.log(`themed: ${folder} (+3 blocks)`);
}
console.log("done");
