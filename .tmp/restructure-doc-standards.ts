/**
 * Ford's read-through directives (2026-07-20, doc-by-doc loop interview):
 * the doc-architecture section becomes 10-doc-standards with FIVE children —
 * 10-structure (hierarchy-layers + directory-structure merged), 20-numbering,
 * 30-cross-doc-linking (four link rules landed, open call RESOLVED),
 * 40-code-linking, 50-in-code-docs (NEW: file headers / docstrings / inline
 * comments — the L4/L5 story). titles-and-openings ports to writingstyle.md
 * and its bundle is deleted. Also: up-references from block-vocabulary type
 * pages to their section parent are unwrapped (new no-ancestor-links rule),
 * and "doc architecture" span labels become "doc standards".
 * Section/child folder moves already done via /api/move. Canonical bytes.
 */
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });
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
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`landed ${path}`);
}

function makeDoc(
  id: string,
  title: string,
  rootId: string,
  defs: Array<[string, Record<string, unknown>]>,
) {
  const blocks: Record<string, unknown> = {};
  const children: string[] = [];
  for (const [bid, block] of defs) {
    blocks[bid] = { id: bid, children: [], ...block };
    children.push(bid);
  }
  blocks[rootId] = { id: rootId, type: "paragraph", props: {}, children };
  return { schemaVersion: 1, id, title, root: rootId, blocks };
}

