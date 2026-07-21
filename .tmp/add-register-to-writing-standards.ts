/**
 * Ford (2026-07-20): capture the matter-of-fact register as the corpus
 * writing style. Splices an H2 "The register" section into
 * 70-writing-standards after the intro, before "The rules". Derived from
 * Ford's hand-edited system-design overview (the exemplar) + his pasted
 * ADHD-shaped-output skill, adapted for docs. Canonical bytes; idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocBlock,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const r = (label: string, path: string): DeltaSpan => ({
  insert: label,
  attributes: { reference: { kind: "doc", path, label } },
});

type BlockInput = Omit<DocBlock, "id" | "children">;
const h2 = (text: string): BlockInput => ({ type: "heading", props: { level: 2 }, text: [t(text)] } as any);
const p = (...spans: DeltaSpan[]): BlockInput => ({ type: "paragraph", props: {}, text: spans } as any);
const li = (...spans: DeltaSpan[]): BlockInput => ({ type: "list-item", props: {}, text: spans } as any);

const PATH = "docs/10-system-design/10-doc-architecture/70-writing-standards/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
const root = doc.blocks[doc.root];

if (root.children.some((id: string) => id.startsWith("b-wstd-register-"))) {
  console.log("register section already present; nothing to do");
  process.exit(0);
}
const ANCHOR = "b-wstd-rule-heading-2";
const idx = root.children.indexOf(ANCHOR);
if (idx < 0) {
  console.error("anchor not found — doc changed; aborting");
  process.exit(1);
}

const defs: Array<[string, BlockInput]> = [
  ["h", h2("The register")],
  [
    "lead",
    p(
      t(
        "Every doc is written matter-of-fact: short declarative sentences that state what is, in the order the reader needs it. The ",
      ),
      r("system-design overview", "10-system-design"),
      t(" is the exemplar."),
    ),
  ],
  ["li-fact", li(t("Lead with the fact. The first sentence of a doc or section states the thing itself — no setup, no \"the idea here is\"."))],
  ["li-one-idea", li(t("One idea per sentence, one topic per block. A plain lead sentence plus fact bullets beats a paragraph of prose."))],
  ["li-concrete", li(t("Concrete over vague: real numbers, real paths, real names. \"Fourteen types\", never \"several\"."))],
  ["li-no-preamble", li(t("No preamble, no recap, no closing remarks. Start at the answer; stop when it is stated."))],
  ["li-no-memory", li(t("Assume no memory: a section stands alone or links to what it needs. Never \"as mentioned above\"."))],
  ["pacing", p(t("Structure does the reader's pacing:"))],
  ["li-steps", li(t("Multi-step work is a numbered list; each step is one bounded action."))],
  ["li-cap", li(t("Lists cap at about five items. Past that, split the list or rank it."))],
  ["li-tangent", li(t("Tangents move to their own home and get a link, not a sidebar."))],
  ["li-skim", li(t("Headings carry the skim path; a section should scan in one screen."))],
];

const newIds: string[] = [];
let n = 0;
for (const [slug, block] of defs) {
  n += 1;
  const id = `b-wstd-register-${slug}-${n}`;
  doc.blocks[id] = { id, children: [], ...block };
  newIds.push(id);
}
root.children = [...root.children.slice(0, idx), ...newIds, ...root.children.slice(idx)];

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log(`register section added: ${newIds.length} blocks`);
