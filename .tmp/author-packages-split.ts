/**
 * Packages split directive: authors the NEW system-design section overview
 * (10-system-design/00-overview) and the NEW design-level package-boundaries
 * doc (10-system-design/50-package-boundaries); reframes
 * 20-implementation/10-packages/00-overview as the as-built package map;
 * absorbs and deletes the legacy 20-implementation/10-package-map bundle and
 * rewrites its one inbound reference (20-implementation/00-overview).
 * Canonical serializer bytes per bundle; idempotent (absolute writes only).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocDocument,
  type DocBlock,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const r = (label: string, path: string): DeltaSpan => ({
  insert: label,
  attributes: { reference: { kind: "doc", path, label } },
});

type BlockInput = Omit<DocBlock, "id" | "children"> & { children?: string[] };

function writeValidated(dir: string, doc: DocDocument): void {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${dir} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/doc.json`, serializeDocDocument(doc));
  console.log(`wrote ${dir}/doc.json (${Object.keys(doc.blocks).length} blocks)`);
}

function buildDoc(
  dir: string,
  docId: string,
  rootId: string,
  idSlug: string,
  title: string,
  defs: Array<[string, BlockInput]>,
): void {
  const blocks: Record<string, DocBlock> = {};
  const rootChildren: string[] = [];
  let n = 0;
  for (const [slug, block] of defs) {
    n += 1;
    const id = `b-${idSlug}-${slug}-${n}`;
    blocks[id] = { id, children: [], ...block } as DocBlock;
    rootChildren.push(id);
  }
  const doc: DocDocument = {
    schemaVersion: 1,
    id: docId,
    title,
    root: rootId,
    blocks: {
      [rootId]: { id: rootId, type: "paragraph", props: {}, children: rootChildren },
      ...blocks,
    },
  };
  writeValidated(dir, doc);
}

// ---------------------------------------------------------------------------
// Verbatim carries (literals lifted from the pre-split bundles so the script
// never depends on files it modifies or deletes).
// ---------------------------------------------------------------------------

// From 20-implementation/10-packages/00-overview, block b-00-overview-dependency-graph-4.
const dependencyGraphProps = {
  caption:
    "Arrows read: depends on. framework has no edges — it is methodology, not runtime. external/canvas sits outside the graph as a vendored neighbor.",
  title: "Who depends on whom",
};
const dependencyGraphText: DeltaSpan[] = [
  {
    insert:
      'flowchart BT\n  model["docs-model\\nthe format"]\n  index["docs-index\\nbacklinks (bun:sqlite)"]\n  server["docs-server\\nmutation authority"]\n  viewer["docs-viewer\\nReact render + edit"]\n  workbench["docs-workbench\\ncomposition shell"]\n  cli["docs-cli\\nagent dialect"]\n  index --> model\n  server --> index\n  server --> model\n  viewer --> model\n  workbench --> server\n  workbench --> viewer\n  workbench --> index\n  cli --> workbench\n  cli --> index\n  cli --> model',
  },
];

// From 20-implementation/10-packages/00-overview, block b-00-overview-mental-model-24.
const mentalModelProps = { kind: "Mental model", tone: "decision" };
const mentalModelText: DeltaSpan[] = [
  b("A RUNNING DOCS INSTALLATION"),
  t(" = "),
  c("docs-model + docs-index + docs-server + docs-viewer"),
  t(", composed by "),
  c("docs-workbench"),
  t(". "),
  b("AN AGENT INTERACTING WITH IT"),
  t(" speaks the "),
  c("docs-cli"),
  t(" dialect. "),
  c("framework"),
  t(" is methodology, not runtime; a running installation works identically without it."),
];

// From 20-implementation/10-package-map, block b-10-package-map-makefile-111.
const makefileText: DeltaSpan[] = [
  t("The repo-root "),
  c("Makefile"),
  t(" wraps common commands: "),
  c("make test"),
  t(", "),
  c("make typecheck"),
  t(", "),
  c("make check"),
  t(", "),
  c("make serve"),
  t(", "),
  c("make dev"),
  t(", "),
  c("make canvas"),
  t(", and "),
  c("make spa"),
  t("."),
];

// ---------------------------------------------------------------------------
// 1. NEW 10-system-design/00-overview — the section overview / narrative spine
// ---------------------------------------------------------------------------
buildDoc(
  "docs/10-system-design/00-overview",
  "10-system-design-00-overview",
  "b-sd-overview-root",
  "sdov",
  "System design — overview",
  [
    ["title", { type: "heading", props: { level: 1 }, text: [t("System design")] }],
    [
      "opener",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "System design is the middle layer of the corpus: what this system does, stated so it stays true across rewrites. Nothing here names a file or a framework — that detail belongs to the ",
          ),
          r("implementation layer", "20-implementation/00-overview"),
          t(
            " below. What this section fixes is behavior: the surfaces readers meet, the state those surfaces render, and the boundaries any implementation must respect.",
          ),
        ],
      },
    ],
    ["arc-heading", { type: "heading", props: { level: 2 }, text: [t("The arc")] }],
    [
      "arc-surfaces",
      {
        type: "paragraph",
        props: {},
        text: [
          t("The section reads as one argument. The "),
          r("manifesto", "00-foundation/00-manifesto"),
          t(
            " says why: docs define the function, and code is one implementation of it. System design begins where that conviction meets mechanism — a document is one canonical state met through two rendered ",
          ),
          r("interaction surfaces", "10-system-design/10-interaction-surfaces"),
          t(
            ", a Notion-style editor for humans and deterministic markdown for agents. Everything else in the section is the working-out of that one commitment.",
          ),
        ],
      },
    ],
    [
      "arc-corpus",
      {
        type: "paragraph",
        props: {},
        text: [
          t("The corpus that states all this is itself a designed artifact. "),
          r("Doc architecture", "10-system-design/20-doc-architecture/00-overview"),
          t(
            " holds its structure and the standards that govern it — layers, numbering, overviews, linking — each rule with its rationale, and now carries the standards themselves as child docs.",
          ),
        ],
      },
    ],
    [
      "arc-data",
      {
        type: "paragraph",
        props: {},
        text: [
          t("From there the section turns to representation: the "),
          r("data model", "10-system-design/30-data-model/00-overview"),
          t(
            " gives the canonical state its shapes — document tree, rich text, block state, comments, canonical bytes — and its mutation behavior, the typed operations that are the only way state changes.",
          ),
        ],
      },
    ],
    [
      "arc-vocab-cuts",
      {
        type: "paragraph",
        props: {},
        text: [
          t("The "),
          r("block vocabulary", "10-system-design/40-block-vocabulary/00-overview"),
          t(
            " then enumerates the fourteen block types those shapes admit — every prop and every typed action, deliberately closed so both surfaces stay stable. Last, ",
          ),
          r("package boundaries", "10-system-design/50-package-boundaries"),
          t(
            " fixes where the code is allowed to be cut: which seams are forced by runtimes, and which are judgment calls still open to collapse.",
          ),
        ],
      },
    ],
    ["children-heading", { type: "heading", props: { level: 2 }, text: [t("In this section")] }],
    [
      "child-surfaces",
      {
        type: "list-item",
        props: {},
        text: [
          r("Interaction surfaces", "10-system-design/10-interaction-surfaces"),
          t(" — one canonical state, two readers, and the surface each one meets."),
        ],
      },
    ],
    [
      "child-docarch",
      {
        type: "list-item",
        props: {},
        text: [
          r("Doc architecture", "10-system-design/20-doc-architecture/00-overview"),
          t(" — the corpus as a designed artifact: structure, standards, and their reasons."),
        ],
      },
    ],
    [
      "child-datamodel",
      {
        type: "list-item",
        props: {},
        text: [
          r("Data model", "10-system-design/30-data-model/00-overview"),
          t(" — the shapes of the canonical state and the mutation model that changes it."),
        ],
      },
    ],
    [
      "child-vocab",
      {
        type: "list-item",
        props: {},
        text: [
          r("Block vocabulary", "10-system-design/40-block-vocabulary/00-overview"),
          t(" — all fourteen block types, their props, and their typed actions."),
        ],
      },
    ],
    [
      "child-boundaries",
      {
        type: "list-item",
        props: {},
        text: [
          r("Package boundaries", "10-system-design/50-package-boundaries"),
          t(" — where the code may be cut, and which seams are forced versus chosen."),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 2. NEW 10-system-design/50-package-boundaries — design-level residue of the
//    former packages section
// ---------------------------------------------------------------------------
buildDoc(
  "docs/10-system-design/50-package-boundaries",
  "10-system-design-50-package-boundaries",
  "b-50-package-boundaries-root",
  "pkgb",
  "Package boundaries",
  [
    ["title", { type: "heading", props: { level: 1 }, text: [t("Package boundaries")] }],
    [
      "lead",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The package split is where this system says the code is allowed to be cut. It is a map of runtime and ownership boundaries, not a list of pieces a user assembles by hand: some seams isolate genuinely incompatible environments and would survive any rewrite; others are current judgment calls, named as such and open to collapse.",
          ),
        ],
      },
    ],
    ["why-heading", { type: "heading", props: { level: 2 }, text: [t("Why seven")] }],
    [
      "why-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The count is six code packages plus one methodology package. The defensible splits follow incompatible runtimes first: one definition of the document format has to exist identically in the browser, on a Bun server, and inside a CLI, and no single artifact can serve all three unless it stays free of every environment's dependencies. The remaining seams expose current responsibilities and distribution choices rather than hard constraints — real boundaries today, but boundaries this page treats as decisions, not facts of nature.",
          ),
        ],
      },
    ],
    ["chain-heading", { type: "heading", props: { level: 2 }, text: [t("The dependency chain")] }],
    ["chain-graph", { type: "mermaid", props: dependencyGraphProps, text: dependencyGraphText }],
    [
      "chain-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The chain is the design claim, not a build detail: the format depends on nothing, the index and server depend only on the format, the viewer sees the format and nothing else, and only the composition and interface layers — workbench and cli — are allowed to see everything. Dependency points one way, so a change in any layer can only ripple upward, never into the schema beneath it.",
          ),
        ],
      },
    ],
    ["need-heading", { type: "heading", props: { level: 2 }, text: [t("What you actually need together")] }],
    [
      "need-para",
      {
        type: "paragraph",
        props: {},
        text: [t("The seven-way split describes ownership, not deployment. What runs together is smaller:")],
      },
    ],
    ["mental-model", { type: "callout", props: mentalModelProps, text: mentalModelText }],
    ["forced-heading", { type: "heading", props: { level: 2 }, text: [t("Forced boundaries vs judgment calls")] }],
    [
      "forced-intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Each boundary earns its place for exactly one reason, and the reasons split cleanly in two. Forced boundaries follow from runtime incompatibilities and survive package renames and reorganizations. Judgment calls are defensible drawings of responsibility that could land elsewhere.",
          ),
        ],
      },
    ],
    [
      "why-model",
      {
        type: "list-item",
        props: {},
        text: [
          b("docs-model — one format, three runtimes."),
          t(" Browser, Bun server, and CLI must share one definition of "),
          c("doc.json"),
          t("; pure TypeScript with no React, filesystem, or network access is what makes that possible. Forced."),
        ],
      },
    ],
    [
      "why-index",
      {
        type: "list-item",
        props: {},
        text: [
          b("docs-index — Bun-only."),
          t(" "),
          c("bun:sqlite"),
          t(
            " cannot be bundled into the browser, so the derived backlink index lives outside the viewer. Forced out of the browser; separate from the server by judgment.",
          ),
        ],
      },
    ],
    [
      "why-server",
      {
        type: "list-item",
        props: {},
        text: [
          b("docs-server — embeddable without React."),
          t(" The mutation authority must drop into host applications that have no UI stack. Forced."),
        ],
      },
    ],
    [
      "why-viewer",
      {
        type: "list-item",
        props: {},
        text: [
          b("docs-viewer — browser-pure."),
          t(
            " The render-and-edit surface must lift into any host React app with docs-model as its only docs dependency. Forced.",
          ),
        ],
      },
    ],
    [
      "why-workbench",
      {
        type: "list-item",
        props: {},
        text: [
          b("docs-workbench — the composition point."),
          t(
            " It deliberately reunites server and viewer at the runnable-product boundary instead of weakening either package's constraints. Judgment, and by design.",
          ),
        ],
      },
    ],
    [
      "why-cli",
      {
        type: "list-item",
        props: {},
        text: [
          b("docs-cli — the stable dialect."),
          t(" Agents and humans get one command surface that outlives internal reshuffles. Judgment: "),
          c("serve"),
          t(" and "),
          c("export"),
          t(" already drive the workbench."),
        ],
      },
    ],
    [
      "why-framework",
      {
        type: "list-item",
        props: {},
        text: [
          b("framework — distribution convenience."),
          t(
            " Zero dependencies, zero runtime code; packaging the methodology just lets host repos resolve and symlink it like any dependency. Judgment.",
          ),
        ],
      },
    ],
    [
      "why-canvas",
      {
        type: "list-item",
        props: {},
        text: [
          b("canvas — not an eighth package."),
          t(" "),
          c("external/canvas"),
          t(" is its own project, vendored under "),
          c("external/"),
          t("; only its inner packages join the workspace so embeds resolve. Forced."),
        ],
      },
    ],
    ["review-heading", { type: "heading", props: { level: 2 }, text: [t("Boundaries under review")] }],
    [
      "review-index",
      {
        type: "callout",
        props: { tone: "decision", title: "Boundary under review: fold docs-index into docs-server" },
        text: [
          t(
            "Keeping the index out of the browser is forced; keeping it out of the server is not. The index is derived, rebuildable state that only the server and CLI consume — it may belong inside the mutation authority.",
          ),
        ],
      },
    ],
    [
      "review-cli",
      {
        type: "callout",
        props: { tone: "decision", title: "Boundary under review: merge docs-cli and docs-workbench" },
        text: [
          c("serve"),
          t(" and "),
          c("export"),
          t(
            " already drive the workbench, so the interface package and the composition package may be one package wearing two entry points.",
          ),
        ],
      },
    ],
    [
      "review-framework",
      {
        type: "callout",
        props: { tone: "decision", title: "Boundary under review: unpackage framework" },
        text: [
          t(
            "The methodology has no runtime; a running installation behaves identically without it. Packaging is a distribution channel, and the channel could change without touching the architecture.",
          ),
        ],
      },
    ],
    ["authority-heading", { type: "heading", props: { level: 2 }, text: [t("Schema authority")] }],
    [
      "authority-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "One claim outranks the rest of this page: docs-model's types are the canonical definition of the system, and every other package is machinery around them. The server enforces the types, the viewer renders them, the index derives from them, the CLI speaks them. Cut the packages differently tomorrow and the system survives; change the types and every package follows.",
          ),
        ],
      },
    ],
    [
      "asbuilt-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "How the split stands in code today — every package, what it owns, and the tests that hold these boundaries — is the ",
          ),
          r("as-built package map", "20-implementation/10-packages/00-overview"),
          t("."),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 3. EDIT 20-implementation/10-packages/00-overview — reframe as the as-built
//    package map (read-modify-write; absolute values only, so idempotent)
// ---------------------------------------------------------------------------
{
  const dir = "docs/20-implementation/10-packages/00-overview";
  const doc = JSON.parse(readFileSync(`${dir}/doc.json`, "utf8")) as DocDocument;

  doc.title = "Package map";

  doc.blocks["b-00-overview-title-1"] = {
    id: "b-00-overview-title-1",
    type: "heading",
    props: { level: 1 },
    text: [t("Package map")],
    children: [],
  };

  doc.blocks["b-00-overview-lead-2"] = {
    id: "b-00-overview-lead-2",
    type: "paragraph",
    props: {},
    text: [
      t(
        "The as-built inventory: every workspace package, what it owns today, and the tests that keep the seams honest. Why the boundaries sit where they do — the runtime constraints, the judgment calls, the live merge candidates — is design, not inventory: see ",
      ),
      r("Package boundaries", "10-system-design/50-package-boundaries"),
      t("."),
    ],
    children: [],
  };

  doc.blocks["b-00-overview-makefile-31"] = {
    id: "b-00-overview-makefile-31",
    type: "paragraph",
    props: {},
    text: makefileText,
    children: [],
  };

  const keep = [
    "b-00-overview-title-1",
    "b-00-overview-lead-2",
    "b-00-overview-model-role-5",
    "b-00-overview-index-role-6",
    "b-00-overview-server-role-7",
    "b-00-overview-viewer-role-8",
    "b-00-overview-workbench-role-9",
    "b-00-overview-cli-role-10",
    "b-00-overview-framework-role-11",
    "b-00-overview-canvas-role-12",
    "b-00-overview-makefile-31",
    "b-00-overview-enforcement-28",
    "b-00-overview-import-test-29",
    "b-00-overview-component-mirror-30",
  ];
  const missing = keep.filter((id) => !doc.blocks[id]);
  if (missing.length > 0) {
    console.error(`${dir}: expected blocks missing:`, missing);
    process.exit(1);
  }
  const rootBlock = doc.blocks[doc.root];
  const blocks: Record<string, DocBlock> = {
    [doc.root]: { ...rootBlock, children: keep },
  };
  for (const id of keep) blocks[id] = doc.blocks[id];
  doc.blocks = blocks;

  writeValidated(dir, doc);
}

// ---------------------------------------------------------------------------
// 4. EDIT 20-implementation/00-overview — repoint the package-map reference at
//    the as-built package map (read-modify-write; absolute values only)
// ---------------------------------------------------------------------------
{
  const dir = "docs/20-implementation/00-overview";
  const doc = JSON.parse(readFileSync(`${dir}/doc.json`, "utf8")) as DocDocument;
  const blockId = "b-00-system-overview-each-layer-only-depends-6";
  const block = doc.blocks[blockId];
  if (!block) {
    console.error(`${dir}: expected block missing: ${blockId}`);
    process.exit(1);
  }
  block.text = [
    t("Each layer only depends on the layers above it in this list. The\n"),
    r("package map", "20-implementation/10-packages/00-overview"),
    t(" walks through every package in\ndetail."),
  ];
  writeValidated(dir, doc);
}

// ---------------------------------------------------------------------------
// 5. DELETE 20-implementation/10-package-map (absorbed above)
// ---------------------------------------------------------------------------
if (existsSync("docs/20-implementation/10-package-map")) {
  rmSync("docs/20-implementation/10-package-map", { recursive: true, force: true });
  console.log("deleted docs/20-implementation/10-package-map");
} else {
  console.log("docs/20-implementation/10-package-map already deleted");
}

console.log("packages-split docs authored");