// ---------------------------------------------------------------- 10-structure
const structure = makeDoc(
  "10-system-design-10-doc-standards-10-structure",
  "Structure",
  "b-struct-root",
  [
    [
      "b-struct-intro-1",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Every doc has one home, and two axes decide it: layer — which kind of knowledge it is — and depth — how far down the tree it sits. The corpus is a tree of bundle folders whose shape is itself a contract. This page states the layer rules, the depth ladder, the folder rules, and why the shape is what it is.",
          ),
        ],
      },
    ],
    [
      "b-struct-layers-heading-2",
      { type: "heading", props: { level: 2 }, text: [t("The layers")] },
    ],
    [
      "b-struct-layer-foundation-3",
      {
        type: "list-item",
        props: {},
        text: [
          c("00-foundation"),
          t(
            " holds intent: north star, identity, fundamental approach. Its structure is organic; only its parent doc is required.",
          ),
        ],
      },
    ],
    [
      "b-struct-layer-design-4",
      {
        type: "list-item",
        props: {},
        text: [
          c("10-system-design"),
          t(
            " holds behavior: what the system does and why, organized by concept, code-agnostic — anything a builder in any language would need.",
          ),
        ],
      },
    ],
    [
      "b-struct-layer-impl-5",
      {
        type: "list-item",
        props: {},
        text: [
          c("20-implementation"),
          t(
            " holds the current code: how this codebase does it, mirroring the source tree, written in present tense about the system as it is.",
          ),
        ],
      },
    ],
    [
      "b-struct-layer-appendix-6",
      {
        type: "list-item",
        props: {},
        text: [
          c("20-implementation/99-appendix"),
          t(" holds operational material: setup, tooling, infrastructure."),
        ],
      },
    ],
    [
      "b-struct-litmus-7",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The placement litmus test: product behavior or architecture changed → System Design. How the code handles it changed → Implementation. The north star shifted → Foundation. Setup or tooling → the appendix.",
          ),
        ],
      },
    ],
    [
      "b-struct-purity-8",
      {
        type: "callout",
        props: {
          kind: "Purity test",
          title: "The Design layer stays code-agnostic",
          tone: "warning",
        },
        text: [
          t(
            "A System Design doc must be implementable, in any language, from these docs alone — and silent about how it is built. No class names, no framework names, no language features. Catch yourself writing one and you have drifted into Implementation territory.",
          ),
        ],
      },
    ],
    [
      "b-struct-ladder-heading-9",
      { type: "heading", props: { level: 2 }, text: [t("The depth ladder")] },
    ],
    [
      "b-struct-ladder-table-10",
      {
        type: "structured-table",
        props: {
          columns: ["Level", "Lives at", "Carries"],
          rows: [
            [
              "L1",
              "A layer's parent doc (00-foundation, 10-system-design, 20-implementation)",
              "Layer summary plus a section index linking every L2",
            ],
            [
              "L2",
              "XX-section (the section's parent doc)",
              "Section scope and its children, one line each",
            ],
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
          ],
        },
      },
    ],
    [
      "b-struct-ladder-para-11",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The ladder is the same in every layer: L1–L3 structure foundation and system design exactly as they structure implementation. The doc tree stays at three levels; a subsection appears only when a section genuinely subdivides. Below L3 the ladder continues into the source — the in-source rungs have their own standard, ",
          ),
          ref("in-code docs", "10-system-design/10-doc-standards/50-in-code-docs"),
          t("."),
        ],
      },
    ],
    [
      "b-struct-folders-heading-12",
      { type: "heading", props: { level: 2 }, text: [t("Folders and bundles")] },
    ],
    [
      "b-struct-bundle-13",
      {
        type: "list-item",
        props: {},
        text: [
          t("A doc is a folder containing "),
          c("doc.json"),
          t(" — "),
          c("10-authentication/"),
          t(" holding a bundle, not "),
          c("10-authentication.md"),
          t(". The folder name is the doc's address; the bundle inside is its state."),
        ],
      },
    ],
    [
      "b-struct-mirror-14",
      {
        type: "list-item",
        props: {},
        text: [
          t("Implementation mirrors the source: "),
          c("src/core/workflow/"),
          t(" documents at "),
          c("docs/20-implementation/10-core/10-workflow/"),
          t(
            ". Cross-cutting concerns — logging, caching, error handling — get one primary home, never a scatter.",
          ),
        ],
      },
    ],
    [
      "b-struct-parent-15",
      {
        type: "list-item",
        props: {},
        text: [
          t("A section folder is itself a document: it carries its own "),
          c("doc.json"),
          t(
            " — the parent doc — introducing its immediate children, one level deep, one line each.",
          ),
        ],
      },
    ],
    [
      "b-struct-threshold-16",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "A topic becomes a folder when it needs about three related docs or has clear room to grow; until then it stays a single doc. A folder holding only its parent doc plus one child collapses back into a single doc.",
          ),
        ],
      },
    ],
    [
      "b-struct-abstract-17",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The parent doc is an abstract, not a table of contents. After reading it, a reader can explain the domain, knows what each child holds, and descends only where the task lives.",
          ),
        ],
      },
    ],
    [
      "b-struct-anti-18",
      {
        type: "callout",
        props: { kind: "Anti-patterns", tone: "warning" },
        text: [
          t("Flat sprawl (dozens of siblings, no hierarchy), over-nesting ("),
          c("10-app/10-backend/10-services/10-user/…"),
          t("), and sections with children but no parent "),
          c("doc.json"),
          t(
            " all break the same contract: that a reader can decide, at each level, whether to descend.",
          ),
        ],
      },
    ],
    [
      "b-struct-corpus-heading-19",
      { type: "heading", props: { level: 2 }, text: [t("In this corpus")] },
    ],
    [
      "b-struct-corpus-layers-20",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Foundation holds the manifesto, and nothing else is prescribed there. System Design's sections name no packages or files. ",
          ),
          c("docs/20-implementation/10-packages/"),
          t(" mirrors "),
          c("packages/"),
          t(
            " with one doc per workspace package, and every section folder in the corpus carries its parent doc — this one included.",
          ),
        ],
      },
    ],
    [
      "b-struct-corpus-folders-21",
      {
        type: "paragraph",
        props: {},
        text: [
          c("40-theming"),
          t(" is a folder because themes split four ways — global, component, fonts, system UI — while "),
          c("30-save-pipeline"),
          t(
            " stays a single doc because one concept covers it. The doc tree carries L1–L3 in every layer; file headers and docstrings keep the ladder's lower rungs in the source, with the code they describe.",
          ),
        ],
      },
    ],
    ["b-struct-why-heading-22", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
    [
      "b-struct-why-decay-23",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Layering by rate of change keeps the durable from rotting with the volatile: swap the backend's language and the Implementation docs are rewritten, System Design barely moves, Foundation does not move at all. The purity test is what makes that promise real — a Design doc that names a class is coupled to the code it was supposed to outlive.",
          ),
        ],
      },
    ],
    [
      "b-struct-why-ladder-24",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The ladder exists for descent control. A reader takes only the depth the task requires, and every rung states enough to decide whether the next one is worth the trip — that is what makes reading the corpus cheaper than reading the code.",
          ),
        ],
      },
    ],
    [
      "b-struct-why-mirror-25",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Mirroring makes the mapping mechanical in both directions: standing in the source you can name the doc's address, and standing in the doc you can name the source path — no index required. The parent-doc requirement is what makes skipping safe: the corpus works as a repair manual only if a reader can rule a folder out without opening its children.",
          ),
        ],
      },
    ],
    [
      "b-struct-why-threshold-26",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The folder threshold keeps the tree honest. Structure records how the material actually grew, not how it might someday — premature folders add a level of descent that pays nothing, and orphaned parent-plus-one folders are pure tax.",
          ),
        ],
      },
    ],
  ],
);
land(`${SEC}/10-structure/doc.json`, structure);

