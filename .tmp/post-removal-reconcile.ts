/**
 * Post mermaid/flavour-removal reconciliation (2026-07-22):
 * 1. rich-text carriers table: waterfall joins the false row (carriesText
 *    false in waterfall/state.ts).
 * 2. 10-document-tree: flavour is no longer a read alias — rejected with a
 *    typed issue; prose updated.
 * 3. 14-callout: coercion prose drops the flavour-aliasing clause.
 * 4. 20-block-design: strip the invalid stray props.title from the
 *    file-tree block b-bd-laidout-tree-3 (FileTreeState is entries-only);
 *    the title text becomes an intro paragraph so the caption survives.
 * 5. 50-package-boundaries: canonicalize — the live mermaid block coerces
 *    to a callout (kind "mermaid") via validation; flagged for the page's
 *    upcoming interview (replace with a canvas).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

function land(path: string, mutate: (doc: any) => void) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  mutate(doc);
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} INVALID: ${JSON.stringify(result.issues, null, 2)}`);
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  const bytes = readFileSync(path, "utf8");
  const re = validateDocDocument(JSON.parse(bytes));
  if (!re.ok || serializeDocDocument(re.document) !== bytes) {
    console.error(`${path} NOT CANONICAL after write`);
    process.exit(1);
  }
  console.log(`ok ${path}`);
}

// 1. Carriers table gains waterfall.
land("docs/10-system-design/40-block-vocabulary/10-rich-text/doc.json", (doc) => {
  const rows = doc.blocks["b-20-rich-text-carriers-table-13"].props.rows;
  rows[2][1] =
    "divider, image, video, structured-table, file-tree, state-shape, interaction-surface, sequence, canvas, waterfall";
});

// 2. Document-tree: flavour prose to post-removal truth.
land("docs/10-system-design/30-data-model/10-document-tree/doc.json", (doc) => {
  doc.blocks["b-dtree-legacy-brief-25"].text = [
    { insert: "The kind key is " },
    { insert: "type", attributes: { code: true } },
    { insert: "; the retired " },
    { insert: "flavour", attributes: { code: true } },
    {
      insert:
        " key is rejected with a typed validation issue. An unknown type name coerces to a callout with the name kept in ",
    },
    { insert: "props.kind", attributes: { code: true } },
    { insert: " — a retired type never fails validation." },
  ];
});

// 3. Callout page: coercion prose drops the aliasing clause.
land("docs/10-system-design/40-block-vocabulary/10-rich-text/14-callout/doc.json", (doc) => {
  const block = doc.blocks["b-15-callout-coercion-9"];
  const first = block.text[0];
  first.insert = first.insert.replace(
    "After legacy flavour aliasing, any block",
    "Any block",
  );
});

// 4. Block-design: stray file-tree title → intro paragraph.
land("docs/10-system-design/30-data-model/20-block-design/doc.json", (doc) => {
  const tree = doc.blocks["b-bd-laidout-tree-3"];
  const caption = tree.props.title;
  delete tree.props.title;
  if (typeof caption === "string" && caption.length > 0) {
    const intro = {
      id: "b-bd-laidout-intro-3a",
      type: "paragraph",
      props: {},
      text: [{ insert: `${caption[0].toUpperCase()}${caption.slice(1)}:` }],
      children: [],
    };
    doc.blocks[intro.id] = intro;
    const children = doc.blocks[doc.root].children;
    children.splice(children.indexOf("b-bd-laidout-tree-3"), 0, intro.id);
  }
});

// 5. Package-boundaries: canonicalize (mermaid block coerces to callout).
land("docs/10-system-design/50-package-boundaries/doc.json", () => {});
