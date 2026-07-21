/**
 * Ford's directives (2026-07-21): the overview he rewrote now teaches the
 * three layers, so 10-structure refocuses on the SUBSTRUCTURE — the L1–L6
 * depth ladder — in his bullet/sub-bullet pattern (per the doc-standards +
 * system-design overviews). The layers section leaves the doc (purity
 * callout stays — it constrains the design layer's rungs); the Rate-of-
 * change why-bullet leaves with it. The numbering file-tree now SHOWS the
 * mechanics: children start at 10, gaps of ten, a marked hypothetical
 * mid-gap 25- insertion, the dense 10–17 deviation, 00/99 slots.
 * Replaces Ford's two-axes intro per this refocus directive (his layer
 * bullets move out with the layers story). Canonical bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const ref = (text: string, path: string): DeltaSpan => ({
  insert: text,
  attributes: { reference: { kind: "doc", path, label: text } },
});

const SEC = "docs/10-system-design/10-doc-standards";

function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`landed ${path}`);
}

// ---------------------------------------------------------------- 10-structure
{
  const path = `${SEC}/10-structure/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];

  const keep = (id: string) => {
    if (!doc.blocks[id]) {
      console.error(`expected kept block missing: ${id}; aborting`);
      process.exit(1);
    }
    return id;
  };

  const defs: Array<[string, Record<string, unknown>]> = [
    [
      "b-sub-intro-1",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Within every layer, the docs keep the same substructure: a tree of bundle folders descending L1–L6 — three levels in the doc tree, three in the source. This page states the depth ladder, the folder rules, and why the shape holds.",
          ),
        ],
      },
    ],
    [
      "b-sub-laidout-heading-2",
      { type: "heading", props: { level: 2 }, text: [t("How it's laid out")] },
    ],
    [
      "b-sub-laidout-tree-3",
      {
        type: "file-tree",
        props: {
          title: "docs",
          entries: [
            {
              path: "10-system-design/",
              note: "L1 — the layer's parent doc: summary plus an index of every section",
            },
            {
              path: "10-system-design/10-doc-standards/",
              note: "L2 — a section: the folder is itself a doc introducing its children",
            },
            {
              path: "10-system-design/10-doc-standards/10-structure/",
              note: "L3 — a concept doc: one coherent idea (this one)",
            },
            {
              path: "20-implementation/30-save-pipeline/",
              note: "a single doc — one concept covers it",
            },
            {
              path: "20-implementation/40-theming/",
              note: "a folder — themes split four ways",
            },
          ],
        },
      },
    ],
    [
      "b-sub-ladder-heading-4",
      { type: "heading", props: { level: 2 }, text: [t("The depth ladder")] },
    ],
    [
      "b-sub-ladder-lead-5",
      {
        type: "paragraph",
        props: {},
        text: [t("Six levels — three in the doc tree, three in the source:")],
      },
    ],
    // kept: ladder table (b-struct-ladder-table-10) — spliced below
    [
      "b-sub-ladder-same-6",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "The ladder is the same in every layer — L1–L3 structure foundation and system design exactly as they structure implementation.",
          ),
        ],
      },
    ],
    [
      "b-sub-ladder-three-7",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "The doc tree stays at three levels; a subsection appears only when a section genuinely subdivides.",
          ),
        ],
      },
    ],
    [
      "b-sub-ladder-source-8",
      {
        type: "list-item",
        props: {},
        text: [
          t("Below L3 the rungs live in the source — "),
          ref("in-code docs", "10-system-design/10-doc-standards/50-in-code-docs"),
          t(" owns them."),
        ],
      },
    ],
    // kept: purity callout (b-struct-purity-8) — spliced below
  ];

  const newBlocks: Record<string, unknown> = {};
  for (const [id, block] of defs) newBlocks[id] = { id, children: [], ...block };

  const newChildren = [
    "b-sub-intro-1",
    "b-sub-laidout-heading-2",
    "b-sub-laidout-tree-3",
    "b-sub-ladder-heading-4",
    "b-sub-ladder-lead-5",
    keep("b-struct-ladder-table-10"),
    "b-sub-ladder-same-6",
    "b-sub-ladder-three-7",
    "b-sub-ladder-source-8",
    // purity callout: Ford deleted it in a live edit (disk truth) — stays gone
    keep("b-struct-folders-heading-12"),
    keep("b-struct-bundle-13"),
    keep("b-struct-mirror-14"),
    keep("b-struct-parent-15"), // carries the abstract sub-bullet
    keep("b-struct-threshold-16"),
    keep("b-struct-anti-18"),
    keep("b-struct-why-heading-22"),
    keep("b-struct-why-descent-36"),
    keep("b-struct-why-mapping-37"),
    keep("b-struct-why-skipping-38"),
    keep("b-struct-why-honest-39"),
  ];

  // drop everything not kept (old intro incl. Ford's superseded two-axes
  // blocks, the layers section, the laid-out blocks being replaced, the
  // Rate-of-change why bullet)
  Object.assign(doc.blocks, newBlocks);
  root.children = newChildren;
  // garbage-collect everything unreachable from root (drops the old intro,
  // layers section, superseded laid-out blocks, and any nested pm- leftovers)
  const reachable = new Set<string>([doc.root]);
  const visit = (id: string) => {
    for (const sub of doc.blocks[id]?.children ?? []) {
      reachable.add(sub);
      visit(sub);
    }
  };
  visit(doc.root);
  let dropped = 0;
  for (const id of Object.keys(doc.blocks)) {
    if (!reachable.has(id)) {
      delete doc.blocks[id];
      dropped += 1;
    }
  }
  console.log(`structure: dropped ${dropped} blocks, added ${defs.length}`);
  land(path, doc);
}

// ---------------------------------------------------------------- 20-numbering
{
  const path = `${SEC}/20-numbering/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const tree = doc.blocks["b-num-laidout-tree-16"];
  if (!tree) {
    console.error("numbering tree block missing; aborting");
    process.exit(1);
  }
  tree.props.entries = [
    { path: "00-foundation/", note: "00 — early/foundational slot, used sparingly" },
    { path: "10-system-design/", note: "top-level sections gap by ten: 10-, 20-, 30-…" },
    {
      path: "10-system-design/10-doc-standards/10-structure/",
      note: "children start at 10",
    },
    {
      path: "10-system-design/10-doc-standards/20-numbering/",
      note: "siblings continue 20-, 30-, 40-…",
    },
    {
      path: "10-system-design/10-doc-standards/25-new-standard/",
      note: "← a mid-gap insertion lands here; nothing renumbers (hypothetical)",
    },
    {
      path: "10-system-design/40-block-vocabulary/10-rich-text/",
      note: "the named deviation: type pages run 10–17 dense, one family as a unit",
    },
    { path: "20-implementation/99-appendix/", note: "99 — appendix and meta only" },
  ];
  land(path, doc);
}

console.log("substructure refocus complete");
