/**
 * Canonical reference-page restructure for the vocabulary tail pages:
 * 60-interaction-surface, 70-sequence, 80-canvas.
 * Target order: lead / Example / State / Typed actions / Renderers
 * (doc renderer first, then markdown projection) / Agent notes / Theming.
 * - 60: new live interaction-surface Example (file-tree entry ops, real
 *   signatures from packages/docs-model/src/components/file-tree/actions);
 *   "Markdown render" + "In the editor" merge into "Renderers".
 * - 70: heading skeleton added around existing content; the existing live
 *   embed (assets/sequences/login-flow.sequence.json, present on disk)
 *   becomes the Example; missing sections get one-line facts from
 *   sequence/state.ts, sequence/actions/lift.ts, the sequence agent-schema,
 *   the viewer descriptor, and THEME_TOKEN_REGISTRY.
 * - 80: Example is a json props sample (a live block needs an external
 *   canvas document that does not ship with the corpus); "Host rendering
 *   contract" demotes to h3 inside "Renderers".
 * All existing content blocks survive; canonical bytes verified by read-back.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });

const VOCAB_DIR = "docs/10-system-design/40-block-vocabulary";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    fail(`${path} validation failed: ${JSON.stringify(result.issues, null, 2)}`);
  }
  const bytes = serializeDocDocument(result.document);
  writeFileSync(path, bytes);
  // Canonical-bytes read-back: validate + reserialize must be a fixpoint.
  const reread = validateDocDocument(JSON.parse(readFileSync(path, "utf8")));
  if (!reread.ok) fail(`${path} read-back validation failed`);
  if (serializeDocDocument(reread.document) !== bytes) {
    fail(`${path} is not canonical after landing`);
  }
  console.log(`landed ${path}`);
}

type MutableBlock = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  text?: DeltaSpan[];
  children: string[];
};

function addBlock(doc: { blocks: Record<string, MutableBlock> }, block: MutableBlock) {
  if (doc.blocks[block.id]) fail(`block ${block.id} already present`);
  doc.blocks[block.id] = block;
}

function heading(id: string, text: string, level = 2): MutableBlock {
  return { id, type: "heading", props: { level }, text: [t(text)], children: [] };
}

function paragraph(id: string, text: DeltaSpan[]): MutableBlock {
  return { id, type: "paragraph", props: {}, text, children: [] };
}

/** Replaces the leading span of a text block; hard-fails if it drifted. */
function replaceLeadSpan(block: MutableBlock, expected: string, replacement: string) {
  const first = block.text?.[0];
  if (!first || first.insert !== expected) {
    fail(`${block.id} lead span drifted: ${JSON.stringify(first)}`);
  }
  first.insert = replacement;
}

function reorder(doc: { root: string; blocks: Record<string, MutableBlock> }, order: string[]) {
  const root = doc.blocks[doc.root];
  // Children absent from the order are only allowed when their block was
  // deliberately deleted from the block map (the merged-away headings).
  const dropped = root.children.filter((id) => !order.includes(id) && doc.blocks[id]);
  if (dropped.length > 0) fail(`reorder drops children: ${dropped.join(", ")}`);
  for (const id of order) {
    if (!doc.blocks[id]) fail(`reorder references missing block ${id}`);
  }
  root.children = order;
}