// ------------------------------------------------------- 30-cross-doc-linking
const xlink = makeDoc(
  "10-system-design-10-doc-standards-30-cross-doc-linking",
  "Cross-doc linking",
  "b-dlink-root",
  [
    [
      "b-xlink-intro-1",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Docs link to docs with typed reference spans — tracked by the backlinks index, held at zero stale, rewritten when targets move — never with raw paths in prose. This page states how to link, which directions links run, and the restraint rules that keep the corpus from overlinking.",
          ),
        ],
      },
    ],
    ["b-xlink-rule-heading-2", { type: "heading", props: { level: 2 }, text: [t("The rule")] }],
    [
      "b-xlink-spans-3",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Doc-to-doc links are reference spans. A plain path in prose is invisible to the system and is not a link.",
          ),
        ],
      },
    ],
    [
      "b-xlink-labels-4",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Give every reference a declarative label that says what the target provides — never \"click here\" or \"this document\".",
          ),
        ],
      },
    ],
    [
      "b-xlink-restraint-lead-5",
      { type: "paragraph", props: {}, text: [t("Direction and restraint:")] },
    ],
    [
      "b-xlink-home-6",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Link to a concept's one canonical home — never into another section's internals. What crosses a boundary gets referenced at the boundary.",
          ),
        ],
      },
    ],
    [
      "b-xlink-first-7",
      { type: "list-item", props: {}, text: [t("Link on first mention in a doc, not every mention.")] },
    ],
    [
      "b-xlink-ancestors-8",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "No links to your own ancestors. The tree already provides them; parent docs link down, children do not link up.",
          ),
        ],
      },
    ],
    [
      "b-xlink-claim-9",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "A link is a claim that the reader may need the target for the task at hand. Decorative links are cut.",
          ),
        ],
      },
    ],
    [
      "b-xlink-deferral-10",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "No mutual deferral: two docs each pointing at the other for the full explanation means neither owns it. One doc owns the substance; the other references it.",
          ),
        ],
      },
    ],
    [
      "b-xlink-corpus-heading-11",
      { type: "heading", props: { level: 2 }, text: [t("In this corpus")] },
    ],
    [
      "b-xlink-mechanism-12",
      {
        type: "paragraph",
        props: {},
        text: [
          t("A reference span is a typed attribute on a text span — the "),
          ref("rich-text model", "10-system-design/30-data-model/20-rich-text"),
          t(" defines it — carrying a target kind, path, and label. The backlinks index tracks every one; "),
          c("docs links check"),
          t(
            " holds the corpus at zero stale references; moving a doc rewrites its inbound references in the same operation. In the markdown render a reference prints as its label, so a link label is prose on both surfaces.",
          ),
        ],
      },
    ],
    [
      "b-xlink-decision-13",
      {
        type: "callout",
        props: {
          kind: "Decision",
          title: "Top-down, with canonical-home crossings",
          tone: "decision",
        },
        text: [
          t(
            "Decided 2026-07-20: navigation runs top-down — parents introduce children, and no doc links to its own ancestors. Substance may cross sections, but only at a concept's canonical home. Overlinking is held down by the restraint rules above, not by banning cross-links. This closes the earlier open call on strict top-down versus observed up-references; the block-vocabulary type pages' upward references were removed under it.",
          ),
        ],
      },
    ],
    ["b-xlink-why-heading-14", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
    [
      "b-xlink-why-typed-15",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Typed references are the reason dense linking is safe to rely on: a link the system tracks cannot silently rot, so a reader can trust every one they follow. Label discipline exists because references render as their labels on the agent surface — a bad label is bad prose there, not just a bad link.",
          ),
        ],
      },
    ],
    [
      "b-xlink-why-direction-16",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Direction discipline keeps the navigation graph a tree even while the substance graph is a web: parent docs stay the one place navigation happens, so moving through the corpus feels the same everywhere. Restraint is what keeps the web readable — when every link is a claim of need, a reader can afford to follow them; a corpus that links everything ranks nothing. And the mutual-deferral ban keeps ownership sharp: every concept has exactly one home, and every link points at it.",
          ),
        ],
      },
    ],
  ],
);
land(`${SEC}/30-cross-doc-linking/doc.json`, xlink);

