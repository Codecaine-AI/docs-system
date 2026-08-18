/**
 * Writing-style migration: moves repo-root writingstyle.md into the corpus as
 * docs/99-appendix/10-writing-style/ — one parent bundle plus one child page
 * per section (register, structure, design narrative, titles and openings,
 * block conventions, anti-patterns, why these hold) — and authors the
 * 99-appendix tier parent. Canonical serializer bytes per bundle; idempotent.
 * Content matches writingstyle.md except the stale "Fourteen types" example,
 * corrected to sixteen (the block vocabulary count).
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
const h2 = (slug: string, ...text: DeltaSpan[]): NodeInput => ({
  slug,
  type: "heading",
  props: { level: 2 },
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
  dir: string,
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
    console.error(`${dir} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/doc.json`, serializeDocDocument(result.document));
  console.log(`wrote ${dir}/doc.json (${Object.keys(doc.blocks).length} blocks)`);
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
      t("How every doc in this corpus is written — register, structure, block conventions, and the anti-patterns to repair."),
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
      "How every doc in this corpus is written. This is working guidance for whoever is writing — human or agent — not part of the system's design. Load it before authoring or editing docs; each page below owns one aspect of the craft.",
    ),
  ),
  liNest("reg", [r("Register", `${WS_REF}/10-register`)], [
    li("reg-gloss", t("The matter-of-fact voice: lead with the fact, one idea per sentence, concrete over vague.")),
  ]),
  liNest("struct", [r("Structure", `${WS_REF}/20-structure`)], [
    li("struct-gloss", t("Bullets as the default reading shape, the join test, nesting, list caps, and heading discipline.")),
  ]),
  liNest("narrative", [r("Design narrative", `${WS_REF}/30-design-narrative`)], [
    li("narrative-gloss", t("Writing about a designed system so the reader leaves with the model, not a pile of attributes.")),
  ]),
  liNest("titles", [r("Titles and openings", `${WS_REF}/40-titles-and-openings`)], [
    li("titles-gloss", t("What titles and opening paragraphs must do, and the SCAN/SKIM/READ model they serve.")),
  ]),
  liNest("blocks", [r("Block conventions", `${WS_REF}/50-block-conventions`)], [
    li("blocks-gloss", t("How content maps onto blocks: present-state prose, heading budget, callouts, decision records, media.")),
  ]),
  liNest("anti", [r("Anti-patterns", `${WS_REF}/60-anti-patterns`)], [
    li("anti-gloss", t("The shapes that mark a doc as needing repair, named so review can point at them.")),
  ]),
  liNest("why", [r("Why these hold", `${WS_REF}/70-why-these-hold`)], [
    li("why-gloss", t("The rationale: decay rules, greppability on the agent surface, golden-pinned renders.")),
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
  li("no-preamble", t("No preamble, no recap, no closing remarks. Start at the answer; stop when it is stated.")),
  li("no-memory", t("Assume no memory: a section stands alone or links to what it needs. Never “as mentioned above”.")),
]);

// ---------------------------------------------------------------------------
// 20-structure
// ---------------------------------------------------------------------------
buildDoc(`${WS}/20-structure`, "99-appendix-10-writing-style-20-structure", "ws-struct", "Structure", [
  p(
    "intro",
    t(
      "How meaning is carried by shape: bullets as the default reading form, the tests that keep them prose-complete, and the discipline for lists and headings.",
    ),
  ),
  li(
    "bullets-default",
    t(
      "Bullets are the default reading shape, and they carry prose meaning. A section opens with a lead sentence or short paragraph stating the design claim; the supporting material breaks into bullets at its natural seams, each bullet a complete sentence with its relationships, qualifiers, and consequences attached.",
    ),
  ),
  li(
    "join-test",
    t(
      "The join test: reading the lead plus the bullets in order should reconstruct a well-written paragraph. Choppy fragments mean meaning was stripped; a bullet the reader cannot understand without guessing means context was stripped.",
    ),
  ),
  li(
    "nesting",
    t(
      "Nest a sub-bullet under its parent instead of packing a second independent idea into the line — but never split one thought into fragments to manufacture nesting.",
    ),
  ),
  li(
    "lead-gloss",
    t("A bullet never reads "),
    c("lead — gloss"),
    t(
      " on one line. The lead — a bold label, a link, or a short phrase — is the parent bullet by itself; the gloss and every fact go in sub-bullets beneath it. This applies to index lists, why-sections, invariant lists — everywhere.",
    ),
  ),
  li("numbered", t("Multi-step work is a numbered list; each step is one bounded action.")),
  li("cap", t("Lists cap at about five items. Past that, split the list or rank it.")),
  li("tangents", t("Tangents move to their own home and get a link, not a sidebar.")),
  li("skim", t("Headings carry the skim path; a section should scan in one screen.")),
  li(
    "title-case",
    t(
      "Headings are Title Case: the first letter of every word is capitalized, except minor words (a, an, and, as, at, but, by, for, in, nor, of, on, or, per, the, to, via, vs) which stay lowercase mid-heading. Only a word's first letter changes — acronyms, camelCase identifiers, and code-marked spans keep their exact form. Body text is unaffected: mid-sentence words are never capitalized for style.",
    ),
  ),
  li(
    "section-flow",
    t("Standards and design docs share one section flow and one set of heading names: "),
    c("Structure"),
    t(" (show the thing — a file tree or annotated code), then "),
    c("The Rule"),
    t(", then "),
    c("Why"),
    t("."),
  ),
]);

// ---------------------------------------------------------------------------
// 30-design-narrative
// ---------------------------------------------------------------------------
buildDoc(
  `${WS}/30-design-narrative`,
  "99-appendix-10-writing-style-30-design-narrative",
  "ws-narrative",
  "Design narrative",
  [
    p(
      "intro",
      t(
        "How to write about a designed system so the reader leaves with the model, not a pile of attributes. The shape can be bullets or prose; the meaning must be prose-complete either way.",
      ),
    ),
    li(
      "orientation",
      t(
        "A concept section leads with what the thing is, where it sits among its neighbors (who owns it, what composes it, what it mirrors), and why it is shaped that way. Orientation comes first — “every workflow state object wears the same envelope; ProjectState composes those objects and marks which one is active” — then the specifics, as bullets or paragraphs.",
      ),
    ),
    li(
      "relationships",
      t(
        "Relationships are the content. The state-shape block already enumerates the fields; the writing around it must add what the shape cannot say: the split of responsibilities, the invariant that makes the design work, the consequence for whoever builds against it.",
      ),
    ),
    li(
      "atomization",
      t(
        "The atomization test: “The envelope carries identity.” / “The envelope carries ordering.” fails not because it is bulleted but because the sentence relating them was deleted. Fix it in bullet shape — state the relation in the lead (“The envelope is the part every state object shares, so any consumer can order, trace, and explain every object the same way:”) and give each bullet one full thought (“identity — id, project_id, kind — names every object the same way, so a run, campaign, or session is addressed uniformly”) — or fold it into one paragraph. Either passes; fragments do not.",
      ),
    ),
    li(
      "no-reenumerate",
      t(
        "Never re-enumerate an adjacent structured block. Writing before a state-shape or table orients the reader; bullets that restate its rows are duplication that will drift.",
      ),
    ),
    li(
      "done-test",
      t(
        "The test for done: could a reader rebuild the design's shape from the leads and bullets alone, with the structured blocks only filling in exact names? If they only list attributes, it fails.",
      ),
    ),
  ],
);

// ---------------------------------------------------------------------------
// 40-titles-and-openings
// ---------------------------------------------------------------------------
buildDoc(
  `${WS}/40-titles-and-openings`,
  "99-appendix-10-writing-style-40-titles-and-openings",
  "ws-titles",
  "Titles and openings",
  [
    p(
      "intro",
      t(
        "What a title and an opening paragraph each owe the reader, and the three-cut reading model (SCAN, SKIM, READ) those obligations serve.",
      ),
    ),
    li(
      "title",
      t(
        "The title is bundle metadata, rendered as the page title on every surface. Make it differentiate the doc from its siblings at a glance — “Component themes”, never “Themes, continued”. It must work in a bare listing with no body in sight.",
      ),
    ),
    li(
      "opener",
      t(
        "Every doc opens with a 2–4 sentence paragraph a reader can judge relevance from alone: what this covers, what reading it gets you. It must work for a reader arriving mid-corpus with no surrounding context.",
      ),
    ),
    li(
      "three-cuts",
      t(
        "The reading model is three cuts: SCAN takes the title and first line and answers “potentially relevant?”; SKIM takes the opening paragraph and answers “is this enough context?”; READ takes the full body, only when the task lives there. Titles serve SCAN; openers serve SKIM.",
      ),
    ),
    li(
      "taxes",
      t(
        "A vague title forces SKIM on every scan; a missing opener forces READ on every visit. Both taxes are paid by every reader on every traversal.",
      ),
    ),
  ],
);

// ---------------------------------------------------------------------------
// 50-block-conventions
// ---------------------------------------------------------------------------
buildDoc(
  `${WS}/50-block-conventions`,
  "99-appendix-10-writing-style-50-block-conventions",
  "ws-blocks",
  "Block conventions",
  [
    p(
      "intro",
      t(
        "How content maps onto the block vocabulary: the voice a finished doc holds, the heading budget, callout discipline, the decision-record pattern, and media rules.",
      ),
    ),
    li(
      "present-state",
      t(
        "Present-state prose: a finished doc describes what exists now. No change-log voice (“now”, “previously”, “no longer”) unless the doc is explicitly about migration history.",
      ),
    ),
    li(
      "h1-budget",
      t(
        "At most one level-1 heading per doc. The page title is furniture rendered above the body, so most docs need no H1; where one is kept it is the doc's thesis line, not a duplicate of the title. Sections use H2.",
      ),
    ),
    li(
      "callouts",
      t(
        "Decisions and warnings are callouts: kind carries the semantic label (“Decision”, “Open call”, “Named deviation”), tone carries the register. This pair is how the corpus encodes decision records.",
      ),
    ),
    li(
      "callout-length",
      t(
        "A callout body is one or two sentences — the labeled fact itself. Mechanics, rationale, history, and examples are body content: give them a heading (H2/H3) after the callout and carry them in paragraphs. A callout that scrolls is a section wearing a border.",
      ),
    ),
    li(
      "decision-record",
      t(
        "The decision-record pattern is therefore two parts: a short dated callout stating the call (“Decision (2026-08-12) — sync publishes atomically.”), then an H3 section such as ",
      ),
      c("Why Sync Stages First"),
      t(" holding the reasoning and consequences."),
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
        "Images always carry alt text. No empty-paragraph spacers — an empty paragraph renders as nothing on the agent surface, and spacing is the theme's job on the human one.",
      ),
    ),
  ],
);

// ---------------------------------------------------------------------------
// 60-anti-patterns
// ---------------------------------------------------------------------------
buildDoc(
  `${WS}/60-anti-patterns`,
  "99-appendix-10-writing-style-60-anti-patterns",
  "ws-anti",
  "Anti-patterns",
  [
    p(
      "intro",
      t(
        "The shapes that mark a doc as needing repair. Each is named so a review can point at what is wrong in one term.",
      ),
    ),
    li("essay", t("Essay prose: rhetorical setup, thesis paragraphs, “the idea here is that”.")),
    li("vague", t("Vague quantities (“several”, “a few”, “some work”).")),
    li(
      "buried",
      t("Buried facts: a fact that only appears mid-paragraph instead of leading a sentence or bullet."),
    ),
    li("sidebars", t("Sidebars (“by the way”, “note that also…”) — file them where they belong.")),
    li(
      "long-callouts",
      t(
        "Multi-paragraph callouts: if the admonition needs more than two sentences, the overflow is a section, not callout body.",
      ),
    ),
    li(
      "atomized",
      t(
        "Atomized bullets: consecutive fragments sharing one subject and verb shape (“X carries A.” / “X carries B.”) — the relating sentence was deleted. Bullets must carry prose-complete meaning, not stripped nouns.",
      ),
    ),
    li(
      "row-echo",
      t("Row-echo prose: bullets that restate an adjacent table or state-shape one line per row."),
    ),
  ],
);

// ---------------------------------------------------------------------------
// 70-why-these-hold
// ---------------------------------------------------------------------------
buildDoc(
  `${WS}/70-why-these-hold`,
  "99-appendix-10-writing-style-70-why-these-hold",
  "ws-why",
  "Why these hold",
  [
    p(
      "intro",
      t(
        "The rationale behind the register and the block conventions: rules chosen for how they age and how they serve both reading surfaces, not for taste.",
      ),
    ),
    li(
      "decay",
      t(
        "Present-state voice is a decay rule: change-log narration goes stale the day it lands; describing what exists dates far more slowly.",
      ),
    ),
    li(
      "greppable",
      t(
        "Heading discipline and labeled callouts serve the agent surface, where structure is only as real as it is greppable: ",
      ),
      c("docs grep '> \\*\\*Decision'"),
      t(" enumerates every decision record; "),
      c("docs grep '^## '"),
      t(" returns a clean outline because H1 stays scarce."),
    ),
    li(
      "alt-text",
      t(
        "Alt text is a two-reader obligation: the agent surface is text-first, and an image without alt is a blank line to half the audience.",
      ),
    ),
    li(
      "goldens",
      t(
        "Every render is pinned by goldens, so a convention regression shows up as a diff, not a vibe.",
      ),
    ),
  ],
);

console.log("done");
