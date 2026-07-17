/**
 * Round-2 foundation directive: rewrites 00-foundation/00-manifesto and
 * 50-packages/70-framework, authors the two NEW system-design docs
 * (00-interaction-surfaces, 10-doc-architecture). Canonical serializer
 * bytes per bundle. Content authored from Ford's 2026-07-17 interview.
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
const l = (text: string, url: string): DeltaSpan => ({ insert: text, attributes: { link: url } });
const r = (label: string, path: string): DeltaSpan => ({
  insert: label,
  attributes: { reference: { kind: "doc", path, label } },
});

type BlockInput = Omit<DocBlock, "id" | "children"> & { children?: string[] };

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
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${dir} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/doc.json`, serializeDocDocument(doc));
  console.log(`wrote ${dir}/doc.json (${rootChildren.length + 1} blocks)`);
}

// ---------------------------------------------------------------------------
// 00-foundation/00-manifesto — full rewrite
// ---------------------------------------------------------------------------
buildDoc(
  "docs/00-foundation/00-manifesto",
  "00-foundation-00-manifesto",
  "b-00-manifesto-root",
  "m2",
  "Manifesto",
  [
    ["title", { type: "heading", props: { level: 1 }, text: [t("Manifesto")] }],
    [
      "species",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The most important technology our species has ever produced is not the engine, the chip, or the network. It is the transfer of knowledge: the ability to take what one mind has learned and hand it to another, so the next mind starts where the last one stopped instead of starting over.",
          ),
        ],
      },
    ],
    [
      "lineage",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Every leap in that technology shortened the distance between minds. Writing let knowledge outlive its author. Diagrams let it cross languages. Books let one person pack a working lifetime into an object a stranger can pick up and build on. Libraries gave knowledge an address, the internet gave it a wire, and AI gives it a reader that never tires. Each step is the same move: a faster channel from one entity to another.",
          ),
        ],
      },
    ],
    [
      "two-readers-intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "This system exists because software needs that channel — and because there are now two kinds of readers on the other end of it.",
          ),
        ],
      },
    ],
    ["gap-heading", { type: "heading", props: { level: 2 }, text: [t("The gap")] }],
    [
      "gap-physical",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "In the physical disciplines, the knowledge is written down. A car ships with a repair manual that can walk a stranger from symptom to torque spec. A building leaves drawings detailed enough to renovate it a century later. Software — the most malleable medium we have ever worked in — usually ships with an API reference, if that. The rest lives in heads, and it walks out the door.",
          ),
        ],
      },
    ],
    [
      "gap-excuses",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "There were two honest excuses. The tools were never built for it, and the pace of change made upkeep a full-time job nobody was paid to do. Agents ended both. They can carry the upkeep — and they raised the stakes, because one builder now runs several projects at once, each with the complexity that used to take a team. Comprehensive documentation stopped being a virtue. It became load-bearing.",
          ),
        ],
      },
    ],
    ["define-heading", { type: "heading", props: { level: 2 }, text: [t("Docs define the function")] }],
    [
      "define-math",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "This repository treats documentation the way mathematics treats a definition. The docs define the function; the code is one implementation of it — a projection of the intent into a particular language, framework, and moment. Many projections satisfy the same definition. Swap the backend's language tomorrow: the implementation docs are rewritten, the system design barely moves, and the foundation does not move at all. The layers are ordered by how fast they are allowed to change.",
          ),
        ],
      },
    ],
    [
      "define-lossy",
      {
        type: "quote",
        props: {},
        text: [
          t(
            "Code is a lossy projection of intent. Read only the code, and the why has already been projected away — every reader after you, human or agent, is left reverse-engineering what you meant.",
          ),
        ],
      },
    ],
    [
      "define-layers",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "So the corpus keeps three layers. Foundation holds the intent — what this is and why it exists. System Design holds the behavior — what the system does, independent of any codebase. Implementation describes the current projection, and is allowed to churn. A reader starts at the top and descends only as far as the task requires.",
          ),
        ],
      },
    ],
    [
      "define-obligation",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "A definition implies an obligation: if the docs say what the system should do, the system must be held to them. This corpus already keeps itself mechanically honest — every document's bytes and rendered markdown are pinned by tests — and behavior-level verification against the docs is the frontier this project is walking toward.",
          ),
        ],
      },
    ],
    ["trust-heading", { type: "heading", props: { level: 2 }, text: [t("Trust is the point")] }],
    [
      "trust-chain",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Agents write more of the code every month. That only scales on trust, and trust does not come from reviewing diffs faster. It comes from the behavior and its reasoning being locked in: this is what the piece does, this is why it is this way, these are the decisions you do not quietly change. Written down, that turns autonomy from drift into expansion — the system builds on your design decisions instead of guessing past them.",
          ),
        ],
      },
    ],
    [
      "trust-slop",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Slop is what intent transfer looks like when it fails. An agent that cannot find the why fills the gap with plausible guesses, and plausible guesses compound. The fix is not a stricter reviewer at the end of the pipeline; it is a sharper definition at the top. Defining the identity of the software — exactly, durably, in a form both kinds of readers consume well — is the work this system is built for.",
          ),
        ],
      },
    ],
    ["state-heading", { type: "heading", props: { level: 2 }, text: [t("One state, two readers")] }],
    [
      "state-surfaces",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Every document here is one canonical state — an id-keyed block tree — that neither reader touches directly. A human meets it as a Notion-style editor: direct manipulation, drag, comments, themes. An agent meets it as rendered markdown through the CLI: stable, greppable, precisely addressable. Two ",
          ),
          r("interaction surfaces", "10-system-design/00-interaction-surfaces"),
          t(", one truth, each engineered for how its reader actually consumes."),
        ],
      },
    ],
    [
      "state-contract",
      {
        type: "callout",
        props: { tone: "info", title: "The contract: both surfaces read true" },
        text: [
          t(
            "A document is wrong if either rendered surface reads wrong. Write for the agent that meets it as markdown and for the human that meets it in the editor. Neither reader ever parses the stored form.",
          ),
        ],
      },
    ],
    [
      "state-vocab",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The vocabulary is deliberately small — fourteen block types, and no more — so the renders stay stable, the editor stays learnable, and the agent's edit surface stays enumerable.",
          ),
        ],
      },
    ],
    [
      "state-rings",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Understanding moves outward in rings. You write to understand your own system first; the same corpus then carries that understanding to a teammate, and to every agent that touches the code after you. And because the read surface is embeddable and themable, the same document lands in the workbench, a blog, or a teammate's browser without losing its shape.",
          ),
        ],
      },
    ],
    ["divider", { type: "divider", props: {} }],
    ["conviction-heading", { type: "heading", props: { level: 2 }, text: [t("The conviction")] }],
    [
      "conviction-durable",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The docs are the durable artifact. The code is the current projection. When they disagree, the right question is not which file is newer — it is where the intent is most clearly preserved.",
          ),
        ],
      },
    ],
    [
      "conviction-bet",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "If a better model arrives next year, hand it Foundation and System Design and you should get a better implementation back, with nothing lost in the handoff. That is the bet: intent outlives any one projection.",
          ),
        ],
      },
    ],
    [
      "credits",
      {
        type: "paragraph",
        props: {},
        text: [
          t("This stance has debts: "),
          l("Specs are the New Code", "https://www.youtube.com/watch?v=8rABwKRsec4"),
          t(" (Sean Grove) and "),
          l(
            "Advanced Context Engineering for Coding Agents",
            "https://github.com/humanlayer/advanced-context-engineering-for-coding-agents",
          ),
          t(" (Dex Horthy)."),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 10-system-design/00-interaction-surfaces — NEW
// ---------------------------------------------------------------------------
buildDoc(
  "docs/10-system-design/00-interaction-surfaces",
  "10-system-design-00-interaction-surfaces",
  "b-00-interaction-surfaces-root",
  "isurf",
  "Interaction surfaces",
  [
    ["title", { type: "heading", props: { level: 1 }, text: [t("Interaction surfaces")] }],
    [
      "intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "One idea underpins everything else in this system: a document is a single canonical state with two kinds of readers, and each reader gets a surface engineered for how it consumes. A human should never have to read storage bytes; an agent should never have to drive a UI. Both work on the same truth, through the form that is optimal for them.",
          ),
        ],
      },
    ],
    ["state-heading", { type: "heading", props: { level: 2 }, text: [t("The canonical state")] }],
    [
      "state-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t("Every document is a "),
          c("doc.json"),
          t(" bundle: an id-keyed tree of blocks — the "),
          r("data model", "10-system-design/20-data-model/00-overview"),
          t(" — serialized to "),
          r("canonical bytes", "10-system-design/20-data-model/50-canonical-bytes"),
          t(
            ". No reader consumes this form directly. It is built for precision, not reading: stable ids make every block addressable, canonical bytes make every change diffable and testable, and the whole tree is validated on every write.",
          ),
        ],
      },
    ],
    [
      "state-contract",
      {
        type: "callout",
        props: { tone: "info", title: "The contract" },
        text: [
          t(
            "A document is wrong if either rendered surface reads wrong. The stored form is never the reading contract — the renders are, on both sides.",
          ),
        ],
      },
    ],
    ["human-heading", { type: "heading", props: { level: 2 }, text: [t("The human interaction surface")] }],
    [
      "human-editor",
      {
        type: "paragraph",
        props: {},
        text: [
          t("A human meets a document as a Notion-style editor in the "),
          r("workbench", "20-implementation/20-workbench"),
          t(", rendered by "),
          r("docs-viewer", "10-system-design/50-packages/40-docs-viewer"),
          t(
            ". Blocks appear as rich components — highlighted code, tables, callouts, media, embeds — and editing is direct manipulation: typing with markdown input rules, a slash menu for insertion, drag to reorder, marks for emphasis. Every edit becomes a typed operation against a block id, autosaved and broadcast live to other views.",
          ),
        ],
      },
    ],
    [
      "human-embed",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The surface is embeddable and themable by design: a small set of core building blocks with an open token contract — see ",
          ),
          r("theming", "20-implementation/40-theming/00-overview"),
          t(
            " — so the same document renders in the workbench, an exported site, or any host page, and can be restyled without touching component code.",
          ),
        ],
      },
    ],
    ["agent-heading", { type: "heading", props: { level: 2 }, text: [t("The agent interaction surface")] }],
    [
      "agent-read",
      {
        type: "paragraph",
        props: {},
        text: [
          t("An agent meets the same document as rendered markdown. "),
          c("docs render <path>"),
          t(" prints it; "),
          c("docs grep <term>"),
          t(
            " searches every doc as its render. The render is deterministic and pinned byte-for-byte by golden tests, which makes it a contract: an agent never parses ",
          ),
          c("doc.json"),
          t(", and never has to."),
        ],
      },
    ],
    [
      "agent-write",
      {
        type: "paragraph",
        props: {},
        text: [
          t("Writing is typed operations, not text patches: the "),
          r("mutation model", "10-system-design/40-mutation-model"),
          t(
            " addresses blocks by id, with hash preconditions and draft locks so concurrent editors fail loudly instead of clobbering each other. Discovery is built in — ",
          ),
          c("GET /api/blocks"),
          t(
            " enumerates every block type and the actions it supports, so the available moves are learnable by machine rather than tribal memory.",
          ),
        ],
      },
    ],
    [
      "agent-direction",
      {
        type: "callout",
        props: { tone: "warning", title: "Open direction: a richer agent render" },
        text: [
          t(
            "Rendered markdown is the current contract. A richer render — MDX-like, keeping typed structure intact through the trip — is an open direction, deliberately unspecified until it earns its shape. The canonical state makes new renders cheap to add without disturbing existing readers.",
          ),
        ],
      },
    ],
    ["symmetry-heading", { type: "heading", props: { level: 2 }, text: [t("Symmetry, in practice")] }],
    [
      "symmetry-table",
      {
        type: "structured-table",
        props: {
          columns: ["Interaction", "Human surface", "Agent surface"],
          rows: [
            ["Read", "Blocks rendered as rich UI components", "Deterministic markdown render (docs render)"],
            ["Search", "Sidebar tree, backlinks, in-app navigation", "docs grep across rendered docs"],
            ["Write", "Direct manipulation in the editor", "Typed block operations via CLI/API"],
            ["Safety", "Autosave, live updates, single-use undo", "Hash preconditions, draft locks"],
            ["Discovery", "Slash menu and block UI", "GET /api/blocks and the docs skill"],
          ],
        },
      },
    ],
    [
      "symmetry-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Neither column is primary. A feature that improves one surface must not degrade the other; when the two pull in different directions, the canonical state grows whatever structure lets each surface stay optimal — that is the point of keeping state and surface separate.",
          ),
        ],
      },
    ],
    ["why-heading", { type: "heading", props: { level: 2 }, text: [t("Why this shape")] }],
    [
      "why-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Every docs tool picks a side. Text files as the source make the agent the first-class reader and hand humans raw markup; WYSIWYG documents as the source make the human first-class and leave agents scraping exports. Holding the state in a neutral, id-keyed form is the only arrangement where neither reader pays the other's cost. It is also what makes the rest of the system possible: precise mutation, comments anchored to blocks, reference-safe moves, and byte-stable history.",
          ),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 10-system-design/10-doc-architecture — NEW
// ---------------------------------------------------------------------------
buildDoc(
  "docs/10-system-design/10-doc-architecture",
  "10-system-design-10-doc-architecture",
  "b-10-doc-architecture-root",
  "darch",
  "Doc architecture",
  [
    ["title", { type: "heading", props: { level: 1 }, text: [t("Doc architecture")] }],
    [
      "intro",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The corpus itself is a designed artifact. The rules below are small — folder shapes, two-digit prefixes, where overviews live — but each is a decision, and the reasons decay faster than the rules do. This page is the decision memory: every structural rule with its why, so that a year from now the structure still means what it meant. It is also the structure agents adhere to when they add or move docs — followed well, new material lands where readers expect it, with no cleanup pass to put it there.",
          ),
        ],
      },
    ],
    [
      "how-callout",
      {
        type: "callout",
        props: { tone: "info", title: "Where the how lives" },
        text: [
          t("The operational form of these rules — imperative, load-and-follow, no rationale — is the "),
          r("framework skill", "10-system-design/50-packages/70-framework"),
          t(
            ". The reasons live here. The discipline: change a structural decision on this page and update the skill in the same change.",
          ),
        ],
      },
    ],
    ["layers-heading", { type: "heading", props: { level: 2 }, text: [t("Three layers, by rate of change")] }],
    [
      "layers-table",
      {
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
      },
    ],
    [
      "layers-why",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The three kinds of knowledge decay at different rates, and filing them together makes the durable rot with the volatile — a backend rewrite should not touch a single foundation sentence. The litmus test for placement: behavior changed → design; how the code handles it changed → implementation; the goal itself moved → foundation.",
          ),
        ],
      },
    ],
    [
      "layers-appendix",
      {
        type: "paragraph",
        props: {},
        text: [
          t("Implementation ends with a "),
          c("99-appendix"),
          t(" for operational material — setup, tooling, the dev loop — which is implementation-specific by nature."),
        ],
      },
    ],
    ["folders-heading", { type: "heading", props: { level: 2 }, text: [t("Folders, overviews, numbering")] }],
    [
      "folders-rule-bundle",
      {
        type: "list-item",
        props: {},
        text: [
          t("Every doc is a bundle folder (the "),
          c("doc.json"),
          t(" inside it is the canonical state); a section is a folder of docs."),
        ],
      },
    ],
    [
      "folders-rule-overview",
      {
        type: "list-item",
        props: {},
        text: [
          t("Every section keeps a "),
          c("00-overview"),
          t(" that says what exists, what each child covers, and where to descend."),
        ],
      },
    ],
    [
      "folders-rule-number",
      {
        type: "list-item",
        props: {},
        text: [
          t("Two-digit prefixes with gaps of ten ("),
          c("10-"),
          t(", "),
          c("20-"),
          t(", …) order every listing; "),
          c("00"),
          t(" is reserved for overviews, "),
          c("99"),
          t(" for appendices."),
        ],
      },
    ],
    [
      "folders-rule-folder",
      {
        type: "list-item",
        props: {},
        text: [t("A topic becomes a folder when it needs several docs; until then it stays a single doc.")],
      },
    ],
    [
      "folders-why",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The goal is navigation without exhaustion — the repair-manual property. From the index you find the section; from the overview you learn what it holds without opening its children; you descend only where the task lives. Numbering makes reading order explicit and insertion cheap: a new doc slots into a gap without renumbering, and running out of gap is the signal that a subfolder is due. Overviews are what make skipping safe.",
          ),
        ],
      },
    ],
    ["slices-heading", { type: "heading", props: { level: 2 }, text: [t("Vertical slices, clean boundaries")] }],
    [
      "slices-rule",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Each section owns its subject end-to-end and connects to its neighbors at interfaces, not internals. A section documents what crosses its boundary — what it consumes, what it produces — and never re-documents another section's insides. You can rebuild the transmission without understanding combustion; you only need to know what the input shaft carries.",
          ),
        ],
      },
    ],
    [
      "slices-why",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Boundaries contain the blast radius of change. When a subsystem's internals change, one slice of the corpus updates, and every adjacent doc survives untouched as long as the interface holds. That is what keeps a large corpus maintainable by small local edits — and what lets a reader trust that skipping a section is safe.",
          ),
        ],
      },
    ],
    ["web-heading", { type: "heading", props: { level: 2 }, text: [t("The web of knowledge")] }],
    [
      "web-docs",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Docs link to docs with typed reference spans, not raw paths in prose. References resolve through the backlinks index; moving a doc rewrites every inbound reference automatically; and ",
          ),
          c("docs links check"),
          t(
            " holds the corpus at zero stale references. Dense cross-linking is safe to rely on precisely because it cannot silently rot.",
          ),
        ],
      },
    ],
    [
      "web-code",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Docs point at code with plain file paths, introduced in prose where the concept is discussed. Code never points back at docs — one-way linking keeps the maintenance cost on one side.",
          ),
        ],
      },
    ],
    [
      "web-ladder",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Below the doc tree, the same web continues into the code: file headers state what a file is responsible for, docstrings state what a function promises, and the code states how. Corpus and code together form one continuous ladder from intent down to implementation. (The flat-file framework called these depth levels L1–L6: the index, section overviews, and concept docs are L1–L3; file headers, docstrings, and code are L4–L6.)",
          ),
        ],
      },
    ],
    ["enforce-heading", { type: "heading", props: { level: 2 }, text: [t("Enforced, or adhered to")] }],
    [
      "enforce-table",
      {
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
      },
    ],
    [
      "enforce-why",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "The split is deliberate. Where drift is mechanical, the system enforces; where judgment is required, the rule is written imperatively in the skill and applied by whoever — human or agent — is doing the writing.",
          ),
        ],
      },
    ],
    ["blocks-heading", { type: "heading", props: { level: 2 }, text: [t("From flat files to blocks")] }],
    [
      "blocks-changed",
      {
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
      },
    ],
    [
      "blocks-kept",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "What deliberately did not change: the three layers, the numbering, and the overview rule. Their reasons — rate of change, explicit ordering, safe skipping — are about how minds navigate, not about how bytes are stored. The sidebar sorts by the same prefixes; both readers walk the same shape.",
          ),
        ],
      },
    ],
  ],
);

// ---------------------------------------------------------------------------
// 10-system-design/50-packages/70-framework — rewrite for the narrowed role
// ---------------------------------------------------------------------------
buildDoc(
  "docs/10-system-design/50-packages/70-framework",
  "10-system-design-30-packages-70-framework",
  "b-70-framework-root",
  "fw2",
  "framework — the loadable skill",
  [
    ["title", { type: "heading", props: { level: 1 }, text: [t("framework — the loadable skill")] }],
    [
      "intro",
      {
        type: "paragraph",
        props: {},
        text: [
          c("@codecaine-ai/docs-framework-skill"),
          t(
            " is the agent-loadable skill for working inside a docs corpus: how to navigate it, produce new docs, and maintain existing ones. It is deliberately imperative and rationale-free — rules, workflows, and templates an agent loads and follows at authoring time.",
          ),
        ],
      },
    ],
    ["owns-heading", { type: "heading", props: { level: 2 }, text: [t("What it owns")] }],
    [
      "owns-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t("At "),
          c("packages/framework/"),
          t(": the "),
          c("SKILL.md"),
          t(
            " entry point host repositories symlink into their agent tooling, the intent cookbook (navigate / produce / maintain), the imperative structure standards (layers, numbering, linking), document templates, and maintenance workflows.",
          ),
        ],
      },
    ],
    ["not-heading", { type: "heading", props: { level: 2 }, text: [t("What it deliberately does not own")] }],
    [
      "not-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t("The why. Every structural rule's rationale lives in "),
          r("doc architecture", "10-system-design/10-doc-architecture"),
          t("; the intent behind the whole system lives in the "),
          r("manifesto", "00-foundation/00-manifesto"),
          t(
            ". The skill states rules; the corpus defends them. When a structural decision changes, both update in the same change — the design doc carries the reasoning, the skill carries the new instruction.",
          ),
        ],
      },
    ],
    ["package-heading", { type: "heading", props: { level: 2 }, text: [t("Why it is a package at all")] }],
    [
      "package-para",
      {
        type: "paragraph",
        props: {},
        text: [
          t(
            "Distribution convenience, honestly. Being a workspace package lets a host repository resolve, version, and symlink the methodology like any other dependency. It has zero dependencies, imports nothing, and ships in no runtime — a running docs installation behaves identically whether the package is present or absent.",
          ),
        ],
      },
    ],
    [
      "boundary-callout",
      {
        type: "callout",
        props: { tone: "decision", title: "Boundary under review: this may not need to be a package" },
        text: [
          t(
            "Framework-as-package is itself under review. The same material could live as plain repository content or use its own distribution channel; the packaging is a convenience, not an architectural layer.",
          ),
        ],
      },
    ],
    [
      "northstar-callout",
      {
        type: "callout",
        props: { tone: "info", title: "North star: the skill as a render" },
        text: [
          t(
            "By this system's own model, the skill is a render of the corpus: the canonical rules and their reasons live in the docs, and the skill is the authoring surface an agent loads. Generating the skill from the corpus — so the two can never drift — is the intended end state.",
          ),
        ],
      },
    ],
  ],
);

console.log("round-2 foundation docs authored");
