/**
 * Ford's read-through directive (2026-07-20, doc-by-doc loop): full rewrite
 * of the doc-architecture SECTION OVERVIEW from his step-2 answer —
 * the bet (docs first-class, code is the output), the many-agents scale
 * rationale (canonical placement, AI review, human onboarding), the three
 * layers with foundation-as-comparison, the why as the key captured piece,
 * a file-tree block of the corpus shape, and the six standards links.
 * KEPT verbatim: the standards heading/intro + six link list-items.
 * DROPPED (unconfirmed): obligation fragment, framework callout, vertical
 * slices, enforced-vs-adhered table, flat-files-to-blocks section.
 * Canonical bytes; idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });

const PATH = "docs/10-system-design/10-doc-architecture/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
const root = doc.blocks[doc.root];

// blocks that survive verbatim (standards heading + intro + six links)
const KEEP = [
  "b-darch-standards-heading-27",
  "b-darch-standards-intro-28",
  "b-darch-std-hier-29",
  "b-darch-std-dirs-30",
  "b-darch-std-num-31",
  "b-darch-std-topen-32",
  "b-darch-std-dlink-33",
  "b-darch-std-clink-34",
];
for (const id of KEEP) {
  if (!doc.blocks[id]) {
    console.error(`kept block missing: ${id} — doc changed under us; aborting`);
    process.exit(1);
  }
}

type Def = [string, Record<string, unknown>];
const newDefs: Def[] = [
  ["title", { type: "heading", props: { level: 1 }, text: [t("Docs Define the Function")] }],
  [
    "bet",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "The docs define what the system should do — without the code. That is the bet this corpus is built on: the docs are the most important artifact in the codebase, so they are maintained first-class. Hand them to a stronger model and you get a better version of the system back. Code is the output.",
        ),
      ],
    },
  ],
  [
    "scale-lead",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "The structure is built for many agents at once. With 10, 20, or 100+ agents working a codebase, every change needs one canonical place to land. Three demands shape everything below:",
        ),
      ],
    },
  ],
  [
    "demand-home",
    {
      type: "list-item",
      props: {},
      text: [
        b("One home per fact"),
        t(" — an agent lands a change the same way every time; the structure answers "),
        { insert: "this changes here", attributes: { italic: true } },
        t("."),
      ],
    },
  ],
  [
    "demand-review",
    {
      type: "list-item",
      props: {},
      text: [
        b("Reviewable by AI"),
        t(
          " — the original intent is recoverable, so a reviewer can check work against it and walk a human through it.",
        ),
      ],
    },
  ],
  [
    "demand-onboard",
    {
      type: "list-item",
      props: {},
      text: [
        b("Learnable by humans"),
        t(" — the shape is small enough to remember and fast to onboard into."),
      ],
    },
  ],
  [
    "layers-heading",
    { type: "heading", props: { level: 2 }, text: [t("Three layers, by rate of change")] },
  ],
  [
    "layers-table",
    {
      type: "structured-table",
      props: {
        columns: ["Layer", "Holds", "Changes"],
        rows: [
          [
            "00-foundation",
            "What the app does and why it exists. Every addition is compared against it — features that serve nothing here do not get in.",
            "Rarely",
          ],
          [
            "10-system-design",
            "Behavior, implementation-agnostic — what the system does and why that behavior was chosen.",
            "When behavior changes",
          ],
          ["20-implementation", "The current code.", "With the code"],
        ],
      },
    },
  ],
  [
    "layers-pointer",
    {
      type: "paragraph",
      props: {},
      text: [
        t("The full placement rules — the litmus test and the L1–L6 depth ladder — live in "),
        {
          insert: "hierarchy layers",
          attributes: {
            reference: {
              kind: "doc",
              path: "10-system-design/10-doc-architecture/10-hierarchy-layers",
              label: "hierarchy layers",
            },
          },
        },
        t("."),
      ],
    },
  ],
  [
    "why-heading",
    { type: "heading", props: { level: 2 }, text: [t("The why travels with every decision")] },
  ],
  [
    "why-para",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "Every decision in these docs carries its why. The what can be re-derived from the system; the why cannot. Recorded, it does two jobs: a returning human sees exactly why a choice was made, and an agent checking its work against the docs cannot overturn deliberate intent by accident.",
        ),
      ],
    },
  ],
  ["shape-heading", { type: "heading", props: { level: 2 }, text: [t("The shape on disk")] }],
  [
    "shape-tree",
    {
      type: "file-tree",
      props: {
        title: "docs",
        entries: [
          {
            path: "00-foundation",
            note: "intent — what this is and why; every change is compared against it",
          },
          {
            path: "10-system-design",
            note: "behavior — implementation-agnostic; what the system does and why",
          },
          {
            path: "10-system-design/10-doc-architecture",
            note: "this section — the structure itself, plus six standards docs",
          },
          {
            path: "20-implementation",
            note: "the current code — mirrors the source tree, churns with it",
          },
        ],
      },
    },
  ],
];

const newIds: string[] = [];
let n = 0;
for (const [slug, block] of newDefs) {
  n += 1;
  const id = `b-da3-${slug}-${n}`;
  doc.blocks[id] = { id, children: [], ...block };
  newIds.push(id);
}

const removed = root.children.filter(
  (id: string) => !KEEP.includes(id) && !newIds.includes(id),
);
for (const id of removed) delete doc.blocks[id];
root.children = [...newIds, ...KEEP];

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log(
  `rewrote overview: removed ${removed.length} blocks, added ${newIds.length}, kept ${KEEP.length}`,
);
