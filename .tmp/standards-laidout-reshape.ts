/**
 * Ford's directive (2026-07-20, after reading the restructure): drop the
 * "In this corpus" prose sections from the five standards docs. Each doc's
 * flow is: how it's laid out (shown with a REAL component — file-tree or
 * annotated code block) → the rule → the why. Corpus facts worth keeping
 * move into component notes/annotations. Overview intro line updated to
 * describe the same flow. Canonical bytes; idempotent-ish (guards on ids).
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });

const SEC = "docs/10-system-design/10-doc-standards";

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
function removeBlocks(doc: any, ids: string[]) {
  const root = doc.blocks[doc.root];
  root.children = root.children.filter((id: string) => !ids.includes(id));
  for (const id of ids) delete doc.blocks[id];
}
function insertAfter(doc: any, anchor: string, defs: Array<[string, Record<string, unknown>]>) {
  const root = doc.blocks[doc.root];
  const at = root.children.indexOf(anchor);
  if (at < 0) {
    console.error(`anchor ${anchor} missing; aborting`);
    process.exit(1);
  }
  const ids: string[] = [];
  for (const [id, block] of defs) {
    doc.blocks[id] = { id, children: [], ...block };
    ids.push(id);
  }
  root.children.splice(at + 1, 0, ...ids);
}

// ---------------------------------------------------------------- 10-structure
{
  const path = `${SEC}/10-structure/doc.json`;
  const doc = load(path);
  removeBlocks(doc, [
    "b-struct-corpus-heading-19",
    "b-struct-corpus-layers-20",
    "b-struct-corpus-folders-21",
  ]);
  insertAfter(doc, "b-struct-intro-1", [
    [
      "b-struct-laidout-heading-27",
      { type: "heading", props: { level: 2 }, text: [t("How it's laid out")] },
    ],
    [
      "b-struct-laidout-tree-28",
      {
        type: "file-tree",
        props: {
          title: "docs",
          entries: [
            { path: "00-foundation", note: "intent — organic; only its parent doc is required" },
            { path: "10-system-design", note: "behavior, by concept, code-agnostic" },
            {
              path: "10-system-design/10-doc-standards",
              note: "a section folder is itself a doc: its parent doc introduces the five children",
            },
            { path: "20-implementation", note: "the current code — mirrors packages/" },
            { path: "20-implementation/10-packages", note: "one doc per workspace package" },
            {
              path: "20-implementation/30-save-pipeline",
              note: "a single doc — one concept covers it",
            },
            {
              path: "20-implementation/40-theming",
              note: "a folder — themes split four ways",
            },
            { path: "20-implementation/99-appendix", note: "operational: setup, tooling, infra" },
          ],
        },
      },
    ],
  ]);
  land(path, doc);
}

// ---------------------------------------------------------------- 20-numbering
{
  const path = `${SEC}/20-numbering/doc.json`;
  const doc = load(path);
  // deviation callout survives; move it to sit after the new tree
  const root = doc.blocks[doc.root];
  root.children = root.children.filter((id: string) => id !== "b-num-corpus-deviation-11");
  removeBlocks(doc, ["b-num-corpus-heading-9", "b-num-corpus-para-10"]);
  insertAfter(doc, "b-num-intro-1", [
    [
      "b-num-laidout-heading-15",
      { type: "heading", props: { level: 2 }, text: [t("How it's laid out")] },
    ],
    [
      "b-num-laidout-tree-16",
      {
        type: "file-tree",
        props: {
          title: "docs",
          entries: [
            { path: "00-foundation", note: "00 — early/foundational slot, used sparingly" },
            {
              path: "10-system-design/10-doc-standards",
              note: "sections gap by ten: 10-, 20-, 30-…",
            },
            {
              path: "10-system-design/10-doc-standards/20-numbering",
              note: "a later insertion lands mid-gap at 25- and nothing renumbers",
            },
            {
              path: "10-system-design/40-block-vocabulary/10-rich-text",
              note: "the named deviation: type pages run 10–17 dense, one family as a unit",
            },
            { path: "20-implementation/99-appendix", note: "99 — appendix and meta only" },
          ],
        },
      },
    ],
  ]);
  const treeAt = root.children.indexOf("b-num-laidout-tree-16");
  root.children.splice(treeAt + 1, 0, "b-num-corpus-deviation-11");
  land(path, doc);
}

// ------------------------------------------------------- 30-cross-doc-linking
{
  const path = `${SEC}/30-cross-doc-linking/doc.json`;
  const doc = load(path);
  const root = doc.blocks[doc.root];
  // mechanism para + decision callout move out of a corpus section;
  // heading is replaced by "How it's laid out" right after the intro.
  removeBlocks(doc, ["b-xlink-corpus-heading-11"]);
  root.children = root.children.filter(
    (id: string) => id !== "b-xlink-mechanism-12" && id !== "b-xlink-decision-13",
  );
  insertAfter(doc, "b-xlink-intro-1", [
    [
      "b-xlink-laidout-heading-17",
      { type: "heading", props: { level: 2 }, text: [t("How it's laid out")] },
    ],
  ]);
  const lh = root.children.indexOf("b-xlink-laidout-heading-17");
  root.children.splice(lh + 1, 0, "b-xlink-mechanism-12");
  insertAfter(doc, "b-xlink-mechanism-12", [
    [
      "b-xlink-laidout-code-18",
      {
        type: "code",
        props: {
          language: "json",
          annotations: [
            {
              lines: "6",
              label: "Tracked target",
              note: "The corpus address the backlinks index tracks; moving the target rewrites it here.",
            },
            {
              lines: "7",
              label: "Prose on both surfaces",
              note: "The markdown render prints the label, so a link label must read as prose.",
            },
          ],
        },
        text: [
          t(
            '{\n  "insert": "the structure standard",\n  "attributes": {\n    "reference": {\n      "kind": "doc",\n      "path": "10-system-design/10-doc-standards/10-structure",\n      "label": "the structure standard"\n    }\n  }\n}',
          ),
        ],
      },
    ],
  ]);
  // decision callout sits after the rule list, before Why
  const wh = root.children.indexOf("b-xlink-why-heading-14");
  root.children.splice(wh, 0, "b-xlink-decision-13");
  land(path, doc);
}

// ------------------------------------------------------------ 40-code-linking
{
  const path = `${SEC}/40-code-linking/doc.json`;
  const doc = load(path);
  const root = doc.blocks[doc.root];
  removeBlocks(doc, ["b-clink-corpus-heading-9", "b-clink-corpus-para-10"]);
  // in-code pointer becomes the doc's closing block
  root.children = root.children.filter((id: string) => id !== "b-clink-incode-14");
  root.children.push("b-clink-incode-14");
  insertAfter(doc, "b-clink-intro-1", [
    [
      "b-clink-laidout-heading-15",
      { type: "heading", props: { level: 2 }, text: [t("How it's laid out")] },
    ],
    [
      "b-clink-laidout-code-16",
      {
        type: "code",
        props: {
          language: "json",
          annotations: [
            {
              lines: "2",
              label: "Full path, checkable",
              note: "A code reference is a code-marked span holding the full path from the repo root — docs links check verifies the file exists.",
            },
          ],
        },
        text: [
          t(
            '{\n  "insert": "packages/docs-viewer/src/render/doc-title.ts",\n  "attributes": { "code": true }\n}',
          ),
        ],
      },
    ],
  ]);
  land(path, doc);
}

// ------------------------------------------------------------ 50-in-code-docs
{
  const path = `${SEC}/50-in-code-docs/doc.json`;
  const doc = load(path);
  const root = doc.blocks[doc.root];
  removeBlocks(doc, ["b-icd-corpus-heading-7", "b-icd-corpus-8"]);
  insertAfter(doc, "b-icd-intro-1", [
    [
      "b-icd-laidout-heading-12",
      { type: "heading", props: { level: 2 }, text: [t("How it's laid out")] },
    ],
    [
      "b-icd-laidout-code-13",
      {
        type: "code",
        props: {
          language: "typescript",
          annotations: [
            {
              lines: "2-6",
              label: "L4 — the file's contract",
              note: "What the file owns and why it lives here, before any code scrolls past.",
            },
            {
              lines: "8",
              label: "L5 — the function's contract",
              note: "A docstring on everything non-obvious: purpose, inputs, outputs, side effects, errors.",
            },
          ],
        },
        text: [
          t(
            '// packages/docs-viewer/src/render/doc-title.ts\n/**\n * The fixed page title shown above every doc: derived from the SAME name\n * the sidebar shows — the bundle folder\'s last segment — so the page and\n * the tree read as one thing. Pure string logic, no React.\n */\n\n/** Words that stay lowercase mid-title (first and last word always cap). */\nconst MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", …]);',
          ),
        ],
      },
    ],
    [
      "b-icd-laidout-oneway-14",
      {
        type: "paragraph",
        props: {},
        text: [
          t("No unit carries doc links: "),
          {
            insert: "code linking",
            attributes: {
              reference: {
                kind: "doc",
                path: "10-system-design/10-doc-standards/40-code-linking",
                label: "code linking",
              },
            },
          },
          t(" is one-way, and the source stays ignorant of the corpus."),
        ],
      },
    ],
  ]);
  land(path, doc);
}

// ------------------------------------------------------------------- overview
{
  const path = `${SEC}/doc.json`;
  const doc = load(path);
  doc.blocks["b-darch-standards-intro-28"].text = [
    t(
      "Five standards, one concern each. Every one shows how things are laid out, states the rule, and defends it.",
    ),
  ];
  land(path, doc);
}

console.log("laid-out reshape complete");
