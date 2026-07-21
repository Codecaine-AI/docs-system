/**
 * Ford's calls (2026-07-21): (1) delta spans are the RICH-TEXT FAMILY'S
 * internal state, not a global data-model shape — the span representation
 * moves into the family overview (block vocabulary); data-model's
 * 30-rich-text is deleted and the section becomes FOUR shapes + behavior.
 * (2) The block-design contract gains a sixth element: the AGENT ADAPTER
 * (default generic ops; complex types bring their own agent + context
 * loader), marked target-design. Annotations' lifecycle points at it.
 * Also: family-overview type bullets split per the bullet standard
 * (code-marked leads the earlier sweep missed), dup H1 dropped.
 * Canonical bytes.
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
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

function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`landed ${path}`);
}

const SPAN_PATH = "docs/10-system-design/30-data-model/30-rich-text/doc.json";
const FAMILY_PATH = "docs/10-system-design/40-block-vocabulary/10-rich-text/doc.json";
const spanDoc = JSON.parse(readFileSync(SPAN_PATH, "utf8"));
const family = JSON.parse(readFileSync(FAMILY_PATH, "utf8"));

// ---------------------------------------------- family overview: splice state
{
  const root = family.blocks[family.root];
  // drop dup H1
  root.children = root.children.filter((id: string) => id !== "b-rich-text-overview-title-1");
  delete family.blocks["b-rich-text-overview-title-1"];

  // split code-lead em-dash type bullets
  for (const id of root.children.slice()) {
    const block = family.blocks[id];
    if (block.type !== "list-item" || !block.text || block.text.length < 2) continue;
    const [first, ...rest] = block.text as DeltaSpan[];
    if (!first.attributes?.code) continue;
    if (typeof rest[0]?.insert !== "string" || !rest[0].insert.startsWith(" — ")) continue;
    const glossFirst = { ...rest[0], insert: rest[0].insert.slice(3) };
    if (typeof glossFirst.insert === "string") {
      glossFirst.insert = glossFirst.insert.charAt(0).toUpperCase() + glossFirst.insert.slice(1);
    }
    const subId = `${id}-gloss`;
    family.blocks[subId] = {
      id: subId,
      type: "list-item",
      props: {},
      text: [glossFirst, ...rest.slice(1)],
      children: [],
    };
    block.text = [first];
    block.children = [subId, ...(block.children ?? [])];
  }

  // ported span-state blocks (verbatim from the span doc)
  const PORT = [
    "b-20-rich-text-delta-example-3",
    "b-20-rich-text-marks-4",
    "b-rt-mark-bools-19",
    "b-rt-mark-strict-20",
    "b-rt-mark-canonical-21",
    "b-20-rich-text-links-6",
    "b-20-rich-text-link-mark-7",
    "b-20-rich-text-spectre-ref-8",
    "b-20-rich-text-ref-example-9",
    "b-20-rich-text-ref-neutral-home-10",
    "b-rt-ref-display-22",
    "b-20-rich-text-carriers-11",
    "b-20-rich-text-carriers-intro-12",
    "b-20-rich-text-carriers-table-13",
    "b-20-rich-text-bridges-14",
    "b-20-rich-text-bridges-out-15",
    "b-20-rich-text-bridges-in-16",
  ];
  for (const id of PORT) {
    const block = spanDoc.blocks[id];
    if (!block) {
      console.error(`port block missing: ${id}; aborting`);
      process.exit(1);
    }
    family.blocks[id] = block;
  }
  family.blocks["b-rtfam-state-h-20"] = {
    id: "b-rtfam-state-h-20",
    type: "heading",
    props: { level: 2 },
    children: [],
    text: [t("The state: delta spans")],
  };
  family.blocks["b-rtfam-state-lead-21"] = {
    id: "b-rtfam-state-lead-21",
    type: "paragraph",
    props: {},
    children: [],
    text: [
      t(
        "The family's internal state is rich text itself: an array of Delta JSON spans in the block's text field — each span a string insert plus an optional attributes object. There is no other inline model — no HTML, no nested marks tree. A span either has an attribute or it does not.",
      ),
    ],
  };
  root.children = [
    ...root.children,
    "b-rtfam-state-h-20",
    "b-rtfam-state-lead-21",
    ...PORT,
  ];
  land(FAMILY_PATH, family);
}

// -------------------------------------------------- delete the span doc + dir
rmSync("docs/10-system-design/30-data-model/30-rich-text", { recursive: true });
console.log("deleted 30-data-model/30-rich-text");

// ------------------------------------------- re-point inbound refs corpus-wide
{
  const files = Array.from(new Bun.Glob("docs/**/doc.json").scanSync({ cwd: "." })).sort();
  for (const path of files) {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    let touched = false;
    for (const block of Object.values(doc.blocks) as Array<{ text?: DeltaSpan[] }>) {
      for (const span of block.text ?? []) {
        const r = span.attributes?.reference as { path?: string } | undefined;
        if (r?.path === "10-system-design/30-data-model/30-rich-text") {
          r.path = "10-system-design/40-block-vocabulary/10-rich-text";
          if (span.insert === "rich-text model") span.insert = "rich text";
          touched = true;
        }
      }
    }
    if (touched) land(path, doc);
  }
}

