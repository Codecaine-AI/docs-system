/**
 * Standards-section directive: authors the seven standards docs under
 * docs/10-system-design/20-doc-architecture/ (hierarchy layers, directory
 * structure, numbering, titles and openings, doc linking, code linking,
 * writing standards) and rewrites the section's 00-overview from monolith
 * to section overview. Canonical serializer bytes per bundle; idempotent.
 * Content merges packages/framework/20-standards rule text with the
 * rationale from the prior monolithic doc-architecture doc.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocDocument,
  type DocBlock,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });
const r = (label: string, path: string): DeltaSpan => ({
  insert: label,
  attributes: { reference: { kind: "doc", path, label } },
});

type BlockInput = Omit<DocBlock, "id" | "children"> & { children?: string[] };

function writeBundle(dir: string, doc: DocDocument): void {
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
  writeBundle(dir, {
    schemaVersion: 1,
    id: docId,
    title,
    root: rootId,
    blocks: {
      [rootId]: { id: rootId, type: "paragraph", props: {}, children: rootChildren },
      ...blocks,
    },
  });
}

const SECTION = "docs/10-system-design/20-doc-architecture";
const REF = "10-system-design/20-doc-architecture";

// ---------------------------------------------------------------------------
// 10-hierarchy-layers
// ---------------------------------------------------------------------------
buildDoc(
  `${SECTION}/10-hierarchy-layers`,
  "10-system-design-20-doc-architecture-10-hierarchy-layers",
  "b-hier-root",
  "hier",
  "Hierarchy layers",
  [
    [
      "intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Every doc in this corpus has exactly one home, and two axes decide it: layer — which kind of knowledge it is, ordered by rate of change — and depth, how far below the index it sits. This page states the placement rules, the tests that resolve the ambiguous cases, and why the axes are what they are.",
          ),
        ],
      },
    ],
    ["rule-heading", { type: "heading", props: { level: 2 }, text: [t("The rule")] }],
    [
      "rule-foundation",
      {
        type: "list-item",
        props: {},
        text: [
          c("00-foundation"),
          t(
            " holds intent: north star, identity, fundamental approach. Its structure is organic; only the overview is required.",
          ),
        ],
      },
    ],
    [
      "rule-design",
      {
        type: "list-item",
        props: {},
        text: [
          c("10-system-design"),
          t(
            " holds behavior: what the system does, organized by concept, code-agnostic — anything a builder in any language would need.",
          ),
        ],
      },
    ],
    [
      "rule-impl",
      {
        type: "list-item",
        props: {},
        text: [
          c("20-implementation"),
          t(
            " holds the current projection: how this codebase does it, mirroring the source tree, written in present tense about the system as it is.",
          ),
        ],
      },
    ],
    [
      "rule-appendix",
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
      "rule-litmus",
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
      "rule-purity",
      {
        type: "callout",
        props: { kind: "Purity test", tone: "warning", title: "The Design layer stays code-agnostic" },
        text: [
          t(
            "A System Design doc must be implementable, in any language, from these docs alone — and silent about how it is built. No class names, no framework names, no language features. Catch yourself writing one and you have drifted into Implementation territory.",
          ),
        ],
      },
    ],
    ["ladder-heading", { type: "heading", props: { level: 2 }, text: [t("The depth ladder")] }],
    [
      "ladder-table",
      {
        type: "structured-table",
        props: {
          columns: ["Level", "Lives at", "Carries"],
          rows: [
            ["L1", "20-implementation/00-overview", "Architecture summary plus a section index linking every L2"],
            ["L2", "XX-section/00-overview", "Section scope and its children, one line each"],
            ["L3", "A concept doc", "One coherent idea — atomic, link-rich, code-connected"],
            [
              "L4",
              "Top of a source file",
              "The file's contract: responsibilities, dependencies, invariants — kept under 50 lines",
            ],
            ["L5", "Function docstrings", "The function's contract: purpose, inputs, outputs, side effects, errors"],
            ["L6", "The code", "The implementation itself — read only after L4/L5 confirm you are in the right place"],
          ],
        },
      },
    ],
    [
      "ladder-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The doc tree stays at three levels; a subsection appears only when a section genuinely subdivides. Below L3 the ladder continues into the source, so corpus and code form one continuous descent from intent to implementation.",
          ),
        ],
      },
    ],
    ["corpus-heading", { type: "heading", props: { level: 2 }, text: [t("In this corpus")] }],
    [
      "corpus-layers",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Foundation holds the manifesto, and nothing else is prescribed there. System Design holds the interaction-surface model, this doc-architecture section, the data model, and the block vocabulary — none of them names a package or a file. Implementation mirrors ",
          ),
          c("packages/"),
          t(
            ": one doc per workspace package, plus the pipelines and theming that cut across them, with the local dev loop in the appendix.",
          ),
        ],
      },
    ],
    [
      "corpus-ladder",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The doc tree carries L1–L3. L4 file headers and L5 docstrings live in the source itself, which keeps the ladder's lower rungs with the code they describe.",
          ),
        ],
      },
    ],
    ["why-heading", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
    [
      "why-decay",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Layering by rate of change keeps the durable from rotting with the volatile: swap the backend's language and the Implementation docs are rewritten, System Design barely moves, Foundation does not move at all. The purity test is what makes that promise real — a Design doc that names a class is coupled to the projection it was supposed to outlive.",
          ),
        ],
      },
    ],
    [
      "why-ladder",
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
  ],
);

// ---------------------------------------------------------------------------
// 20-directory-structure
// ---------------------------------------------------------------------------
buildDoc(
  `${SECTION}/20-directory-structure`,
  "10-system-design-20-doc-architecture-20-directory-structure",
  "b-dirs-root",
  "dirs",
  "Directory structure",
  [
    [
      "intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The corpus is a tree of bundle folders, and its shape is itself a contract: a doc is a folder, every folder explains itself, and the Implementation layer mirrors the source tree. This page states the folder rules, the overview requirement, and the threshold at which a topic earns a folder of its own.",
          ),
        ],
      },
    ],
    ["rule-heading", { type: "heading", props: { level: 2 }, text: [t("The rule")] }],
    [
      "rule-bundle",
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
      "rule-mirror",
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
      "rule-overview",
      {
        type: "list-item",
        props: {},
        text: [
          t("Every folder carries a "),
          c("00-overview"),
          t(" listing its immediate children — one level deep, one line each."),
        ],
      },
    ],
    [
      "rule-threshold",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "A topic becomes a folder when it needs about three related docs or has clear room to grow; until then it stays a single doc. A folder holding only an overview plus one doc collapses back into a single doc.",
          ),
        ],
      },
    ],
    [
      "rule-abstract",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The overview is an abstract, not a table of contents. After reading it, a reader can explain the domain, knows what each child holds, and descends only where the task lives. Navigation is a side effect; comprehension at that level is the goal.",
          ),
        ],
      },
    ],
    [
      "rule-anti",
      {
        type: "callout",
        props: { kind: "Anti-patterns", tone: "warning" },
        text: [
          t("Flat sprawl (dozens of siblings, no hierarchy), over-nesting ("),
          c("10-app/10-backend/10-services/10-user/…"),
          t("), and folders without a "),
          c("00-overview"),
          t(
            " all break the same contract: that a reader can decide, at each level, whether to descend.",
          ),
        ],
      },
    ],
    ["corpus-heading", { type: "heading", props: { level: 2 }, text: [t("In this corpus")] }],
    [
      "corpus-para",
      {
        type: "paragraph",
        props: {},
        text: [
          c("docs/20-implementation/10-packages/"),
          t(" mirrors "),
          c("packages/"),
          t(" with one doc per workspace package. "),
          c("40-theming"),
          t(" is a folder because themes split four ways — global, component, fonts, system UI — while "),
          c("30-save-pipeline"),
          t(
            " stays a single doc because one concept covers it. Every folder in the corpus carries an overview, this section's included.",
          ),
        ],
      },
    ],
    ["why-heading", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
    [
      "why-mirror",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Mirroring makes the mapping mechanical in both directions: standing in the source you can name the doc's address, and standing in the doc you can name the source path — no index required. The overview requirement is what makes skipping safe: the corpus works as a repair manual only if a reader can rule a folder out without opening its children.",
          ),
        ],
      },
    ],
    [
      "why-threshold",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The folder threshold keeps the tree honest. Structure records how the material actually grew, not how it might someday — premature folders add a level of descent that pays nothing, and orphaned overview-plus-one folders are pure tax.",
          ),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 30-numbering
// ---------------------------------------------------------------------------
buildDoc(
  `${SECTION}/30-numbering`,
  "10-system-design-20-doc-architecture-30-numbering",
  "b-num-root",
  "num",
  "Numbering",
  [
    [
      "intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Every doc and folder in the corpus carries a two-digit prefix, and every listing — sidebar, terminal, render — sorts by it identically. This page states the scheme, the reserved ranges, and what running out of gap space actually means.",
          ),
        ],
      },
    ],
    ["rule-heading", { type: "heading", props: { level: 2 }, text: [t("The rule")] }],
    [
      "rule-prefix",
      {
        type: "list-item",
        props: {},
        text: [
          t("Prefix every doc and directory with two digits and a hyphen: "),
          c("XX-lowercase-hyphenated-name"),
          t("."),
        ],
      },
    ],
    [
      "rule-gap",
      {
        type: "list-item",
        props: {},
        text: [
          t("Leave gaps of ten ("),
          c("10-"),
          t(", "),
          c("20-"),
          t(", "),
          c("30-"),
          t(") so a new doc can be inserted without renumbering anything."),
        ],
      },
    ],
    [
      "rule-midgap",
      {
        type: "list-item",
        props: {},
        text: [
          t("Insert mid-gap first — "),
          c("25-"),
          t(" between "),
          c("20-"),
          t(" and "),
          c("30-"),
          t(" — before considering any reorganization."),
        ],
      },
    ],
    [
      "rule-exhaust",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "When the gaps are exhausted, the number line is telling you the section has outgrown its shape: reorganize into a subfolder rather than packing consecutive numbers.",
          ),
        ],
      },
    ],
    [
      "rule-table",
      {
        type: "structured-table",
        props: {
          columns: ["Range", "Reserved for"],
          rows: [
            ["00", "Overview docs only (00-overview)"],
            ["01–09", "Early or foundational content, used sparingly"],
            ["10–89", "Main content"],
            ["90–98", "Late or supplementary content"],
            ["99", "Appendix and meta (20-implementation/99-appendix/)"],
          ],
        },
      },
    ],
    [
      "rule-anti",
      {
        type: "paragraph",
        props: {},
        text: [
          t("Violations look like: consecutive numbers with no gaps, mixed formats ("),
          c("1-intro"),
          t(", "),
          c("02-setup"),
          t(", "),
          c("section-3"),
          t("), "),
          c("00-"),
          t(" on anything but an overview, "),
          c("99-"),
          t(" on anything but appendix material."),
        ],
      },
    ],
    ["corpus-heading", { type: "heading", props: { level: 2 }, text: [t("In this corpus")] }],
    [
      "corpus-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t("The tree runs on canonical gaps — "),
          c("10-interaction-surfaces"),
          t(", "),
          c("20-doc-architecture"),
          t(", "),
          c("30-data-model"),
          t(", "),
          c("40-block-vocabulary"),
          t(
            " at the System Design level; the standards in this section run 10 through 70. One family deviates on purpose.",
          ),
        ],
      },
    ],
    [
      "corpus-deviation",
      {
        type: "callout",
        props: { kind: "Named deviation", tone: "decision", title: "The rich-text type pages run dense" },
        text: [
          t("The "),
          r("rich-text component's type pages", "10-system-design/40-block-vocabulary/10-rich-text/00-overview"),
          t(
            " number 10–17 consecutively. They are one component family documented as a set — pages that grow and shrink together, ordered by their place in the family rather than by insertion history. The density is the point: it marks them as a unit. This is a recorded deviation, not a precedent.",
          ),
        ],
      },
    ],
    ["why-heading", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
    [
      "why-order",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Prefixes put reading order in the filesystem itself, so every surface that sorts names — sidebar, terminal, render listing — agrees without a manifest. Gaps of ten make insertion a local act: a new doc lands mid-gap and nothing else moves, which matters in a corpus where paths are reference targets.",
          ),
        ],
      },
    ],
    [
      "why-signal",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Exhaustion-as-signal turns a numbering annoyance into structural feedback: the moment you cannot number a doc, the section is telling you it needs a subfolder. Packing consecutive numbers silences that signal and leaves the next insertion worse off.",
          ),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 40-titles-and-openings
// ---------------------------------------------------------------------------
buildDoc(
  `${SECTION}/40-titles-and-openings`,
  "10-system-design-20-doc-architecture-40-titles-and-openings",
  "b-topen-root",
  "topen",
  "Titles and openings",
  [
    [
      "intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "A title and an opening paragraph are the two smallest units of the corpus's navigation contract, and every doc owes both. This page states what each must do: titles differentiate siblings at a glance, and openers let a reader decide relevance without reading another line.",
          ),
        ],
      },
    ],
    ["rule-heading", { type: "heading", props: { level: 2 }, text: [t("The rule")] }],
    [
      "rule-title",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "The title is bundle metadata, rendered as the page title on every surface. Make it specific enough to differentiate the doc from its siblings — \"Component themes\", not \"Themes, continued\".",
          ),
        ],
      },
    ],
    [
      "rule-opener",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Every doc opens with a 2–4 sentence paragraph from which a reader can decide relevance alone: what this covers, what reading it gets you, why it matters.",
          ),
        ],
      },
    ],
    [
      "rule-independent",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Neither leans on the other. The title must work in a bare listing with no body in sight; the opener must work for a reader arriving mid-corpus with no surrounding context.",
          ),
        ],
      },
    ],
    ["corpus-heading", { type: "heading", props: { level: 2 }, text: [t("In this corpus")] }],
    [
      "corpus-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t("The workbench sidebar and the shell listing show titles only — that is the scanning surface. "),
          c("docs render"),
          t(
            " prints title, opener, and body in one string, and an agent consumes them as successive slices. Every doc in this section opens on the pattern this page describes, including this page.",
          ),
        ],
      },
    ],
    ["why-heading", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
    [
      "why-model",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The reading model is progressive disclosure in three cuts. SCAN takes the title and first line and answers \"potentially relevant?\" — a no skips the doc entirely. SKIM takes the opening paragraph and answers \"is this enough context?\" — a yes stops right there. READ takes the full body, and only when the task actually lives in the doc. Titles serve SCAN; openers serve SKIM.",
          ),
        ],
      },
    ],
    [
      "why-tax",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The corpus only works as a repair manual under that contract. A missing opener forces READ on every visitor; a vague title forces SKIM on every scan. Both taxes are paid by every reader on every traversal, forever — which is why the two smallest pieces of a doc carry a standard of their own.",
          ),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 50-doc-linking
// ---------------------------------------------------------------------------
buildDoc(
  `${SECTION}/50-doc-linking`,
  "10-system-design-20-doc-architecture-50-doc-linking",
  "b-dlink-root",
  "dlink",
  "Doc linking",
  [
    [
      "intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Docs link to docs with typed reference spans — tracked by the backlinks index, held at zero stale, rewritten when targets move — never with raw paths in prose. This page states when to link, how to label a link, and which directions links may point.",
          ),
        ],
      },
    ],
    ["rule-heading", { type: "heading", props: { level: 2 }, text: [t("The rule")] }],
    [
      "rule-spans",
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
      "rule-labels",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Give every reference a declarative label that says what the target provides — never \"click here\" or \"this document\" — and surround it with enough context that the reader knows why they would follow it.",
          ),
        ],
      },
    ],
    [
      "rule-need",
      {
        type: "list-item",
        props: {},
        text: [t("Link at the point of need — where a reader would actually want the target — not decoratively.")],
      },
    ],
    [
      "rule-topdown",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Navigation links run top-down: overviews link to their children. Docs do not carry upward links to their parents or navigational sibling links across sections — navigation runs through parent overviews. Sideways references appear only where substance demands the specific target.",
          ),
        ],
      },
    ],
    [
      "rule-deferral",
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
    ["corpus-heading", { type: "heading", props: { level: 2 }, text: [t("In this corpus")] }],
    [
      "corpus-mechanism",
      {
        type: "paragraph",
        props: {},
        text: [
          t("A reference span is a typed attribute on a text span — the "),
          r("rich-text model", "10-system-design/30-data-model/20-rich-text"),
          t(" defines it — carrying a target kind, path, and label. The backlinks index tracks every one; "),
          c("docs links check"),
          t(
            " holds the corpus at zero stale references; moving a doc rewrites its inbound references in the same operation. In the markdown render a reference prints as its label, so a link label is prose on both surfaces.",
          ),
        ],
      },
    ],
    [
      "corpus-open",
      {
        type: "callout",
        props: { kind: "Open call", tone: "decision", title: "Top-down versus the observed up-references" },
        text: [
          t(
            "The standard above says navigation links run strictly top-down. Current corpus practice does not fully comply: the block-vocabulary type pages carry upward references to their section overview. Whether to strip those up-references or relax the standard to permit them is an open call for Ford at read-through — until it is made, new docs follow the strict form.",
          ),
        ],
      },
    ],
    ["why-heading", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
    [
      "why-typed",
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
      "why-direction",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Direction discipline keeps the navigation graph a tree even while the substance graph is a web: overviews stay the one place navigation happens, so moving through the corpus feels the same everywhere. And the mutual-deferral ban keeps ownership sharp — every concept has exactly one home, and every link points at it.",
          ),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 60-code-linking
// ---------------------------------------------------------------------------
buildDoc(
  `${SECTION}/60-code-linking`,
  "10-system-design-20-doc-architecture-60-code-linking",
  "b-clink-root",
  "clink",
  "Code linking",
  [
    [
      "intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Docs point at code; code never points back. This page states how a doc references source — full paths, introduced inline where the concept is discussed — and why the docs side pays all of the maintenance.",
          ),
        ],
      },
    ],
    ["rule-heading", { type: "heading", props: { level: 2 }, text: [t("The rule")] }],
    [
      "rule-oneway",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Linking is one-way, doc to code. No doc links in code comments; the source stays ignorant of the corpus.",
          ),
        ],
      },
    ],
    [
      "rule-paths",
      {
        type: "list-item",
        props: {},
        text: [
          t("Use full paths — "),
          c("src/auth/session/manager.ts"),
          t(" — never bare filenames, function names without paths, or vague pointers (\"the source code\")."),
        ],
      },
    ],
    [
      "rule-inline",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Introduce paths inline, as the concept is discussed, with enough context to say why the file matters.",
          ),
        ],
      },
    ],
    [
      "rule-related",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Add a Related Files list — full path plus one-line purpose — only when a doc references four or more files, and put it at the end.",
          ),
        ],
      },
    ],
    [
      "rule-moves",
      {
        type: "list-item",
        props: {},
        text: [
          t("When code moves or renames, the doc updates; "),
          c("docs links check"),
          t(" reports doc-to-code references whose target file no longer exists."),
        ],
      },
    ],
    [
      "rule-scripts",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "No generated navigation scripts (\"start here, then read X, for debugging see Y…\"). List files and explain briefly.",
          ),
        ],
      },
    ],
    ["corpus-heading", { type: "heading", props: { level: 2 }, text: [t("In this corpus")] }],
    [
      "corpus-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t("Implementation docs name their subjects inline — each package doc anchors on its package root under "),
          c("packages/"),
          t(
            ", and the pipeline docs point at the specific modules they describe. System Design docs carry no code paths at all; that is the Design-layer purity test doing its job, not a linking rule.",
          ),
        ],
      },
    ],
    ["why-heading", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
    [
      "why-oneway",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "One-way linking puts the whole maintenance bill on the side that can pay it: docs know about code, so a refactor ends with a docs pass — while the code never waits on one and never carries stale doc paths outward. The docs are the durable artifact; keeping them current is their job, not the code's.",
          ),
        ],
      },
    ],
    [
      "why-paths",
      {
        type: "paragraph",
        props: {},
        text: [
          t("A full path is a checkable claim; a bare filename is a vibe. "),
          c("docs links check"),
          t(
            " can verify that a path exists, and a reader can open it without a search. Inline-with-context beats a link farm because the reader arrives at the path with the question already framed; the Related Files list is the fallback for genuinely file-heavy docs, not the default.",
          ),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 70-writing-standards
// ---------------------------------------------------------------------------
buildDoc(
  `${SECTION}/70-writing-standards`,
  "10-system-design-20-doc-architecture-70-writing-standards",
  "b-wstd-root",
  "wstd",
  "Writing standards",
  [
    [
      "intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "These are the prose and block conventions every finished doc in the corpus follows: present-state voice, at most one level-1 heading, callouts as the decision-record form, and annotated state paired with operations when documenting system behavior. Each exists so that both rendered surfaces — the editor and the markdown render — read clean and stay greppable.",
          ),
        ],
      },
    ],
    ["rule-heading", { type: "heading", props: { level: 2 }, text: [t("The rules")] }],
    [
      "rule-present",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Present-state prose: a finished doc describes what exists now. No change-log voice — \"now\", \"previously\", \"no longer\", \"changed from\" — unless the doc is explicitly about migration history. Notes and diffs are drafting inputs, never final wording.",
          ),
        ],
      },
    ],
    [
      "rule-h1",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "One level-1 heading per doc at most. The page title is furniture — bundle metadata rendered above the body — so most docs need no H1 at all; where one is kept, it is the doc's own thesis line, not a duplicate of the title. Sections use H2.",
          ),
        ],
      },
    ],
    [
      "rule-callout",
      {
        type: "list-item",
        props: {},
        text: [
          t("Decisions and warnings are callouts: "),
          c("kind"),
          t(" carries the semantic label (\"Decision\", \"Open call\", \"Named deviation\") and "),
          c("tone"),
          t(" carries the register — the pair is how this corpus encodes decision records. The "),
          r("callout type page", "10-system-design/40-block-vocabulary/10-rich-text/14-callout"),
          t(" defines both props and their render."),
        ],
      },
    ],
    [
      "rule-doctrine",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "System behavior documents as state plus operations: a code block of real, annotated JSON shows what the state is, and an interaction-surface block lists the named operations that change or query it. State first, then operations.",
          ),
        ],
      },
    ],
    [
      "rule-media",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "Images always carry alt text; captions appear where the surrounding prose does not carry the context.",
          ),
        ],
      },
    ],
    [
      "rule-spacers",
      {
        type: "list-item",
        props: {},
        text: [
          t(
            "No empty-paragraph spacers: an empty paragraph renders as nothing on the agent surface, and spacing is the theme's job on the human one.",
          ),
        ],
      },
    ],
    ["corpus-heading", { type: "heading", props: { level: 2 }, text: [t("In this corpus")] }],
    [
      "corpus-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t("The conventions are load-bearing in the renders. "),
          c("docs grep '> \\*\\*Decision'"),
          t(" enumerates every decision record in the corpus; "),
          c("docs grep '^## '"),
          t(
            " returns a clean outline for any doc precisely because H1 stays scarce. The block-vocabulary type pages are the doctrine's own demonstration — each documents its block as annotated state plus a typed-operation surface. And every render is pinned by goldens, so a convention regression shows up as a diff, not a vibe.",
          ),
        ],
      },
    ],
    ["why-heading", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
    [
      "why-present",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Present-state voice is a decay rule: change-log narration goes stale the day after it lands and forces every later reader to reconstruct a timeline they never lived. Describing what exists dates far more slowly than describing what changed.",
          ),
        ],
      },
    ],
    [
      "why-grep",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Heading discipline and labeled callouts exist for the agent surface, where structure is only as real as it is searchable. The state-plus-operations doctrine is the block-native repair-manual form — what a thing is, then what you can do to it. And alt text is a two-reader obligation: the agent surface is text-first, and an image without alt is a blank line to half the audience.",
          ),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 00-overview — monolith → section overview (EDIT; keeps doc id + root id)
// ---------------------------------------------------------------------------
{
  const defs: Array<[string, DocBlock]> = [];
  const add = (id: string, block: BlockInput): void => {
    defs.push([id, { id, children: [], ...block } as DocBlock]);
  };

  add("b-darch-intro-2", {
    type: "paragraph",
    props: {},
    text: [
      t(
        "The corpus itself is a designed artifact. The rules are small — folder shapes, two-digit prefixes, where overviews live — but each is a decision, and the reasons decay faster than the rules do. This section is the decision memory: one child doc per structural standard, each carrying the rule, how this corpus implements it, and why it was chosen — so that a year from now the structure still means what it meant.",
      ),
    ],
  });
  add("b-darch-how-callout-3", {
    type: "callout",
    props: { tone: "info", title: "Where the how lives" },
    text: [
      t(
        "The standards live here, as this section's child docs — one artifact each for rule, setup, and rationale. The ",
      ),
      r("framework skill", "20-implementation/10-packages/70-framework"),
      t(
        " retains operational copies and the authoring workflows until a context loader renders standards straight from these docs; that loader is the declared direction.",
      ),
    ],
  });
  add("b-darch-standards-heading-27", {
    type: "heading",
    props: { level: 2 },
    text: [t("The standards")],
  });
  add("b-darch-standards-intro-28", {
    type: "paragraph",
    props: {},
    text: [
      t(
        "Seven standards, one concern each. Every one states its rule imperatively, shows this corpus's setup concretely, and defends the choice plainly.",
      ),
    ],
  });
  const stdItems: Array<[string, string, string, string]> = [
    [
      "b-darch-std-hier-29",
      "Hierarchy layers",
      `${REF}/10-hierarchy-layers`,
      " — the three layers by rate of change, the L1–L6 depth ladder, and the placement tests.",
    ],
    [
      "b-darch-std-dirs-30",
      "Directory structure",
      `${REF}/20-directory-structure`,
      " — bundle folders, source mirroring, the overview requirement, and when a topic earns a folder.",
    ],
    [
      "b-darch-std-num-31",
      "Numbering",
      `${REF}/30-numbering`,
      " — two-digit prefixes, reserved ranges, mid-gap insertion, and the corpus's one named deviation.",
    ],
    [
      "b-darch-std-topen-32",
      "Titles and openings",
      `${REF}/40-titles-and-openings`,
      " — what titles and opening paragraphs owe the SCAN/SKIM/READ reading model.",
    ],
    [
      "b-darch-std-dlink-33",
      "Doc linking",
      `${REF}/50-doc-linking`,
      " — reference spans, label discipline, and which directions links may point.",
    ],
    [
      "b-darch-std-clink-34",
      "Code linking",
      `${REF}/60-code-linking`,
      " — one-way doc-to-code references by full path, updated when code moves.",
    ],
    [
      "b-darch-std-wstd-35",
      "Writing standards",
      `${REF}/70-writing-standards`,
      " — present-state prose, heading discipline, callout decision records, and the annotated-state doctrine.",
    ],
  ];
  for (const [id, label, path, tail] of stdItems) {
    add(id, { type: "list-item", props: {}, text: [r(label, path), t(tail)] });
  }
  add("b-darch-layers-heading-4", {
    type: "heading",
    props: { level: 2 },
    text: [t("Three layers, by rate of change")],
  });
  add("b-darch-layers-table-5", {
    type: "structured-table",
    props: {
      columns: ["Layer", "Holds", "Organized by", "Changes"],
      rows: [
        [
          "00-foundation",
          "Intent — what this is and why it exists",
          "Organically; no prescribed shape",
          "Rarely; only when the north star moves",
        ],
        [
          "10-system-design",
          "Behavior — what the system does, code-agnostic",
          "Concept",
          "When behavior or architecture changes",
        ],
        [
          "20-implementation",
          "The current projection — mechanics of this codebase",
          "Code structure, mirroring the source tree",
          "With the code",
        ],
      ],
    },
  });
  add("b-darch-layers-why-6", {
    type: "paragraph",
    props: {},
    text: [
      t(
        "The three kinds of knowledge decay at different rates, and filing them together makes the durable rot with the volatile — a backend rewrite should not touch a single foundation sentence.",
      ),
    ],
  });
  add("b-darch-layers-pointer-36", {
    type: "paragraph",
    props: {},
    text: [
      t("The placement rules in full — the litmus test, the L1–L6 depth ladder, and the Design-layer purity test — live in "),
      r("hierarchy layers", `${REF}/10-hierarchy-layers`),
      t("."),
    ],
  });
  add("b-darch-slices-heading-14", {
    type: "heading",
    props: { level: 2 },
    text: [t("Vertical slices, clean boundaries")],
  });
  add("b-darch-slices-rule-15", {
    type: "paragraph",
    props: {},
    text: [
      t(
        "Each section owns its subject end-to-end and connects to its neighbors at interfaces, not internals. A section documents what crosses its boundary — what it consumes, what it produces — and never re-documents another section's insides. You can rebuild the transmission without understanding combustion; you only need to know what the input shaft carries.",
      ),
    ],
  });
  add("b-darch-slices-why-16", {
    type: "paragraph",
    props: {},
    text: [
      t(
        "Boundaries contain the blast radius of change. When a subsystem's internals change, one slice of the corpus updates, and every adjacent doc survives untouched as long as the interface holds. That is what keeps a large corpus maintainable by small local edits — and what lets a reader trust that skipping a section is safe.",
      ),
    ],
  });
  add("b-darch-enforce-heading-21", {
    type: "heading",
    props: { level: 2 },
    text: [t("Enforced, or adhered to")],
  });
  add("b-darch-enforce-table-22", {
    type: "structured-table",
    props: {
      columns: ["Rule", "Held by"],
      rows: [
        ["doc.json files are canonical serializer bytes", "Byte-equality tests over the whole corpus"],
        ["Every doc's markdown render is stable", "Golden files pinned byte-for-byte"],
        ["References never go stale", "docs links check + move-time rewriting"],
        ["Corpus membership is explicit", "The corpus count assertion and CORPUS_PATHS"],
        ["Layer placement, numbering, overview upkeep", "Convention — the skill instructs, review enforces"],
      ],
    },
  });
  add("b-darch-enforce-why-23", {
    type: "paragraph",
    props: {},
    text: [
      t(
        "The split is deliberate. Where drift is mechanical, the system enforces; where judgment is required, the rule is written imperatively in the skill and applied by whoever — human or agent — is doing the writing.",
      ),
    ],
  });
  add("b-darch-blocks-heading-24", {
    type: "heading",
    props: { level: 2 },
    text: [t("From flat files to blocks")],
  });
  add("b-darch-blocks-changed-25", {
    type: "paragraph",
    props: {},
    text: [
      t(
        "This architecture predates the block system: it was designed for markdown files on disk, and it survived the migration because none of its reasons were about file format. What changed in the move: a doc is a bundle folder rather than a ",
      ),
      c(".md"),
      t(
        " file; frontmatter became bundle metadata; markdown links became reference spans; and reading happens through renders rather than raw files.",
      ),
    ],
  });
  add("b-darch-blocks-kept-26", {
    type: "paragraph",
    props: {},
    text: [
      t(
        "What deliberately did not change: the three layers, the numbering, and the overview rule. Their reasons — rate of change, explicit ordering, safe skipping — are about how minds navigate, not about how bytes are stored. The sidebar sorts by the same prefixes; both readers walk the same shape.",
      ),
    ],
  });

  const blocks: Record<string, DocBlock> = {};
  const rootChildren: string[] = [];
  for (const [id, block] of defs) {
    blocks[id] = block;
    rootChildren.push(id);
  }
  writeBundle(`${SECTION}/00-overview`, {
    schemaVersion: 1,
    id: "10-system-design-10-doc-architecture",
    title: "Doc architecture",
    root: "b-10-doc-architecture-root",
    blocks: {
      "b-10-doc-architecture-root": {
        id: "b-10-doc-architecture-root",
        type: "paragraph",
        props: {},
        children: rootChildren,
      },
      ...blocks,
    },
  });
}

console.log("standards section authored");
