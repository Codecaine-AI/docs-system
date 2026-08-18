/**
 * Writing-style section: authors docs/99-appendix/10-writing-style/ — the
 * 99-appendix tier parent, the section parent, and three pages (register,
 * structure, block conventions) — and writes their projection goldens.
 * Consolidated from the seven-page first cut: anti-patterns (negative
 * restatements of the positive rules), why-these-hold (pure rationale), and
 * the philosophy halves of design-narrative and titles-and-openings carry no
 * instruction the remaining pages lack. Canonical serializer bytes;
 * idempotent.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  projectToMarkdown,
  serializeDocDocument,
  validateDocDocument,
  type DocDocument,
  type DocBlock,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const ROOT = join(import.meta.dir, "..");
const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });
const r = (label: string, path: string): DeltaSpan => ({
  insert: label,
  attributes: { reference: { kind: "doc", path, label } },
});

type NodeInput = {
  slug: string;
  type: DocBlock["type"];
  props?: Record<string, unknown>;
  text?: DeltaSpan[];
  children?: NodeInput[];
};

const p = (slug: string, ...text: DeltaSpan[]): NodeInput => ({
  slug,
  type: "paragraph",
  text,
});
const li = (slug: string, ...text: DeltaSpan[]): NodeInput => ({
  slug,
  type: "list-item",
  text,
});
const liNest = (
  slug: string,
  text: DeltaSpan[],
  children: NodeInput[],
): NodeInput => ({ slug, type: "list-item", text, children });

function buildDoc(
  relativeDir: string,
  docId: string,
  idSlug: string,
  title: string,
  nodes: NodeInput[],
): void {
  const blocks: Record<string, DocBlock> = {};
  let n = 0;
  const add = (node: NodeInput): string => {
    n += 1;
    const id = `b-${idSlug}-${node.slug}-${n}`;
    const children = (node.children ?? []).map(add);
    blocks[id] = {
      id,
      type: node.type,
      props: node.props ?? {},
      text: node.text,
      children,
    } as DocBlock;
    return id;
  };
  const rootChildren = nodes.map(add);
  const rootId = `b-${idSlug}-root`;
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
    console.error(`${relativeDir} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  const dir = join(ROOT, relativeDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/doc.json`, serializeDocDocument(result.document));
  const goldenName = relativeDir.replace(/^docs\//, "docs__").replaceAll("/", "__") + ".md";
  writeFileSync(
    join(ROOT, "packages/docs-model/src/__tests__/goldens/projection", goldenName),
    projectToMarkdown(result.document),
  );
  console.log(`wrote ${relativeDir}/doc.json (${Object.keys(doc.blocks).length} blocks) + golden`);
}

const APPENDIX = "docs/99-appendix";
const WS = `${APPENDIX}/10-writing-style`;
const WS_REF = "99-appendix/10-writing-style";

// ---------------------------------------------------------------------------
// 99-appendix (tier parent)
// ---------------------------------------------------------------------------
buildDoc(APPENDIX, "99-appendix", "appendix", "Appendix", [
  p(
    "intro",
    t(
      "Operational and meta content that supports working on the corpus without being part of the system's design: guidance for writers and maintainers rather than statements about the system. The tier is reserved at ",
    ),
    c("99-"),
    t(" per the numbering standard."),
  ),
  liNest("ws", [r("Writing style", WS_REF)], [
    li(
      "ws-gloss",
      t("How every doc in this corpus is written — register, structure, and block conventions."),
    ),
  ]),
]);

// ---------------------------------------------------------------------------
// 10-writing-style (section parent)
// ---------------------------------------------------------------------------
buildDoc(WS, "99-appendix-10-writing-style", "ws", "Writing style", [
  p(
    "intro",
    t(
      "How every doc in this corpus is written. This is working guidance for whoever is writing — human or agent — not part of the system's design. Load it before authoring or editing docs.",
    ),
  ),
  liNest("reg", [r("Register", `${WS_REF}/10-register`)], [
    li("reg-gloss", t("The matter-of-fact voice: lead with the fact, concrete over vague, present-state prose.")),
  ]),
  liNest("struct", [r("Structure", `${WS_REF}/20-structure`)], [
    li("struct-gloss", t("How shape carries meaning: bullets and the join test, lists, headings, titles and openers.")),
  ]),
  liNest("blocks", [r("Block conventions", `${WS_REF}/30-block-conventions`)], [
    li("blocks-gloss", t("Callout discipline, decision records, state-plus-operations, and media rules.")),
  ]),
]);

// ---------------------------------------------------------------------------
// 10-register
// ---------------------------------------------------------------------------
buildDoc(`${WS}/10-register`, "99-appendix-10-writing-style-10-register", "ws-reg", "Register", [
  p(
    "intro",
    t(
      "Write matter-of-fact: short declarative sentences that state what is, in the order the reader needs it.",
    ),
  ),
  li("lead", t("Lead with the fact. The first sentence of a doc or section states the thing itself — no setup, no “the idea here is”.")),
  li("one-idea", t("One idea per sentence, one topic per block. A plain lead sentence plus fact bullets beats a paragraph of prose.")),
  li("concrete", t("Concrete over vague: real numbers, real paths, real names. “Sixteen types”, never “several”.")),
  li(
    "no-preamble",
    t(
      "No preamble, no recap, no closing remarks. Start at the answer; stop when it is stated. Tangents move to their own home and get a link, not a sidebar.",
    ),
  ),
  li("no-memory", t("Assume no memory: a section stands alone or links to what it needs. Never “as mentioned above”.")),
  li(
    "present-state",
    t(
      "Present-state prose: a finished doc describes what exists now. No change-log voice (“now”, “previously”, “no longer”) unless the doc is explicitly about migration history.",
    ),
  ),
]);

// ---------------------------------------------------------------------------
// 20-structure
// ---------------------------------------------------------------------------
buildDoc(`${WS}/20-structure`, "99-appendix-10-writing-style-20-structure", "ws-struct", "Structure", [
  p(
    "intro",
    t(
      "How meaning is carried by shape: bullets and the tests that keep them prose-complete, list discipline, headings, and the title and opener every doc owes its reader.",
    ),
  ),
  li(
    "bullets",
    t(
      "Bullets are the default reading shape and carry prose meaning: a lead sentence states the claim, and each bullet is a complete sentence with its relationships and qualifiers attached. The join test: the lead plus the bullets, read in order, should reconstruct a well-written paragraph — consecutive fragments sharing one subject shape (“X carries A.” / “X carries B.”) mean the relating sentence was deleted.",
    ),
  ),
  li(
    "lead-gloss",
    t("A bullet never reads "),
    c("lead — gloss"),
    t(
      " on one line: the lead — a bold label, a link, a short phrase — is the parent bullet by itself, and the gloss and facts go in sub-bullets. Nest a second independent idea instead of packing the line; never split one thought into fragments to manufacture nesting.",
    ),
  ),
  li(
    "no-reenumerate",
    t(
      "Never re-enumerate an adjacent structured block: writing before a table or state-shape orients the reader; bullets that restate its rows are duplication that will drift.",
    ),
  ),
  li(
    "lists",
    t(
      "Multi-step work is a numbered list, each step one bounded action. Lists cap at about five items — past that, split or rank.",
    ),
  ),
  li(
    "headings",
    t(
      "Headings carry the skim path — a section scans in one screen. They are Title Case (minor words stay lowercase; acronyms and code-marked spans keep their exact form), at most one H1 per doc with sections on H2. Standards and design docs share the flow ",
    ),
    c("Structure"),
    t(", "),
    c("The Rule"),
    t(", "),
    c("Why"),
    t("."),
  ),
  li(
    "title-opener",
    t(
      "The title differentiates the doc from its siblings in a bare listing — “Component themes”, never “Themes, continued”. The body opens with a 2–4 sentence paragraph a reader arriving mid-corpus can judge relevance from alone.",
    ),
  ),
]);

// ---------------------------------------------------------------------------
// 30-block-conventions
// ---------------------------------------------------------------------------
buildDoc(
  `${WS}/30-block-conventions`,
  "99-appendix-10-writing-style-30-block-conventions",
  "ws-blocks",
  "Block conventions",
  [
    p(
      "intro",
      t(
        "How content maps onto the block vocabulary: callout discipline, the decision-record pattern, state-plus-operations, and media rules.",
      ),
    ),
    li(
      "callouts",
      t(
        "Decisions and warnings are callouts: kind carries the semantic label (“Decision”, “Open call”, “Named deviation”), tone carries the register. A callout body is one or two sentences — the labeled fact itself; mechanics, rationale, and examples get a heading after the callout and live in paragraphs.",
      ),
    ),
    li(
      "decision-record",
      t(
        "The decision-record pattern is two parts: a short dated callout stating the call (“Decision (2026-08-12) — sync publishes atomically.”), then an H3 section holding the reasoning and consequences.",
      ),
    ),
    li(
      "state-plus-ops",
      t(
        "System behavior documents as state plus operations: a code block of real, annotated JSON shows the state, an interaction-surface block lists the typed operations. State first, then operations.",
      ),
    ),
    li(
      "media",
      t(
        "Images always carry alt text — the agent surface is text-first. No empty-paragraph spacers; spacing is the theme's job.",
      ),
    ),
  ],
);

console.log("done");
