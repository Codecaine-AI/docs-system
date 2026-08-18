/**
 * Style-guide section: authors docs/99-appendix/10-style-guide/ — the
 * 99-appendix tier parent, the section parent, and two pages (writing style
 * and structure) — and writes their projection goldens.
 * Consolidated from the seven-page first cut: anti-patterns (negative
 * restatements of the positive rules), why-these-hold (pure rationale), and
 * the philosophy halves of design-narrative and titles-and-openings carry no
 * instruction the remaining pages lack; block-conventions dissolved into the
 * block-vocabulary pages' own usage guidance. Canonical serializer bytes;
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
const SG = `${APPENDIX}/10-style-guide`;
const SG_REF = "99-appendix/10-style-guide";

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
  liNest("sg", [r("Style guide", SG_REF)], [
    li(
      "sg-gloss",
      t("How every doc in this corpus is written — its writing style and structure."),
    ),
  ]),
]);

// ---------------------------------------------------------------------------
// 10-style-guide (section parent)
// ---------------------------------------------------------------------------
buildDoc(SG, "99-appendix-10-style-guide", "sg", "Style guide", [
  p(
    "intro",
    t(
      "How every doc in this corpus is written. This is working guidance for whoever is writing — human or agent — not part of the system's design. Load it before authoring or editing docs.",
    ),
  ),
  liNest("ws", [r("Writing style", `${SG_REF}/10-writing-style`)], [
    li("ws-gloss", t("The matter-of-fact voice: lead with the fact, concrete over vague, present-state prose.")),
  ]),
  liNest("struct", [r("Structure", `${SG_REF}/20-structure`)], [
    li("struct-gloss", t("How shape carries meaning: bullets and the join test, lists, headings, titles and openers.")),
  ]),
]);

// ---------------------------------------------------------------------------
// 10-writing-style
// ---------------------------------------------------------------------------
buildDoc(`${SG}/10-writing-style`, "99-appendix-10-style-guide-10-writing-style", "sg-ws", "Writing style", [
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
buildDoc(`${SG}/20-structure`, "99-appendix-10-style-guide-20-structure", "sg-struct", "Structure", [
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

console.log("done");