// ------------------------------------------------------------ 40-code-linking
{
  const path = `${SEC}/40-code-linking/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const ID = "b-clink-incode-14";
  doc.blocks[ID] = {
    id: ID,
    type: "paragraph",
    props: {},
    text: [
      t("Docs point at code with paths. What the code itself carries — file headers, docstrings, inline comments — is "),
      ref("in-code docs", "10-system-design/10-doc-standards/50-in-code-docs"),
      t("'s subject."),
    ],
    children: [],
  };
  const root = doc.blocks[doc.root];
  const anchor = root.children.indexOf("b-clink-corpus-para-10");
  if (anchor < 0) {
    console.error("code-linking anchor missing; aborting");
    process.exit(1);
  }
  if (!root.children.includes(ID)) root.children.splice(anchor + 1, 0, ID);
  land(path, doc);
}

// ------------------------------------------------------------ 50-in-code-docs
const icd = makeDoc(
  "10-system-design-10-doc-standards-50-in-code-docs",
  "In-code docs",
  "b-icd-root",
  [
    [
      "b-icd-intro-1",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Documentation does not stop at the corpus. Below the doc tree it continues into the source in three units — file headers, function docstrings, inline comments — finishing the descent the depth ladder starts: section, doc, file, function, code.",
          ),
        ],
      },
    ],
    ["b-icd-rule-heading-2", { type: "heading", props: { level: 2 }, text: [t("The rule")] }],
    [
      "b-icd-header-3",
      {
        type: "list-item",
        props: {},
        text: [
          b("File header"),
          t(
            " — the top of a source file states the file's contract: responsibilities, dependencies, invariants. A reader knows what the file holds before any code scrolls past. Kept under 50 lines.",
          ),
        ],
      },
    ],
    [
      "b-icd-docstring-4",
      {
        type: "list-item",
        props: {},
        text: [
          b("Function docstrings"),
          t(
            " — a non-obvious function states its contract: purpose, inputs, outputs, side effects, errors.",
          ),
        ],
      },
    ],
    [
      "b-icd-comments-5",
      {
        type: "list-item",
        props: {},
        text: [
          b("Inline comments"),
          t(
            " — explain the why of a non-obvious move as the code goes, never restating what the line already says.",
          ),
        ],
      },
    ],
    [
      "b-icd-flow-6",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Each unit answers the same question a parent doc answers one level up: is the thing I need below this point? The header rules the file in or out, docstrings rule the function in or out, and comments carry the reader through what remains.",
          ),
        ],
      },
    ],
    [
      "b-icd-corpus-heading-7",
      { type: "heading", props: { level: 2 }, text: [t("In this corpus")] },
    ],
    [
      "b-icd-corpus-8",
      {
        type: "paragraph",
        props: {},
        text: [
          c("packages/docs-workbench/web/src/lib/doc-title.ts"),
          t(
            " opens on a header stating what the module owns and where the shared logic lives — before its first import. No unit carries doc links: ",
          ),
          ref("code linking", "10-system-design/10-doc-standards/40-code-linking"),
          t(" is one-way, and the source stays ignorant of the corpus."),
        ],
      },
    ],
    ["b-icd-why-heading-9", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
    [
      "b-icd-why-churn-10",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The corpus stops at L3 deliberately — one doc per concept, not one per file. Files churn too fast for doc bundles; keeping the lower rungs in the source means they move, diff, and review with the code they describe.",
          ),
        ],
      },
    ],
    [
      "b-icd-why-flow-11",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The payoff is the reading flow: a reader leaves the corpus with the question framed, opens the file, and the first screenful confirms or rules it out. Code is read last, and only where the task lives.",
          ),
        ],
      },
    ],
  ],
);
land(`${SEC}/50-in-code-docs/doc.json`, icd);

// ------------------------------------------------------------------- overview
{
  const path = `${SEC}/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  doc.title = "Doc standards";
  const root = doc.blocks[doc.root];

  doc.blocks["b-darch-standards-intro-28"].text = [
    t(
      "Five standards, one concern each. Every one states its rule, shows what it looks like in this corpus, and defends the choice.",
    ),
  ];

  const stdDefs: Array<[string, string, string, string]> = [
    [
      "b-ds-std-structure-1",
      "Structure",
      "10-system-design/10-doc-standards/10-structure",
      " — the three layers, the depth ladder, folders and parent docs, and when a topic earns a folder.",
    ],
    [
      "b-ds-std-numbering-2",
      "Numbering",
      "10-system-design/10-doc-standards/20-numbering",
      " — two-digit prefixes, reading order in the filesystem, gaps, and the one named deviation.",
    ],
    [
      "b-ds-std-xlink-3",
      "Cross-doc linking",
      "10-system-design/10-doc-standards/30-cross-doc-linking",
      " — reference spans, canonical-home targets, and the restraint rules against overlinking.",
    ],
    [
      "b-ds-std-clink-4",
      "Code linking",
      "10-system-design/10-doc-standards/40-code-linking",
      " — one-way doc-to-code references by full path, updated when code moves.",
    ],
    [
      "b-ds-std-icd-5",
      "In-code docs",
      "10-system-design/10-doc-standards/50-in-code-docs",
      " — file headers, docstrings, and inline comments: where documentation continues into the source.",
    ],
  ];
  const OLD_STD = [
    "b-darch-std-hier-29",
    "b-darch-std-dirs-30",
    "b-darch-std-num-31",
    "b-darch-std-topen-32",
    "b-darch-std-dlink-33",
    "b-darch-std-clink-34",
  ];
  const firstOld = root.children.indexOf(OLD_STD[0]);
  if (firstOld < 0) {
    console.error("overview standards anchor missing; aborting");
    process.exit(1);
  }
  const newStdIds: string[] = [];
  for (const [bid, label, refPath, gloss] of stdDefs) {
    doc.blocks[bid] = {
      id: bid,
      type: "list-item",
      props: {},
      text: [ref(label, refPath), t(gloss)],
      children: [],
    };
    newStdIds.push(bid);
  }
  root.children = root.children.flatMap((id: string) =>
    id === OLD_STD[0] ? newStdIds : OLD_STD.includes(id) ? [] : [id],
  );
  for (const id of OLD_STD) delete doc.blocks[id];

  doc.blocks["b-da3-layers-pointer-9"].text = [
    t("The full placement rules — the litmus test and the L1–L6 depth ladder — live in the "),
    ref("structure standard", "10-system-design/10-doc-standards/10-structure"),
    t("."),
  ];
  // ref() uses label = insert text; keep the landed phrasing
  doc.blocks["b-da3-layers-pointer-9"].text[1].attributes.reference.label = "structure standard";

  const tree = doc.blocks["b-da3-shape-tree-13"];
  tree.props.entries = tree.props.entries.map((e: { path: string; note: string }) =>
    e.path === "10-system-design/10-doc-architecture"
      ? {
          path: "10-system-design/10-doc-standards",
          note: "this section — the structure itself, plus five standards docs",
        }
      : e,
  );
  land(path, doc);
}

