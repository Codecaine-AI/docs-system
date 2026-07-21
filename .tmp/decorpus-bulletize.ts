/**
 * Ford's directives (2026-07-21, doc-standards read-through): (1) stop the
 * docs-about-the-docs framing — "the corpus" phrasing swept to "the docs" /
 * "the doc tree" across the section (Ford's live-edited overview opener
 * touched ONLY for the phrase, structure preserved); (2) bulletize for
 * readability — why-sections become bold-lead fact bullets, the placement
 * litmus and reading-flow paragraphs become lead bullets with sub-bullets,
 * the parent-doc abstract nests under its rule bullet. Canonical bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });

const SEC = "docs/10-system-design/10-doc-standards";
const DOCS = [
  `${SEC}/doc.json`,
  `${SEC}/10-structure/doc.json`,
  `${SEC}/20-numbering/doc.json`,
  `${SEC}/30-cross-doc-linking/doc.json`,
  `${SEC}/40-code-linking/doc.json`,
  `${SEC}/50-in-code-docs/doc.json`,
];

const SWEEP: Array<[string, string]> = [
  ["the bet this corpus is built on", "the bet these docs are built on"],
  ["The corpus is a tree of bundle folders", "The docs are a tree of bundle folders"],
  ["reading the corpus cheaper", "reading the docs cheaper"],
  ["the corpus works as a repair manual", "the docs work as a repair manual"],
  ["holds the corpus at zero stale", "holds the docs at zero stale"],
  ["keep the corpus from overlinking", "keep the docs from overlinking"],
  ["a corpus that links everything ranks nothing", "docs that link everything rank nothing"],
  ["moving through the corpus feels", "moving through the docs feels"],
  ["Documentation does not stop at the corpus", "Documentation does not stop at the doc tree"],
  ["The corpus stops at L3", "The doc tree stops at L3"],
  ["leaves the corpus with the question framed", "leaves the docs with the question framed"],
  ["Every doc and folder in the corpus carries", "Every doc and folder carries"],
  ["the source stays ignorant of the corpus", "the source stays ignorant of the docs"],
];

function load(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`landed ${path}`);
}
function li(id: string, text: DeltaSpan[], children: string[] = []) {
  return { id, type: "list-item", props: {}, text, children };
}
function replaceRun(doc: any, removeIds: string[], defs: Array<Record<string, unknown>>) {
  const root = doc.blocks[doc.root];
  const at = root.children.indexOf(removeIds[0]);
  if (at < 0) {
    console.error(`anchor ${removeIds[0]} missing; aborting`);
    process.exit(1);
  }
  const newTop: string[] = [];
  for (const def of defs) {
    doc.blocks[def.id as string] = def;
    if (!(def as { sub?: boolean }).sub) newTop.push(def.id as string);
    delete (def as { sub?: boolean }).sub;
  }
  root.children = root.children.flatMap((id: string) =>
    id === removeIds[0] ? newTop : removeIds.includes(id) ? [] : [id],
  );
  for (const id of removeIds) delete doc.blocks[id];
}

// ------------------------------------------------------------ phrase sweep
let sweptTotal = 0;
const leftovers: string[] = [];
const loaded = new Map<string, any>();
for (const path of DOCS) {
  const doc = load(path);
  loaded.set(path, doc);
  for (const block of Object.values(doc.blocks) as Array<{ text?: DeltaSpan[] }>) {
    if (!block.text) continue;
    for (const span of block.text) {
      if (typeof span.insert !== "string") continue;
      for (const [from, to] of SWEEP) {
        if (span.insert.includes(from)) {
          span.insert = span.insert.split(from).join(to);
          sweptTotal += 1;
        }
      }
      if (/corpus/i.test(span.insert)) leftovers.push(`${path}: ${span.insert.slice(0, 90)}`);
    }
  }
}
console.log(`phrase sweep: ${sweptTotal} replacements`);
if (leftovers.length) {
  console.log("REMAINING corpus mentions (manual review):");
  for (const l of leftovers) console.log("  " + l);
}

// ---------------------------------------------------------------- structure
{
  const doc = loaded.get(`${SEC}/10-structure/doc.json`);
  // litmus paragraph: Ford DELETED it in a live edit (disk truth) — skip.
  if (doc.blocks["b-struct-litmus-7"]) {
    console.error("unexpected: litmus block reappeared; aborting");
    process.exit(1);
  }
  // parent-doc abstract nests under the parent-doc rule bullet
  const parent = doc.blocks["b-struct-parent-15"];
  doc.blocks["b-struct-abstract-sub-34"] = li("b-struct-abstract-sub-34", [
    t(
      "An abstract, not a table of contents: after reading it, a reader can explain the domain and descends only where the task lives.",
    ),
  ]);
  parent.children = ["b-struct-abstract-sub-34"];
  const root = doc.blocks[doc.root];
  root.children = root.children.filter((id: string) => id !== "b-struct-abstract-17");
  delete doc.blocks["b-struct-abstract-17"];
  // why paragraphs -> five bold-lead bullets
  replaceRun(
    doc,
    ["b-struct-why-decay-23", "b-struct-why-ladder-24", "b-struct-why-mirror-25", "b-struct-why-threshold-26"],
    [
      li("b-struct-why-rate-35", [
        b("Rate of change"),
        t(
          " — the durable must not rot with the volatile: swap the backend's language and Implementation rewrites, System Design barely moves, Foundation does not move at all. The purity test makes that promise real — a Design doc that names a class is coupled to the code it should outlive.",
        ),
      ]),
      li("b-struct-why-descent-36", [
        b("Descent control"),
        t(
          " — a reader takes only the depth the task requires; every rung states enough to decide whether the next is worth the trip. That is what makes reading the docs cheaper than reading the code.",
        ),
      ]),
      li("b-struct-why-mapping-37", [
        b("Mechanical mapping"),
        t(
          " — standing in the source you can name the doc's address, and standing in the doc you can name the source path. No index required.",
        ),
      ]),
      li("b-struct-why-skipping-38", [
        b("Safe skipping"),
        t(
          " — the docs work as a repair manual only if a reader can rule a folder out without opening its children.",
        ),
      ]),
      li("b-struct-why-honest-39", [
        b("An honest tree"),
        t(
          " — structure records how the material actually grew. Premature folders add descent that pays nothing; parent-plus-one folders are pure tax.",
        ),
      ]),
    ],
  );
}

// ---------------------------------------------------------------- numbering
{
  const doc = loaded.get(`${SEC}/20-numbering/doc.json`);
  replaceRun(doc, ["b-num-why-order-13", "b-num-why-signal-14"], [
    li("b-num-why-readorder-17", [
      b("Reading order lives in the filesystem"),
      t(
        " — every surface that sorts names — sidebar, terminal, render listing — agrees without a manifest.",
      ),
    ]),
    li("b-num-why-local-18", [
      b("Insertion is local"),
      t(
        " — a new doc lands mid-gap and nothing else moves, which matters when paths are reference targets.",
      ),
    ]),
    li("b-num-why-exhaust-19", [
      b("Exhaustion is a signal"),
      t(
        " — the moment you cannot number a doc, the section needs a subfolder. Packing consecutive numbers silences that signal.",
      ),
    ]),
  ]);
}

// --------------------------------------------------------- cross-doc linking
{
  const doc = loaded.get(`${SEC}/30-cross-doc-linking/doc.json`);
  replaceRun(doc, ["b-xlink-why-typed-15", "b-xlink-why-direction-16"], [
    li("b-xlink-why-rot-19", [
      b("Tracked links cannot rot"),
      t(
        " — a link the system tracks is held at zero stale, so a reader can trust every one they follow.",
      ),
    ]),
    li("b-xlink-why-labels-20", [
      b("Labels are prose"),
      t(
        " — references render as their labels on the agent surface; a bad label is bad prose there, not just a bad link.",
      ),
    ]),
    li("b-xlink-why-tree-21", [
      b("A tree for navigation, a web for substance"),
      t(
        " — parent docs stay the one place navigation happens, so moving through the docs feels the same everywhere.",
      ),
    ]),
    li("b-xlink-why-restraint-22", [
      b("Restraint keeps links meaningful"),
      t(
        " — when every link is a claim of need, a reader can afford to follow them. Docs that link everything rank nothing.",
      ),
    ]),
    li("b-xlink-why-onehome-23", [
      b("One home per concept"),
      t(
        " — the mutual-deferral ban keeps ownership sharp; every link points at the concept's one home.",
      ),
    ]),
  ]);
}

// -------------------------------------------------------------- code linking
{
  const doc = loaded.get(`${SEC}/40-code-linking/doc.json`);
  replaceRun(doc, ["b-clink-why-oneway-12", "b-clink-why-paths-13"], [
    li("b-clink-why-bill-17", [
      b("The maintenance bill lands where it can be paid"),
      t(
        " — docs know about code, so a refactor ends with a docs pass. The code never waits on one and never carries stale doc paths.",
      ),
    ]),
    li("b-clink-why-claim-18", [
      b("A full path is a checkable claim"),
      t(" — a bare filename is a vibe. "),
      c("docs links check"),
      t(" verifies the path exists, and a reader opens it without a search."),
    ]),
    li("b-clink-why-inline-19", [
      b("Inline beats a link farm"),
      t(
        " — the reader arrives at the path with the question already framed. The Related Files list is the fallback for file-heavy docs, not the default.",
      ),
    ]),
  ]);
}

// -------------------------------------------------------------- in-code docs
{
  const doc = loaded.get(`${SEC}/50-in-code-docs/doc.json`);
  // flow paragraph -> lead bullet + three sub-bullets
  replaceRun(doc, ["b-icd-flow-6"], [
    li(
      "b-icd-flow-lead-15",
      [
        t(
          "Each unit answers the question a parent doc answers one level up — is the thing I need below this point?",
        ),
      ],
      ["b-icd-flow-header-16", "b-icd-flow-docstring-17", "b-icd-flow-comments-18"],
    ),
    { ...li("b-icd-flow-header-16", [t("The header rules the file in or out.")]), sub: true },
    { ...li("b-icd-flow-docstring-17", [t("Docstrings rule the function in or out.")]), sub: true },
    { ...li("b-icd-flow-comments-18", [t("Comments carry the reader through what remains.")]), sub: true },
  ]);
  replaceRun(doc, ["b-icd-why-churn-10", "b-icd-why-flow-11"], [
    li("b-icd-why-churn-19", [
      b("Files churn too fast for doc bundles"),
      t(
        " — the doc tree stops at L3, one doc per concept. The lower rungs live in the source, so they move, diff, and review with the code they describe.",
      ),
    ]),
    li("b-icd-why-flow-20", [
      b("The flow pays off at the file"),
      t(
        " — a reader leaves the docs with the question framed; the first screenful confirms or rules the file out. Code is read last, and only where the task lives.",
      ),
    ]),
  ]);
}

for (const path of DOCS) land(path, loaded.get(path));
console.log("de-corpus + bulletize complete");