// --------------------------------------- data-model overview: four shapes
{
  const path = "docs/10-system-design/30-data-model/doc.json";
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];
  root.children = root.children.filter((id: string) => id !== "b-dm2-idx-rich-5");
  for (const sub of doc.blocks["b-dm2-idx-rich-5"]?.children ?? []) delete doc.blocks[sub];
  delete doc.blocks["b-dm2-idx-rich-5"];
  const shapesH = doc.blocks["b-dm2-shapes-h-3"];
  if (shapesH) shapesH.text = [t("The four shapes")];
  for (const block of Object.values(doc.blocks) as Array<{ text?: DeltaSpan[] }>) {
    for (const span of block.text ?? []) {
      if (typeof span.insert === "string" && span.insert.includes("Five shapes describe the state")) {
        span.insert = span.insert.replace("Five shapes describe the state", "Four shapes describe the state");
        span.insert = span.insert.replace("Hold those six things", "Hold those five things");
      }
    }
  }
  land(path, doc);
}

// ------------------- block design: text-field note + AGENT ADAPTER element
{
  const path = "docs/10-system-design/30-data-model/20-block-design/doc.json";
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];
  // state bullet gains the text-field sub
  const state = doc.blocks["b-bd-state-5"];
  doc.blocks["b-bd-state-sub3-31"] = {
    id: "b-bd-state-sub3-31",
    type: "list-item",
    props: {},
    children: [],
    text: [
      t("Text is no exception: delta spans are the "),
      ref("rich text", "10-system-design/40-block-vocabulary/10-rich-text"),
      t(" family's state, held in the block's dedicated text field."),
    ],
  };
  state.children = [...state.children, "b-bd-state-sub3-31"];
  // agent adapter contract element
  doc.blocks["b-bd-adapter-32"] = {
    id: "b-bd-adapter-32",
    type: "list-item",
    props: {},
    children: ["b-bd-adapter-sub1-33", "b-bd-adapter-sub2-34", "b-bd-adapter-sub3-35"],
    text: [b("Agent adapter")],
  };
  doc.blocks["b-bd-adapter-sub1-33"] = {
    id: "b-bd-adapter-sub1-33",
    type: "list-item",
    props: {},
    children: [],
    text: [
      t(
        "How an agent edits the type when it processes an annotation. The default is generic: typed ops over the doc render — most types need nothing more.",
      ),
    ],
  };
  doc.blocks["b-bd-adapter-sub2-34"] = {
    id: "b-bd-adapter-sub2-34",
    type: "list-item",
    props: {},
    children: [],
    text: [
      t(
        "Complex types — canvas, sequence — declare their own agent: a context loader that assembles what that agent needs, and writeback through the type's own actions.",
      ),
    ],
  };
  doc.blocks["b-bd-adapter-sub3-35"] = {
    id: "b-bd-adapter-sub3-35",
    type: "list-item",
    props: {},
    children: [],
    text: [
      t("Target design: the adapter lands with annotate mode. The rest of the contract exists today."),
    ],
  };
  const themeAt = root.children.indexOf("b-bd-theme-15");
  if (themeAt < 0) {
    console.error("theme bullet missing; aborting");
    process.exit(1);
  }
  root.children.splice(themeAt + 1, 0, "b-bd-adapter-32");
  land(path, doc);
}

// -------------------- annotations: execution-is-per-type lifecycle bullet
{
  const path = "docs/10-system-design/30-data-model/40-annotations/doc.json";
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];
  doc.blocks["b-ann-life-exec-27"] = {
    id: "b-ann-life-exec-27",
    type: "list-item",
    props: {},
    children: ["b-ann-life-exec-sub-28"],
    text: [b("Execution is per-type")],
  };
  doc.blocks["b-ann-life-exec-sub-28"] = {
    id: "b-ann-life-exec-sub-28",
    type: "list-item",
    props: {},
    children: [],
    text: [
      t("How the agent edits the target is the block type's business — the agent adapter in "),
      ref("block design", "10-system-design/30-data-model/20-block-design"),
      t(". Canvas and sequence bring their own agents."),
    ],
  };
  const receiptAt = root.children.indexOf("b-ann-life-receipt-15");
  if (receiptAt < 0) {
    console.error("receipt bullet missing; aborting");
    process.exit(1);
  }
  root.children.splice(receiptAt + 1, 0, "b-ann-life-exec-27");
  land(path, doc);
}

console.log("spans-to-family + agent adapter complete");