// ---------------------------------------------------------------------------
// A. 60-interaction-surface
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB_DIR}/60-interaction-surface/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const P = "b-22-interaction-surface";

  // Example: a live surface carrying two real file-tree operations, params
  // and descriptions matching packages/docs-model/src/components/file-tree/actions.
  addBlock(doc, heading(`${P}-example-h`, "Example"));
  addBlock(
    doc,
    paragraph(`${P}-example-intro`, [
      t("A live surface — two of the "),
      c("file-tree"),
      t(" block's entry operations, described params rendering as note lines:"),
    ]),
  );
  addBlock(doc, {
    id: `${P}-example-block`,
    type: "interaction-surface",
    props: {
      title: "file-tree — entry operations",
      operations: [
        {
          name: "file-tree.addEntry",
          description: "Append a path entry (optional note and change marker) to the file tree.",
          params: [
            {
              name: "path",
              type: "string",
              required: true,
              description: '/-separated path, no leading "./"; a trailing "/" marks an explicit directory.',
            },
            {
              name: "note",
              type: "string",
              required: false,
              description: "Short annotation rendered after the path.",
            },
            {
              name: "change",
              type: '"added" | "removed" | "modified" | "renamed"',
              required: false,
              description: "Change marker rendered as a badge.",
            },
          ],
          returns: "props patch: { entries }",
        },
        {
          name: "file-tree.removeEntry",
          description: "Remove the entry with the given path from the file tree.",
          params: [
            {
              name: "path",
              type: "string",
              required: true,
              description: "Exact path of the entry to remove.",
            },
          ],
          returns: "props patch: { entries }",
        },
      ],
    },
    children: [],
  });

  // Renderers: rename the markdown heading, fold the editor paragraph in
  // (doc renderer first), drop the now-empty "In the editor" heading.
  doc.blocks[`${P}-proj-h-7`].text = [t("Renderers")];
  replaceLeadSpan(
    doc.blocks[`${P}-editor-14`],
    "A non-editable atom leaf node rendered by ",
    "In the editor, a non-editable atom leaf node rendered by ",
  );
  replaceLeadSpan(
    doc.blocks[`${P}-proj-8`],
    "An optional ",
    "The markdown projection: an optional ",
  );
  const editorHeading = doc.blocks[`${P}-editor-h-13`];
  if (editorHeading?.type !== "heading") fail("interaction-surface editor heading missing");
  delete doc.blocks[`${P}-editor-h-13`];

  reorder(doc, [
    `${P}-lead-2`,
    `${P}-example-h`,
    `${P}-example-intro`,
    `${P}-example-block`,
    `${P}-state-h-3`,
    `${P}-shape-4`,
    `${P}-state-note-6`,
    `${P}-actions-h-10`,
    `${P}-actions-note-11`,
    `${P}-actions-12`,
    `${P}-proj-h-7`,
    `${P}-editor-14`,
    `${P}-proj-8`,
    `${P}-proj-example-9`,
    `${P}-agent-h-15`,
    `${P}-agent-1-16`,
    `${P}-agent-2-17`,
    `${P}-theming-heading`,
    `${P}-theming-para`,
    `${P}-theming-table`,
  ]);

  land(path, doc);
}

// ---------------------------------------------------------------------------
// B. 70-sequence
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB_DIR}/70-sequence/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const P = "b-23-sequence";

  // Example: the existing live embed (its sidecar exists on disk at
  // docs/assets/sequences/login-flow.sequence.json) plus the matching program.
  const embed = doc.blocks[`${P}-embed-8`];
  if (embed?.type !== "sequence" || embed.props.src !== "assets/sequences/login-flow.sequence.json") {
    fail("sequence embed block drifted");
  }
  addBlock(doc, heading(`${P}-example-h`, "Example"));
  addBlock(
    doc,
    paragraph(`${P}-example-intro`, [
      t("A live block — the login flow from "),
      c("assets/sequences/login-flow.sequence.json"),
      t(" — followed by the agent-facing program projection of the same document:"),
    ]),
  );

  // Missing sections: one-line facts from disk truth.
  addBlock(doc, heading(`${P}-state-h`, "State"));
  addBlock(
    doc,
    paragraph(`${P}-state-note`, [
      t("Three optional props — "),
      c("sequenceId"),
      t(", "),
      c("src"),
      t(", "),
      c("title"),
      t(" — and no text ("),
      c("carriesText: false"),
      t("); participants and messages live in the referenced "),
      c("SequenceDocument"),
      t(", never in block state."),
    ]),
  );

  addBlock(doc, heading(`${P}-actions-h`, "Typed actions (forwarded)"));
  addBlock(
    doc,
    paragraph(`${P}-actions-note`, [
      t("Three actions — "),
      c("sequence.setProgram"),
      t(", "),
      c("sequence.setStyle"),
      t(", "),
      c("sequence.setTitle"),
      t(" — lifted at module load from "),
      c("SEQUENCE_AGENT_PATCH_OPERATIONS"),
      t(" in "),
      c("@codecaine-ai/sequence/agent-schema"),
      t(" and carrying "),
      c('forward: { authority: "sequence" }'),
      t(" instead of a local "),
      c("apply"),
      t("."),
    ]),
  );

  addBlock(doc, heading(`${P}-renderers-h`, "Renderers"));
  addBlock(
    doc,
    paragraph(`${P}-renderers-note`, [
      t("In the doc renderer the block fills through the host's "),
      c("renderSequence"),
      t(" slot (a placeholder card names the source otherwise); the markdown projection is a comment line — "),
      c('<!-- sequence: <src-or-sequenceId> [title="<title>"] -->'),
      t(", or "),
      c("<!-- sequence: (missing src) -->"),
      t(" when no source is set."),
    ]),
  );

  addBlock(doc, heading(`${P}-agent-h`, "Agent notes"));

  addBlock(doc, heading(`${P}-theming-h`, "Theming"));
  addBlock(
    doc,
    paragraph(`${P}-theming-note`, [
      t("No theme component yet — "),
      c("THEME_TOKEN_REGISTRY"),
      t(" carries no sequence entry; the viewer placeholder reads "),
      c("--docs-sequence-border"),
      t(" with a "),
      c("--border"),
      t(" fallback."),
    ]),
  );

  reorder(doc, [
    `${P}-lead-2`,
    `${P}-callout-3`,
    `${P}-example-h`,
    `${P}-example-intro`,
    `${P}-embed-8`,
    `${P}-program-4`,
    `${P}-state-h`,
    `${P}-state-note`,
    `${P}-actions-h`,
    `${P}-actions-note`,
    `${P}-renderers-h`,
    `${P}-renderers-note`,
    `${P}-studio-7`,
    `${P}-agent-h`,
    `${P}-lang-5`,
    `${P}-program-6`,
    `${P}-theming-h`,
    `${P}-theming-note`,
  ]);

  land(path, doc);
}

