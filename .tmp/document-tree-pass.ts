/**
 * Ford's document-tree interview (2026-07-21): trim the legacy
 * flavour/coercion section to a two-line paragraph (H2 + callout gone);
 * ADD a Nesting section (model allows any parent/child pairing — the
 * invariants constrain the graph; list-items nest as sub-bullets, callouts
 * group, editor keeps drops/pastes top-level); DROP the duplicate H1 and
 * the closing sibling-nav paragraph + its divider. Canonical bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });

const PATH = "docs/10-system-design/30-data-model/10-document-tree/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
const root = doc.blocks[doc.root];

const DROP = [
  "b-10-document-tree-title-1", // dup H1
  "b-10-document-tree-legacy-10", // legacy H2
  "b-10-document-tree-flavour-alias-11", // legacy para (replaced by short form)
  "b-10-document-tree-coercion-12", // legacy callout
  "b-10-document-tree-divider-23",
  "b-10-document-tree-closing-24", // sibling-nav paragraph
];

const newBlocks: Record<string, unknown> = {
  // two-line legacy summary, appended to "The block" section
  "b-dtree-legacy-brief-25": {
    id: "b-dtree-legacy-brief-25",
    type: "paragraph",
    props: {},
    children: [],
    text: [
      t("The kind key is "),
      c("type"),
      t("; the legacy "),
      c("flavour"),
      t(
        " alias is accepted on read and normalized. An unknown type name coerces to a callout with the name kept in ",
      ),
      c("props.kind"),
      t(" — nothing fails validation for being old."),
    ],
  },
  "b-dtree-nesting-h-26": {
    id: "b-dtree-nesting-h-26",
    type: "heading",
    props: { level: 2 },
    children: [],
    text: [t("Nesting")],
  },
  "b-dtree-nesting-lead-27": {
    id: "b-dtree-nesting-lead-27",
    type: "paragraph",
    props: {},
    children: [],
    text: [
      t(
        "Any block may parent any block — the invariants constrain the graph, not the pairing. Convention keeps the tree flat:",
      ),
    ],
  },
  "b-dtree-nest-lists-28": {
    id: "b-dtree-nest-lists-28",
    type: "list-item",
    props: {},
    children: [],
    text: [t("List-items nest: a list-item's children render as indented sub-bullets.")],
  },
  "b-dtree-nest-callouts-29": {
    id: "b-dtree-nest-callouts-29",
    type: "list-item",
    props: {},
    children: [],
    text: [t("Callouts group: a callout may hold the blocks that support it.")],
  },
  "b-dtree-nest-flat-30": {
    id: "b-dtree-nest-flat-30",
    type: "list-item",
    props: {},
    children: [],
    text: [
      t(
        "Everything else stays flat. The editor lands block drops and block-run pastes at top level, never inside a neighbor — depth is authored deliberately, not created by accident.",
      ),
    ],
  },
};

Object.assign(doc.blocks, newBlocks);
const insertLegacyAfter = "b-10-document-tree-block-example-6";
const insertNestingAfter = "b-10-document-tree-invariant-reachable-19";

root.children = root.children.flatMap((id: string) => {
  if (DROP.includes(id)) return [];
  if (id === insertLegacyAfter) return [id, "b-dtree-legacy-brief-25"];
  if (id === insertNestingAfter)
    return [
      id,
      "b-dtree-nesting-h-26",
      "b-dtree-nesting-lead-27",
      "b-dtree-nest-lists-28",
      "b-dtree-nest-callouts-29",
      "b-dtree-nest-flat-30",
    ];
  return [id];
});
for (const id of DROP) delete doc.blocks[id];

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log("document-tree pass landed");