// ---------------------------------------------------------------- 20-numbering
{
  const path = `${SEC}/20-numbering/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const para = doc.blocks["b-num-corpus-para-10"];
  para.text = para.text.map((span: DeltaSpan) => {
    if (span.insert === "10-doc-architecture") return { ...span, insert: "10-doc-standards" };
    if (typeof span.insert === "string" && span.insert.includes("run 10 through 70"))
      return { ...span, insert: span.insert.replace("run 10 through 70", "run 10 through 50") };
    return span;
  });
  land(path, doc);
}

// ------------------------------------------- label sweep: architecture→standards
for (const path of [
  "docs/10-system-design/doc.json",
  "docs/20-implementation/10-packages/70-framework/doc.json",
]) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  let touched = 0;
  for (const block of Object.values(doc.blocks) as Array<{ text?: DeltaSpan[] }>) {
    if (!block.text) continue;
    for (const span of block.text) {
      if (typeof span.insert === "string" && /doc architecture/i.test(span.insert)) {
        span.insert = span.insert
          .replace(/Doc architecture/g, "Doc standards")
          .replace(/doc architecture/g, "doc standards");
        touched += 1;
      }
      const r = (span.attributes as Record<string, { label?: string }> | undefined)?.reference;
      if (r?.label && /doc architecture/i.test(r.label)) {
        r.label = r.label
          .replace(/Doc architecture/g, "Doc standards")
          .replace(/doc architecture/g, "doc standards");
        touched += 1;
      }
    }
  }
  if (touched) land(path, doc);
  console.log(`${path}: ${touched} label/text spans updated`);
}

// -------------------------------- up-reference sweep (block-vocab type pages)
{
  const files = Array.from(
    new Bun.Glob("docs/10-system-design/40-block-vocabulary/**/doc.json").scanSync({ cwd: "." }),
  ).sort();
  let swept = 0;
  for (const path of files) {
    if (path === "docs/10-system-design/40-block-vocabulary/doc.json") continue;
    const doc = JSON.parse(readFileSync(path, "utf8"));
    let touched = false;
    for (const block of Object.values(doc.blocks) as Array<{ text?: DeltaSpan[] }>) {
      if (!block.text) continue;
      for (const span of block.text) {
        const attrs = span.attributes as
          | { reference?: { kind: string; path: string } }
          | undefined;
        const target = attrs?.reference?.path;
        if (!target) continue;
        // ancestor = a strict prefix of this doc's own corpus path
        const own = path.replace(/^docs\//, "").replace(/\/doc\.json$/, "");
        if (own.startsWith(target + "/")) {
          delete attrs.reference;
          if (Object.keys(attrs).length === 0) delete span.attributes;
          touched = true;
          swept += 1;
        }
      }
    }
    if (touched) land(path, doc);
  }
  console.log(`unwrapped ${swept} ancestor references in block-vocabulary type pages`);
}

// ------------------------------------------------------------------ deletions
for (const dir of [
  `${SEC}/10-hierarchy-layers`,
  `${SEC}/20-directory-structure`,
  `${SEC}/40-titles-and-openings`,
]) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
    console.log(`deleted ${dir}`);
  }
}
console.log("restructure complete");
