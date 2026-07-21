/**
 * Ford's directives (2026-07-21, interaction-surfaces read-through):
 * section-ify — the folder doc defines the interaction-surface IDEA
 * (opener paragraph first, canvas under it, his hand-written "The Issue"
 * kept VERBATIM, "The Solution" deduped to the three clean canonical-state
 * paragraphs, new surfaces index, symmetry table kept); NEW children
 * 10-human-surface + 20-agent-surface go deeper per surface. The
 * richer-render open-direction callout is DROPPED (his call: rendered
 * markdown is the contract). Corpus 51 → 53. Canonical bytes.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const ref = (text: string, path: string): DeltaSpan => ({
  insert: text,
  attributes: { reference: { kind: "doc", path } },
});

const SEC = "docs/10-system-design/20-interaction-surfaces";

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
function li(id: string, text: DeltaSpan[], children: string[] = []) {
  return { id, type: "list-item", props: {}, text, children };
}
function makeDoc(
  id: string,
  title: string,
  rootId: string,
  defs: Array<[string, Record<string, unknown>]>,
  subs: Array<[string, DeltaSpan[]]>,
) {
  const blocks: Record<string, unknown> = {};
  const children: string[] = [];
  for (const [bid, block] of defs) {
    blocks[bid] = { id: bid, children: (block.children as string[]) ?? [], ...block };
    children.push(bid);
  }
  for (const [bid, text] of subs) blocks[bid] = li(bid, text);
  blocks[rootId] = { id: rootId, type: "paragraph", props: {}, children };
  return { schemaVersion: 1, id, title, root: rootId, blocks };
}

// ------------------------------------------------------------------- overview
{
  const path = `${SEC}/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];

  const keep = (id: string) => {
    if (!doc.blocks[id]) {
      console.error(`kept block missing: ${id}; aborting`);
      process.exit(1);
    }
    return id;
  };

  const ISSUE_RUN = [
    "pm-mrp81bx4-2839-23vo4v",
    "pm-mrpfasf5-1-dsblal",
    "pm-mrpe42kc-17-869urm",
    "pm-mrpddwdu-766-1z1inz",
    "pm-mrpddwdu-767-o2h9xx",
    "pm-mrpddwdu-768-17aomg",
    "pm-mrpddwdu-769-jbnmhs",
    "pm-mrpfasf5-2-p1nfqi",
    "pm-mrpfasf5-3-zz5vtb",
    "pm-mrpd2dxn-75-25vx8w",
    "pm-mrpddwdu-758-bfk1ce",
    "pm-mrpddwdu-759-au9dee",
    "pm-mrpddwdu-760-2e5vcv",
    "pm-mrpddwdu-761-qj4gpg",
    "pm-mrpddwdu-762-pil9qz",
    "pm-mrpfkxn0-75-76u4o2",
  ].map(keep);

  const newBlocks: Record<string, unknown> = {
    "b-is2-opener-1": {
      id: "b-is2-opener-1",
      type: "paragraph",
      props: {},
      children: [],
      text: [
        t(
          "A document is one canonical state with two kinds of readers — a human and an agent — and each gets an interaction surface built for how it actually consumes information. This section defines the idea and the contract between the surfaces; each surface's own doc goes deeper.",
        ),
      ],
    },
    "b-is2-surfaces-h-2": {
      id: "b-is2-surfaces-h-2",
      type: "heading",
      props: { level: 2 },
      children: [],
      text: [t("The surfaces")],
    },
    "b-is2-idx-human-3": li("b-is2-idx-human-3", [
      ref("Human surface", "10-system-design/20-interaction-surfaces/10-human-surface"),
      t(" — the Notion-style editor: rich blocks, direct manipulation, comments, themes."),
    ]),
    "b-is2-idx-agent-4": li("b-is2-idx-agent-4", [
      ref("Agent surface", "10-system-design/20-interaction-surfaces/20-agent-surface"),
      t(" — rendered markdown and typed operations through the CLI."),
    ]),
  };
  Object.assign(doc.blocks, newBlocks);

  root.children = [
    "b-is2-opener-1",
    keep("b-isurf-canvas-hero"),
    ...ISSUE_RUN,
    keep("pm-mrpddwdu-763-0b5gwr"), // h2 The Solution
    keep("pm-mrpg8ecz-2-cir0id"), // doc.json bundle
    keep("pm-mrpg8ecz-3-t6poph"), // no reader consumes this form
    keep("pm-mrpg8ecz-4-cdiuzv"), // built for precision
    "b-is2-surfaces-h-2",
    "b-is2-idx-human-3",
    "b-is2-idx-agent-4",
    keep("b-isurf-symmetry-heading-13"),
    keep("b-isurf-symmetry-table-14"),
    keep("b-isurf-symmetry-para-15"),
  ];

  // GC everything unreachable (old surface sections, dup shared-state run,
  // the dropped open-direction callout nested under agent-write)
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
  console.log(`overview: dropped ${dropped} blocks`);
  land(path, doc);
}

// -------------------------------------------------------------- human surface
land(
  `${SEC}/10-human-surface/doc.json`,
  makeDoc(
    "10-system-design-20-interaction-surfaces-10-human-surface",
    "Human surface",
    "b-hsurf-root",
    [
      [
        "b-hsurf-intro-1",
        {
          type: "paragraph",
          props: {},
          text: [
            t(
              "A human meets a document as a Notion-style editor: rich blocks, direct manipulation, comments, live theming. This page states what the surface owes a human reader and how a human's edits reach the shared state.",
            ),
          ],
        },
      ],
      ["b-hsurf-read-h-2", { type: "heading", props: { level: 2 }, text: [t("Reading")] }],
      [
        "b-hsurf-read-blocks-3",
        {
          type: "list-item",
          props: {},
          text: [
            t(
              "Blocks render as rich components — tables, canvases, annotated code, file trees — not walls of text.",
            ),
          ],
        },
      ],
      [
        "b-hsurf-read-title-4",
        {
          type: "list-item",
          props: {},
          text: [
            t(
              "The page title is furniture derived from the doc's name; the sidebar walks the numbered tree in reading order.",
            ),
          ],
        },
      ],
      ["b-hsurf-edit-h-5", { type: "heading", props: { level: 2 }, text: [t("Editing")] }],
      [
        "b-hsurf-edit-typing-6",
        {
          type: "list-item",
          props: {},
          text: [
            t(
              "Typing follows Notion semantics — enter, backspace, markdown shortcuts, and the slash menu behave the way a Notion user expects.",
            ),
          ],
        },
      ],
      [
        "b-hsurf-edit-direct-7",
        {
          type: "list-item",
          props: {},
          text: [
            t(
              "Direct manipulation: a drag grip on every block, band selection from the margins, structure-preserving copy and paste.",
            ),
          ],
        },
      ],
      [
        "b-hsurf-edit-comments-8",
        {
          type: "list-item",
          props: {},
          text: [t("Comments anchor to blocks and to text spans.")],
        },
      ],
      [
        "b-hsurf-edit-ops-9",
        {
          type: "paragraph",
          props: {},
          text: [
            t(
              "No edit touches the file. Every change the surface makes lands as a typed operation against the canonical state — the ",
            ),
            ref("mutation model", "10-system-design/30-data-model/60-mutation-model"),
            t(" defines them."),
          ],
        },
      ],
      ["b-hsurf-theme-h-10", { type: "heading", props: { level: 2 }, text: [t("Theming and embedding")] }],
      [
        "b-hsurf-theme-tokens-11",
        {
          type: "list-item",
          props: {},
          text: [
            t(
              "The surface is themable through an open token contract — colors, fonts, spacing — and the theme evolves live while editing.",
            ),
          ],
        },
      ],
      [
        "b-hsurf-theme-embed-12",
        {
          type: "list-item",
          props: {},
          text: [
            t(
              "It is embeddable: the same editor serves the workbench and any host that wants the docs in place.",
            ),
          ],
        },
      ],
      ["b-hsurf-why-h-13", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
      [
        "b-hsurf-why-visual-14",
        { type: "list-item", props: {}, text: [b("Humans learn visually")], children: ["b-hsurf-why-visual-sub-15"] },
      ],
      [
        "b-hsurf-why-pen-16",
        {
          type: "list-item",
          props: {},
          text: [b("The editor is the only pen")],
          children: ["b-hsurf-why-pen-sub1-17", "b-hsurf-why-pen-sub2-18"],
        },
      ],
    ],
    [
      [
        "b-hsurf-why-visual-sub-15",
        [
          t(
            "Rich components and layout carry more than text alone; the reading surface uses them everywhere it can.",
          ),
        ],
      ],
      ["b-hsurf-why-pen-sub1-17", [t("A human never edits bytes; the surface turns intent into typed operations.")]],
      [
        "b-hsurf-why-pen-sub2-18",
        [t("That is what keeps a human's edits and an agent's edits the same kind of change.")],
      ],
    ],
  ),
);

// -------------------------------------------------------------- agent surface
land(
  `${SEC}/20-agent-surface/doc.json`,
  makeDoc(
    "10-system-design-20-interaction-surfaces-20-agent-surface",
    "Agent surface",
    "b-asurf-root",
    [
      [
        "b-asurf-intro-1",
        {
          type: "paragraph",
          props: {},
          text: [
            t(
              "An agent meets the same document as rendered markdown and writes through typed operations. This page states the read contract and the write contract.",
            ),
          ],
        },
      ],
      ["b-asurf-read-h-2", { type: "heading", props: { level: 2 }, text: [t("Reading")] }],
      [
        "b-asurf-read-code-3",
        {
          type: "code",
          props: {
            language: "bash",
            annotations: [
              { lines: "1", label: "Render", note: "Prints the doc as stable markdown — title, then body." },
              { lines: "2", label: "Grep", note: "Searches every doc as its rendered text, not its bytes." },
            ],
          },
          text: [
            t(
              'docs render 10-system-design/10-doc-standards/10-structure\ndocs grep "depth ladder"',
            ),
          ],
        },
      ],
      [
        "b-asurf-read-pinned-4",
        {
          type: "list-item",
          props: {},
          text: [
            t(
              "The render is part of the contract: every doc's markdown is pinned byte-for-byte by golden tests.",
            ),
          ],
        },
      ],
      [
        "b-asurf-read-greppable-5",
        {
          type: "list-item",
          props: {},
          text: [
            t(
              "Structure is greppable — headings, labeled callouts, and reference names are all plain text in the render.",
            ),
          ],
        },
      ],
      ["b-asurf-write-h-6", { type: "heading", props: { level: 2 }, text: [t("Writing")] }],
      [
        "b-asurf-write-ops-7",
        {
          type: "list-item",
          props: {},
          text: [
            t("Writes are typed operations addressed by block id — never text patches. The "),
            ref("mutation model", "10-system-design/30-data-model/60-mutation-model"),
            t(" defines them."),
          ],
        },
      ],
      [
        "b-asurf-write-locks-8",
        {
          type: "list-item",
          props: {},
          text: [t("Hash preconditions and draft locks keep concurrent writers off each other.")],
        },
      ],
      [
        "b-asurf-write-gate-9",
        {
          type: "list-item",
          props: {},
          text: [
            t(
              "Every save is validated before anything persists; an invalid write is rejected whole, and the file is untouched.",
            ),
          ],
        },
      ],
      ["b-asurf-why-h-10", { type: "heading", props: { level: 2 }, text: [t("Why")] }],
      [
        "b-asurf-why-text-11",
        { type: "list-item", props: {}, text: [b("Agents live in text")], children: ["b-asurf-why-text-sub-12"] },
      ],
      [
        "b-asurf-why-typed-13",
        {
          type: "list-item",
          props: {},
          text: [b("Typed writes cannot corrupt")],
          children: ["b-asurf-why-typed-sub1-14", "b-asurf-why-typed-sub2-15"],
        },
      ],
    ],
    [
      [
        "b-asurf-why-text-sub-12",
        [
          t(
            "Plain markdown through plain commands — no special tooling between the agent and the docs, and nothing to learn beyond the shell.",
          ),
        ],
      ],
      [
        "b-asurf-why-typed-sub1-14",
        [t("An operation is validated against the schema before it lands.")],
      ],
      [
        "b-asurf-why-typed-sub2-15",
        [t("A text patch could break the state in ways a reader only finds later; a rejected op breaks nothing.")],
      ],
    ],
  ),
);

console.log("interaction surfaces section-ified");
