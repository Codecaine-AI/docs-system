/**
 * Ford's read-through directive (2026-07-20, doc-by-doc loop,
 * 10-hierarchy-layers): the doc is "pretty good" — keep it; but the depth
 * ladder was implementation-pinned (L1 = 20-implementation, inherited from
 * the framework standard) and Ford's call is that the ladder applies to
 * EVERY layer. General update: L1 generalized to any layer's parent doc,
 * ladder prose states layer-agnostic scope, corpus section says "in every
 * layer", and a closing pointer links to 20-directory-structure (Ford:
 * "closely ties with the directory structure doc").
 * Canonical bytes; idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });

const PATH = "docs/10-system-design/10-doc-architecture/10-hierarchy-layers/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
const root = doc.blocks[doc.root];

const need = (id: string) => {
  if (!doc.blocks[id]) {
    console.error(`block missing: ${id} — doc changed under us; aborting`);
    process.exit(1);
  }
  return doc.blocks[id];
};

// 1. Generalize the ladder table's L1 row.
const table = need("b-hier-ladder-table-10");
table.props.rows = [
  [
    "L1",
    "A layer's parent doc (00-foundation, 10-system-design, 20-implementation)",
    "Layer summary plus a section index linking every L2",
  ],
  ["L2", "XX-section (the section's parent doc)", "Section scope and its children, one line each"],
  ["L3", "A concept doc", "One coherent idea — atomic, link-rich, code-connected"],
  [
    "L4",
    "Top of a source file",
    "The file's contract: responsibilities, dependencies, invariants — kept under 50 lines",
  ],
  [
    "L5",
    "Function docstrings",
    "The function's contract: purpose, inputs, outputs, side effects, errors",
  ],
  [
    "L6",
    "The code",
    "The implementation itself — read only after L4/L5 confirm you are in the right place",
  ],
];

// 2. Ladder prose: layer-agnostic scope.
need("b-hier-ladder-para-11").text = [
  t(
    "The ladder is the same in every layer: L1–L3 structure foundation and system design exactly as they structure implementation. The doc tree stays at three levels; a subsection appears only when a section genuinely subdivides. Below L3 the ladder continues into the source, so corpus and code form one continuous descent from intent to implementation.",
  ),
];

// 3. Corpus section: say "in every layer".
need("b-hier-corpus-ladder-14").text = [
  t(
    "The doc tree carries L1–L3 in every layer. L4 file headers and L5 docstrings live in the source itself, which keeps the ladder's lower rungs with the code they describe.",
  ),
];

// 4. Closing pointer to the directory-structure standard.
const LINK_ID = "b-hier-corpus-dirlink-18";
doc.blocks[LINK_ID] = {
  id: LINK_ID,
  type: "paragraph",
  props: {},
  text: [
    t("How this shape lands on disk — folders, bundles, parent docs — is "),
    {
      insert: "directory structure",
      attributes: {
        reference: {
          kind: "doc",
          path: "10-system-design/10-doc-architecture/20-directory-structure",
          label: "directory structure",
        },
      },
    },
    t("'s subject."),
  ],
  children: [],
};
const anchor = root.children.indexOf("b-hier-corpus-ladder-14");
if (anchor < 0) {
  console.error("anchor b-hier-corpus-ladder-14 not in root children; aborting");
  process.exit(1);
}
if (!root.children.includes(LINK_ID)) root.children.splice(anchor + 1, 0, LINK_ID);

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log("generalized ladder: table L1 row, 2 paragraphs, +1 pointer block");
