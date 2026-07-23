/**
 * docs-dogfood-review (Ford, 2026-07-22): targeted enhancement pass over the
 * four tail family pages of 40-block-vocabulary.
 * - 60-interaction-surface: add a valid JSON example instance to the State
 *   Schema state-shape block (real props of the file-tree example above it).
 * - 80-canvas: copy the translation-layer canvas sidecar into this bundle's
 *   assets, add an Example H2 with a live canvas embed; convert the State
 *   Schema structured-table + annotated JSON into a live state-shape block
 *   (annotations folded into field descriptions).
 * - All four: theme-link role split (contract sentence ->
 *   30-data-model/20-block-design/50-theming, where-files-live ->
 *   20-implementation/40-theming span "Theming") and count-phrasing sweep
 *   (drop maintained numbers: seven-op / seventh op / one-of-N-entries).
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const VOCAB = "docs/10-system-design/40-block-vocabulary";
const CANVAS_SIDECAR_REL = "assets/canvases/interaction-surfaces.canvas.json";

function loadDoc(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveCanonical(path: string, doc: any): void {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(path, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  const bytes = readFileSync(path, "utf8");
  const revalidated = validateDocDocument(JSON.parse(bytes));
  if (!revalidated.ok || serializeDocDocument(revalidated.document) !== bytes) {
    console.error("NOT CANONICAL after write:", path);
    process.exit(1);
  }
  console.log("ok — canonical:", path);
}

function replaceInsert(block: any, from: string, to: string): void {
  const entry = (block.text ?? []).find((e: any) => e.insert === from);
  if (!entry) throw new Error(`insert not found in ${block.id}: ${JSON.stringify(from)}`);
  entry.insert = to;
}

const docRef = (path: string) => ({ reference: { kind: "doc", path } });
const CONTRACT_THEMING = "10-system-design/30-data-model/20-block-design/50-theming";
const IMPL_THEMING = "20-implementation/40-theming";

// ---------------------------------------------------------------------------
// 0. Copy the canvas sidecar the translation-layer overview embeds into the
//    80-canvas bundle (same relative layout, byte-identical copy).
// ---------------------------------------------------------------------------
mkdirSync(`${VOCAB}/80-canvas/assets/canvases`, { recursive: true });
copyFileSync(
  `docs/10-system-design/20-translation-layer/${CANVAS_SIDECAR_REL}`,
  `${VOCAB}/80-canvas/${CANVAS_SIDECAR_REL}`,
);
console.log("ok — sidecar copied into 80-canvas/assets/canvases/");

// ---------------------------------------------------------------------------
// 1. 50-state-shape: theme-link span + count phrasing. The State Schema
//    state-shape block already mirrors state.ts exactly (verified by hand);
//    untouched.
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB}/50-state-shape/doc.json`;
  const doc = loadDoc(path);
  const b = doc.blocks;

  // Where-files-live link keeps its target; span text becomes "Theming".
  const span = b["b-25-state-shape-theming-para"].text.find(
    (e: any) => e.insert === "Theming: overview" && e.attributes?.reference?.path === IMPL_THEMING,
  );
  if (!span) throw new Error("50: implementation Theming span not found");
  span.insert = "Theming";

  // Drop the maintained op count.
  replaceInsert(
    b["b-25-state-shape-adapter-p1"],
    " ops in the seven-op doc vocabulary (",
    " ops in the doc-op vocabulary (",
  );

  saveCanonical(path, doc);
}

// ---------------------------------------------------------------------------
// 2. 60-interaction-surface: example instance on the State Schema block,
//    contract-fulfillment theme link, count phrasing.
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB}/60-interaction-surface/doc.json`;
  const doc = loadDoc(path);
  const b = doc.blocks;

  // A valid InteractionSurfaceState instance: the real props of the page's
  // own live example, trimmed to one operation.
  b["b-22-interaction-surface-shape-4"].props.example = JSON.stringify(
    {
      title: "file-tree — entry operations",
      operations: [
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
    null,
    2,
  );

  // Theme paragraph: contract link (50-theming) + where-files-live link
  // (20-implementation/40-theming), mirroring the 50-state-shape structure.
  b["b-22-interaction-surface-theming-para"].text = [
    { insert: "The " },
    { insert: "Theming", attributes: docRef(CONTRACT_THEMING) },
    { insert: " contract element: theme file " },
    { insert: "components/interaction-surface.json", attributes: { code: true } },
    { insert: " in a theme folder (" },
    { insert: "themes/<id>/", attributes: { code: true } },
    { insert: "; system docs at " },
    { insert: "Theming", attributes: docRef(IMPL_THEMING) },
    { insert: "). Every value is one string for both modes or a " },
    { insert: "{ light, dark }", attributes: { code: true } },
    { insert: " pair, validated against " },
    { insert: "THEME_TOKEN_REGISTRY", attributes: { code: true } },
    { insert: " (" },
    {
      insert: "packages/docs-workbench/web/src/theme/theme-folders.ts",
      attributes: {
        code: true,
        reference: { kind: "source", path: "packages/docs-workbench/web/src/theme/theme-folders.ts" },
      },
    },
    { insert: ")." },
  ];

  // Drop the maintained op ordinal.
  replaceInsert(
    b["b-22-is-fam-adapter-p2"],
    " — the seventh op beside ",
    " — the doc op beside ",
  );

  saveCanonical(path, doc);
}

// ---------------------------------------------------------------------------
// 3. 70-sequence: State Schema block verified against state.ts (untouched);
//    add the where-files-live theme link; count phrasing.
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB}/70-sequence/doc.json`;
  const doc = loadDoc(path);
  const b = doc.blocks;

  const intro = b["b-seqfam-theme-intro"];
  const idx = intro.text.findIndex((e: any) => e.insert === "components/sequence.json");
  if (idx === -1) throw new Error("70: components/sequence.json span not found");
  intro.text.splice(
    idx + 1,
    0,
    { insert: " (theme folders: " },
    { insert: "Theming", attributes: docRef(IMPL_THEMING) },
    { insert: ")" },
  );

  // Drop the maintained authority count.
  replaceInsert(
    b["b-seqfam-adapter-li-authority-1"],
    " is one of the two entries in the model's ",
    " is a registered entry in the model's ",
  );

  saveCanonical(path, doc);
}

// ---------------------------------------------------------------------------
// 4. 80-canvas: Example section with a live embed; State Schema table ->
//    live state-shape block; theme-link role split; count phrasing.
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB}/80-canvas/doc.json`;
  const doc = loadDoc(path);
  const b = doc.blocks;
  const root = b[doc.root];

  // Example section right after the two lead paragraphs.
  b["b-24-canvas-ex-h"] = {
    id: "b-24-canvas-ex-h",
    type: "heading",
    props: { level: 2 },
    text: [{ insert: "Example" }],
    children: [],
  };
  b["b-24-canvas-ex-intro"] = {
    id: "b-24-canvas-ex-intro",
    type: "paragraph",
    props: {},
    text: [
      { insert: "A live embed. The sidecar (" },
      { insert: "./assets/canvases/interaction-surfaces.canvas.json", attributes: { code: true } },
      { insert: ") is a bundle-local copy of the canvas embedded on " },
      { insert: "Translation layer", attributes: docRef("10-system-design/20-translation-layer") },
      { insert: "; " },
      { insert: "view", attributes: { code: true } },
      { insert: " crops it to the " },
      { insert: "one-state-two-readers", attributes: { code: true } },
      { insert: " section:" },
    ],
    children: [],
  };
  b["b-24-canvas-ex-embed"] = {
    id: "b-24-canvas-ex-embed",
    type: "canvas",
    props: {
      src: "./assets/canvases/interaction-surfaces.canvas.json",
      title: "One state, two readers",
      view: "one-state-two-readers",
    },
    children: [],
  };

  // State Schema: live state-shape block replaces the structured table; the
  // annotated JSON block's notes fold into field descriptions, and its JSON
  // becomes the example pane (the real translation-layer embed props).
  b["b-24-canvas-state-shape"] = {
    id: "b-24-canvas-state-shape",
    type: "state-shape",
    props: {
      name: "CanvasState",
      source: { path: "packages/docs-model/src/components/canvas/state.ts", symbol: "CanvasState" },
      fields: [
        {
          name: "canvasId",
          type: "string (min length 1)",
          required: false,
          description:
            "Central canvas identity in the canvas system; the docs server cannot route it, so a canvasId-only embed renders an unavailable card.",
        },
        {
          name: "src",
          type: "string (min length 1)",
          required: false,
          description:
            "Sidecar path to a .canvas.json in the docs tree; a ./ prefix resolves against the doc bundle's own assets. The form the server loads and edits.",
        },
        {
          name: "view",
          type: "string",
          required: false,
          description: "Stable id of the named container or section the inline viewer crops to.",
        },
        {
          name: "title",
          type: "string",
          required: false,
          description: "Display title; overrides the canvas document's own title in the embed.",
        },
      ],
      example:
        '{\n  "src": "./assets/canvases/interaction-surfaces.canvas.json",\n  "view": "one-state-two-readers",\n  "title": "One state, two readers"\n}',
    },
    children: [],
  };

  const leadIdx = root.children.indexOf("b-24-canvas-lead-adapter");
  if (leadIdx === -1) throw new Error("80: lead-adapter not found in root children");
  root.children.splice(leadIdx + 1, 0, "b-24-canvas-ex-h", "b-24-canvas-ex-intro", "b-24-canvas-ex-embed");
  root.children = root.children
    .map((id: string) => (id === "b-24-canvas-state-4" ? "b-24-canvas-state-shape" : id))
    .filter((id: string) => id !== "b-24-canvas-example-intro" && id !== "b-24-canvas-example-code");
  delete b["b-24-canvas-state-4"];
  delete b["b-24-canvas-example-intro"];
  delete b["b-24-canvas-example-code"];

  // Theme paragraph: contract link + where-files-live link.
  b["b-24-canvas-theming-para"].text = [
    { insert: "The " },
    { insert: "Theming", attributes: docRef(CONTRACT_THEMING) },
    { insert: " contract element at its smallest — one registered token: " },
    { insert: "components/canvas.json", attributes: { code: true } },
    { insert: " in a theme folder (" },
    { insert: "themes/<id>/", attributes: { code: true } },
    { insert: "; system docs at " },
    { insert: "Theming", attributes: docRef(IMPL_THEMING) },
    { insert: ") may set " },
    { insert: "border", attributes: { code: true } },
    { insert: ", as one string for both modes or a " },
    { insert: "{ light, dark }", attributes: { code: true } },
    { insert: " pair, validated against " },
    {
      insert: "THEME_TOKEN_REGISTRY",
      attributes: {
        code: true,
        reference: { kind: "source", path: "packages/docs-workbench/web/src/theme/theme-folders.ts" },
      },
    },
    { insert: "." },
  ];

  // Drop the maintained authority count.
  replaceInsert(
    b["b-24-canvas-agent-2-15"],
    " is one of two entries in the model's ",
    " is a registered entry in the model's ",
  );

  saveCanonical(path, doc);
}

console.log("done — four family pages enhanced");