// ---------------------------------------------------------------------------
// C. 80-canvas
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB_DIR}/80-canvas/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const P = "b-24-canvas";

  // Example: a props sample, not a live block — the block only references a
  // canvas document in the external canvas system, and none ships with the
  // corpus, so a live example would point at nothing.
  addBlock(doc, heading(`${P}-example-h`, "Example"));
  addBlock(
    doc,
    paragraph(`${P}-example-intro`, [
      t(
        "The block is only a reference into the external canvas system, and no canvas document ships with this corpus — so a props sample stands in for a live block:",
      ),
    ]),
  );
  addBlock(doc, {
    id: `${P}-example-code`,
    type: "code",
    props: { language: "json" },
    text: [
      t('{\n  "canvasId": "docs-architecture",\n  "view": "save-pipeline",\n  "title": "Save pipeline"\n}'),
    ],
    children: [],
  });

  // Renderers: rename the markdown heading, fold the editor paragraph and the
  // host rendering contract (demoted to h3) in, markdown projection last.
  doc.blocks[`${P}-proj-h-6`].text = [t("Renderers")];
  replaceLeadSpan(doc.blocks[`${P}-editor-12`], "Slash menu: ", "In the editor — slash menu: ");
  replaceLeadSpan(
    doc.blocks[`${P}-proj-7`],
    "An HTML-comment reference line — ",
    "The markdown projection is an HTML-comment reference line — ",
  );
  const renderingHeading = doc.blocks[`${P}-rendering-heading`];
  if (renderingHeading?.type !== "heading") fail("canvas rendering heading missing");
  renderingHeading.props = { level: 3 };
  const canvasEditorHeading = doc.blocks[`${P}-editor-h-11`];
  if (canvasEditorHeading?.type !== "heading") fail("canvas editor heading missing");
  delete doc.blocks[`${P}-editor-h-11`];

  reorder(doc, [
    `${P}-lead-2`,
    `${P}-example-h`,
    `${P}-example-intro`,
    `${P}-example-code`,
    `${P}-state-h-3`,
    `${P}-state-4`,
    `${P}-state-note-5`,
    `${P}-actions-h-8`,
    `${P}-actions-note-9`,
    `${P}-actions-10`,
    `${P}-proj-h-6`,
    `${P}-editor-12`,
    `${P}-rendering-heading`,
    `${P}-rendering-inline`,
    `${P}-rendering-expanded`,
    `${P}-rendering-edit`,
    `${P}-rendering-portable`,
    `${P}-proj-7`,
    `${P}-agent-h-13`,
    `${P}-agent-1-14`,
    `${P}-agent-2-15`,
    `${P}-theming-heading`,
    `${P}-theming-para`,
    `${P}-theming-table`,
  ]);

  land(path, doc);
}

console.log("vocab tail restructure complete");
