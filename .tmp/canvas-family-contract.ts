/**
 * Conform 40-block-vocabulary/80-canvas to the six-H2 contract skeleton
 * (Ford's 2026-07-21 interview): lead paragraphs, then State Schema /
 * Typed Actions / Doc Renderer / Agent Renderer / Theme / Agent Adapter.
 *
 * Fact fixes vs code:
 *  - agent view emits "(missing src)", not "(missing source)" (agent-view.ts);
 *    src wins over canvasId when both are set.
 *  - KNOWN_AUTHORITIES is ["canvas", "sequence"] (checks.ts) — "single entry"
 *    claim was stale.
 *  - No SVG preview endpoint or /embed/:id route exists; the workbench embed
 *    is an inert InteractiveCanvasViewer inline + an in-app full-screen
 *    portal dialog (CanvasEmbed.tsx). Host Rendering Contract content is
 *    reconciled into Doc Renderer, corrected to present state.
 *  - The invented canvasId example is replaced by the real live embed props
 *    from 20-translation-layer (src sidecar); the server cannot route
 *    central canvasId references (store.ts).
 *  - Theme token's real consumer is the missing-embed placeholder border;
 *    no built-in theme ships components/canvas.json.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const PATH = "docs/10-system-design/40-block-vocabulary/80-canvas/doc.json";

// Every source path referenced from the page must exist on disk.
const SOURCE_PATHS = [
  "external/canvas",
  "external/canvas/packages/canvas/src/agent-schema.ts",
  "packages/docs-model/src/components/canvas/state.ts",
  "packages/docs-model/src/components/canvas/actions/lift.ts",
  "packages/docs-model/src/components/canvas/agent-view.ts",
  "packages/docs-model/src/doc-ops.ts",
  "packages/docs-model/src/components/checks.ts",
  "packages/docs-viewer/src/components/canvas/descriptor.tsx",
  "packages/docs-viewer/src/editor/views/node-views.tsx",
  "packages/docs-workbench/web/src/pages/CanvasEmbed.tsx",
  "packages/docs-workbench/web/src/theme/theme-folders.ts",
  "packages/docs-workbench/web/src/theme/semantic.css",
  "packages/docs-server/src/routes.ts",
  "packages/docs-server/src/store.ts",
  "packages/docs-server/src/agent-tools.ts",
  "themes/default",
];
for (const p of SOURCE_PATHS) {
  if (!existsSync(p)) throw new Error(`source ref path missing on disk: ${p}`);
}

const src = (path: string) => ({ code: true, reference: { kind: "source", path } });
const docref = (path: string) => ({ reference: { kind: "doc", path } });
const code = { code: true };

const doc = JSON.parse(readFileSync(PATH, "utf8"));
const blocks = doc.blocks as Record<string, any>;
const root = blocks[doc.root];

const para = (id: string, text: any[]) => {
  blocks[id] = { id, type: "paragraph", props: {}, text, children: [] };
};
const h2 = (id: string, text: string) => {
  blocks[id] = { id, type: "heading", props: { level: 2 }, text: [{ insert: text }], children: [] };
};
const li = (id: string, text: any[], children: string[] = []) => {
  blocks[id] = { id, type: "list-item", props: { ordered: false }, text, children };
};

// ---------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------
blocks["b-24-canvas-lead-2"].text = [
  { insert: "The spatial-canvas family of the " },
  { insert: "Block vocabulary", attributes: docref("10-system-design/40-block-vocabulary") },
  { insert: ". It owns one type, " },
  { insert: "canvas", attributes: code },
  {
    insert:
      ". The block itself is only a reference — the canvas document, its objects, and its schema live in the external canvas system (",
  },
  { insert: "external/canvas", attributes: src("external/canvas") },
  {
    insert:
      ", the vendored sibling project); the doc block points at one canvas and optionally crops it to a named view.",
  },
];
para("b-24-canvas-lead-adapter", [
  { insert: "The family is the vocabulary's flagship non-default " },
  {
    insert: "Agent adapter",
    attributes: docref("10-system-design/30-data-model/20-block-design/60-agent-adapter"),
  },
  {
    insert:
      " case: the canvas project is the authority, schema truth stays in the canvas package, and every content action forwards there instead of patching doc props.",
  },
]);

// ---------------------------------------------------------------------------
// State Schema
// ---------------------------------------------------------------------------
blocks["b-24-canvas-state-h-3"].text = [{ insert: "State Schema" }];
para("b-24-canvas-state-intro", [
  { insert: "The props (" },
  { insert: "state.ts", attributes: src("packages/docs-model/src/components/canvas/state.ts") },
  { insert: ") are a closed schema — " },
  { insert: "additionalProperties: false", attributes: code },
  { insert: ", every prop optional:" },
]);
blocks["b-24-canvas-state-4"].props.rows = [
  [
    "canvasId",
    "string (min length 1)",
    "no",
    "Central canvas identity in the canvas system; the docs server cannot route it, so embeds render an unavailable card.",
  ],
  [
    "src",
    "string (min length 1)",
    "no",
    "Sidecar path — a .canvas.json in the docs tree, resolved relative to the doc bundle; the form the server loads and edits.",
  ],
  ["view", "string", "no", "Named container or section to crop the viewer to."],
  ["title", "string", "no", "Display title; overrides the canvas document's own title in the embed."],
];
blocks["b-24-canvas-state-note-5"].text = [
  { insert: "No text (" },
  { insert: "carriesText: false", attributes: code },
  {
    insert:
      "); all state lives in the four props. A block with neither source prop is valid — the doc renderer shows a missing-source placeholder.",
  },
];
blocks["b-24-canvas-example-intro"].text = [
  { insert: "The corpus's one live embed, on " },
  { insert: "Translation layer", attributes: docref("10-system-design/20-translation-layer") },
  { insert: ", carries:" },
];
const example = blocks["b-24-canvas-example-code"];
example.text = [
  {
    insert:
      '{\n  "src": "./assets/canvases/interaction-surfaces.canvas.json",\n  "view": "one-state-two-readers",\n  "title": "One state, two readers"\n}',
  },
];
example.props = {
  language: "json",
  annotations: [
    {
      lines: "2",
      label: "Sidecar reference",
      note: "Bundle-relative path; the renderer canonicalizes it against the bundle's own assets copy before loading.",
    },
    { lines: "3", label: "View crop", note: "Stable id of the section the inline viewer fits to." },
    { lines: "4", label: "Title override", note: "Replaces the canvas document's own title in the embed." },
  ],
};

// ---------------------------------------------------------------------------
// Typed Actions
// ---------------------------------------------------------------------------
blocks["b-24-canvas-actions-h-8"].text = [{ insert: "Typed Actions" }];
blocks["b-24-canvas-actions-note-9"].text = [
  { insert: "The family's five actions are lifted at module load from " },
  { insert: "CANVAS_AGENT_PATCH_OPERATIONS", attributes: code },
  { insert: " in " },
  {
    insert: "@codecaine-ai/canvas/agent-schema",
    attributes: src("external/canvas/packages/canvas/src/agent-schema.ts"),
  },
  {
    insert:
      " — docs-model reuses the canvas package's schemas and descriptions, and never redefines them.",
  },
];
li(
  "b-24-canvas-lift-li-1",
  [{ insert: "lift.ts", attributes: src("packages/docs-model/src/components/canvas/actions/lift.ts") }],
  ["b-24-canvas-lift-li-1a", "b-24-canvas-lift-li-1b", "b-24-canvas-lift-li-1c"],
);
li("b-24-canvas-lift-li-1a", [
  { insert: "Maps each descriptor to a " },
  { insert: "canvas.<type>", attributes: code },
  { insert: " action on the " },
  { insert: "canvas", attributes: code },
  { insert: " block type." },
]);
li("b-24-canvas-lift-li-1b", [
  { insert: 'Type.Omit(descriptor.params, ["type"])', attributes: code },
  {
    insert:
      " strips only the wire envelope's discriminant; every param schema is otherwise the canvas package's own.",
  },
]);
li("b-24-canvas-lift-li-1c", [
  { insert: "Attaches " },
  { insert: 'forward: { authority: "canvas" }', attributes: code },
  { insert: " in place of a local " },
  { insert: "apply", attributes: code },
  { insert: "." },
]);
li("b-24-canvas-lift-li-2", [{ insert: "No local apply" }], ["b-24-canvas-lift-li-2a"]);
li("b-24-canvas-lift-li-2a", [
  {
    insert:
      "The dispatcher validates params against the lifted TypeBox schema, then refuses to run the action as a doc op — it is handled by the canvas authority (",
  },
  { insert: "doc-ops.ts", attributes: src("packages/docs-model/src/doc-ops.ts") },
  { insert: "). Doc props never change." },
]);

// ---------------------------------------------------------------------------
// Doc Renderer (Host Rendering Contract content reconciled here, corrected)
// ---------------------------------------------------------------------------
blocks["b-24-canvas-proj-h-6"].text = [{ insert: "Doc Renderer" }];
para("b-24-canvas-slot-para", [
  { insert: "docs-viewer owns the descriptor (" },
  { insert: "descriptor.tsx", attributes: src("packages/docs-viewer/src/components/canvas/descriptor.tsx") },
  { insert: ") but not the pixels: the render calls the host-injected canvas slot — DocsClientProvider's " },
  { insert: "canvasEmbed", attributes: code },
  { insert: " component — with " },
  { insert: "{ id, canvasId, src, view, title }", attributes: code },
  {
    insert:
      ". A host with no canvas renderer gets the neutral Canvas embed unavailable card, so the seam ports to any React host.",
  },
]);
para("b-24-canvas-embed-para", [
  { insert: "The workbench wires " },
  { insert: "StandaloneCanvasEmbed", attributes: code },
  { insert: " (" },
  { insert: "CanvasEmbed.tsx", attributes: src("packages/docs-workbench/web/src/pages/CanvasEmbed.tsx") },
  { insert: ") into the slot — a read-only embed:" },
]);
const inline = blocks["b-24-canvas-rendering-inline"];
inline.text = [{ insert: "Inline surface" }];
inline.children = ["b-24-canvas-inline-a", "b-24-canvas-inline-b", "b-24-canvas-inline-c"];
li("b-24-canvas-inline-a", [
  { insert: "An inert " },
  { insert: "InteractiveCanvasViewer", attributes: code },
  { insert: " renders the real canvas; drag, pan, and wheel zoom are not captured." },
]);
li("b-24-canvas-inline-b", [
  { insert: "view", attributes: code },
  {
    insert:
      " fits the viewport to the named container or section's bounds; an unknown id shows a View not found notice.",
  },
]);
li("b-24-canvas-inline-c", [
  { insert: "A host that passes " },
  { insert: "onObjectSelect", attributes: code },
  {
    insert:
      " keeps the inline viewer interactive instead, so canvas objects stay selectable for annotation targeting.",
  },
]);
li("b-24-canvas-overlay-li", [{ insert: "Overlay controls" }], [
  "b-24-canvas-overlay-a",
  "b-24-canvas-overlay-b",
]);
li("b-24-canvas-overlay-a", [
  { insert: "Hover or keyboard focus reveals a full-screen button in the top-right corner." },
]);
li("b-24-canvas-overlay-b", [
  { insert: "Edit in Canvas appears beside it only when the host passes " },
  { insert: "showEditAction", attributes: code },
  { insert: " — doc edit mode does." },
]);
const expanded = blocks["b-24-canvas-rendering-expanded"];
expanded.text = [{ insert: "Full-screen viewer" }];
expanded.children = ["b-24-canvas-fullscreen-a", "b-24-canvas-fullscreen-b"];
li("b-24-canvas-fullscreen-a", [
  {
    insert:
      "Clicking the inline surface or the button opens a same-window dialog with an interactive viewer; pan and zoom live here, canvas mutation does not.",
  },
]);
li("b-24-canvas-fullscreen-b", [
  {
    insert:
      "Escape or the close action restores the surrounding document in place; body scroll locks while it is open.",
  },
]);
const edit = blocks["b-24-canvas-rendering-edit"];
edit.text = [{ insert: "Editor handoff" }];
edit.children = ["b-24-canvas-edit-a"];
li("b-24-canvas-edit-a", [
  { insert: "Edit in Canvas opens Canvas Studio in a new tab, deep-linked to the sidecar (" },
  { insert: "?src=<sidecar>", attributes: code },
  {
    insert:
      "), so changing the canvas never discards the reader's document position or unsaved doc state.",
  },
]);
const sources = blocks["b-24-canvas-rendering-portable"];
sources.text = [{ insert: "Source resolution" }];
sources.children = ["b-24-canvas-src-a", "b-24-canvas-src-b", "b-24-canvas-src-c"];
li("b-24-canvas-src-a", [
  { insert: "src", attributes: code },
  { insert: " loads a " },
  { insert: ".canvas.json", attributes: code },
  { insert: " sidecar through the canvas data layer and validates it with " },
  { insert: "validateInteractiveCanvasDocument", attributes: code },
  { insert: " before rendering." },
]);
li("b-24-canvas-src-b", [
  { insert: 'canvasId: "synthetic"', attributes: code },
  { insert: " renders the canvas package's bundled fixture." },
]);
li("b-24-canvas-src-c", [
  { insert: "Any other " },
  { insert: "canvasId", attributes: code },
  {
    insert:
      " renders an honest unavailable card with an Open Canvas Studio link — central boards are not stored in the docs repo.",
  },
]);
blocks["b-24-canvas-editor-12"].text = [
  { insert: "In the editor — slash menu: " },
  { insert: "Canvas", attributes: { bold: true } },
  {
    insert:
      " (aliases: diagram, drawing). The block is a non-editable atom leaf: its node view rebuilds the ",
  },
  { insert: "DocBlock", attributes: code },
  { insert: " and calls the same descriptor render the read surface uses (" },
  { insert: "node-views.tsx", attributes: src("packages/docs-viewer/src/editor/views/node-views.tsx") },
  {
    insert:
      "), so the block looks identical in view and edit mode; edit mode's embed adds the Edit in Canvas action.",
  },
];

// ---------------------------------------------------------------------------
// Agent Renderer
// ---------------------------------------------------------------------------
blocks["b-24-canvas-agent-h-13"].text = [{ insert: "Agent Renderer" }];
blocks["b-24-canvas-proj-7"].text = [
  { insert: "The agent view is one HTML-comment reference line — " },
  {
    insert: '<!-- canvas: <src-or-canvasId> [view=<view>] [title="<title>"] -->',
    attributes: code,
  },
  { insert: ", or " },
  { insert: "<!-- canvas: (missing src) -->", attributes: code },
  { insert: " when neither source prop is set; " },
  { insert: "src", attributes: code },
  { insert: " wins when both are present (" },
  { insert: "agent-view.ts", attributes: src("packages/docs-model/src/components/canvas/agent-view.ts") },
  {
    insert:
      "). Chosen over a markdown image because a canvas is not an image asset; the comment form greps cleanly on ",
  },
  { insert: "<!-- canvas:", attributes: code },
  { insert: " without being misread as a broken image link." },
];

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
blocks["b-24-canvas-theming-heading"].text = [{ insert: "Theme" }];
blocks["b-24-canvas-theming-para"].text = [
  { insert: "The theme surface is one registered token: " },
  { insert: "components/canvas.json", attributes: code },
  { insert: " in a theme folder (" },
  { insert: "themes/<id>/", attributes: code },
  { insert: ") may set " },
  { insert: "border", attributes: code },
  { insert: ", as one string for both modes or a " },
  { insert: "{ light, dark }", attributes: code },
  { insert: " pair, validated against " },
  {
    insert: "THEME_TOKEN_REGISTRY",
    attributes: src("packages/docs-workbench/web/src/theme/theme-folders.ts"),
  },
  { insert: " (see " },
  { insert: "Theming: overview", attributes: docref("20-implementation/40-theming") },
  { insert: ")." },
];
blocks["b-24-canvas-theming-table"].props.rows = [
  ["border", "--docs-canvas-border", "Missing-embed placeholder border"],
];
para("b-24-canvas-theming-note", [
  { insert: "The token's CSS default is " },
  { insert: "var(--border)", attributes: code },
  { insert: " (" },
  { insert: "semantic.css", attributes: src("packages/docs-workbench/web/src/theme/semantic.css") },
  {
    insert:
      "), and its one consumer is the doc renderer's missing-embed placeholder. The embedded canvas surface styles itself — the canvas package owns its own theme — and no built-in theme ships a ",
  },
  { insert: "components/canvas.json", attributes: code },
  { insert: " (" },
  { insert: "themes/default", attributes: src("themes/default") },
  { insert: " carries code, structured-table, and surfaces files only)." },
]);

// ---------------------------------------------------------------------------
// Agent Adapter
// ---------------------------------------------------------------------------
h2("b-24-canvas-adapter-h", "Agent Adapter");
para("b-24-canvas-adapter-lead", [
  { insert: "How agents edit canvas content — the vocabulary's flagship non-default instance of the " },
  {
    insert: "Agent adapter",
    attributes: docref("10-system-design/30-data-model/20-block-design/60-agent-adapter"),
  },
  {
    insert:
      " contract. The external canvas project is the authority: the docs system forwards actions to it and applies nothing locally. The forwarding path exists end to end:",
  },
]);
li("b-24-canvas-adapter-li-alone", [{ insert: "One action per request" }], [
  "b-24-canvas-adapter-li-alone-a",
]);
li("b-24-canvas-adapter-li-alone-a", [
  { insert: "POST /api/ops", attributes: code },
  { insert: " accepts a forwarded action only as a single-op batch; mixing one with doc ops is a 400 (" },
  { insert: "routes.ts", attributes: src("packages/docs-server/src/routes.ts") },
  { insert: ")." },
]);
li(
  "b-24-canvas-adapter-li-fwd",
  [{ insert: "forwardCanvasAction", attributes: src("packages/docs-server/src/store.ts") }],
  ["b-24-canvas-adapter-li-fwd-a", "b-24-canvas-adapter-li-fwd-b", "b-24-canvas-adapter-li-fwd-c"],
);
li("b-24-canvas-adapter-li-fwd-a", [
  { insert: "Loads the doc bundle, checks the doc hash, confirms the target block is a " },
  { insert: "canvas", attributes: code },
  { insert: ", and validates params against the lifted schema." },
]);
li("b-24-canvas-adapter-li-fwd-b", [
  { insert: "Resolves the block's " },
  { insert: "src", attributes: code },
  { insert: " to a sidecar path under the same doc-directory confinement rules as canvas reads." },
]);
li("b-24-canvas-adapter-li-fwd-c", [
  { insert: "A " },
  { insert: "canvasId", attributes: code },
  {
    insert:
      "-only block fails: “Central canvas references are not routable by this server yet; only sidecar canvases are supported.”",
  },
]);
li(
  "b-24-canvas-adapter-li-patch",
  [{ insert: "canvas_apply_patch", attributes: src("packages/docs-server/src/agent-tools.ts") }],
  ["b-24-canvas-adapter-li-patch-a", "b-24-canvas-adapter-li-patch-b"],
);
li("b-24-canvas-adapter-li-patch-a", [
  {
    insert:
      "The canvas-side counterpart of doc ops with the same mutation contract: hash precondition, draft-lock check, apply, revalidate with ",
  },
  { insert: "validateInteractiveCanvasDocument", attributes: code },
  { insert: ", atomic persist, inverse snapshot for undo." },
]);
li("b-24-canvas-adapter-li-patch-b", [
  { insert: "updateObject", attributes: code },
  { insert: " shallow-merges fields and deep-merges " },
  { insert: "style", attributes: code },
  { insert: ", mirroring the canvas client reducer." },
]);
li("b-24-canvas-adapter-li-division", [{ insert: "Division of labor" }], [
  "b-24-canvas-agent-1-14",
  "b-24-canvas-agent-2-15",
]);
blocks["b-24-canvas-agent-1-14"].text = [
  { insert: "Reference props (" },
  { insert: "canvasId", attributes: code },
  { insert: ", " },
  { insert: "src", attributes: code },
  { insert: ", " },
  { insert: "view", attributes: code },
  { insert: ", " },
  { insert: "title", attributes: code },
  { insert: ") patch through the generic " },
  { insert: "updateBlock", attributes: code },
  { insert: "; canvas content only moves through the forwarded " },
  { insert: "canvas.*", attributes: code },
  { insert: " actions." },
];
blocks["b-24-canvas-agent-2-15"].text = [
  { insert: '"canvas"', attributes: code },
  { insert: " is one of two entries in the model's " },
  { insert: "KNOWN_AUTHORITIES", attributes: src("packages/docs-model/src/components/checks.ts") },
  { insert: " list, beside " },
  { insert: '"sequence"', attributes: code },
  { insert: "." },
];
li("b-24-canvas-adapter-li-target", [{ insert: "Target design" }], [
  "b-24-canvas-adapter-li-target-a",
  "b-24-canvas-adapter-li-target-b",
]);
li("b-24-canvas-adapter-li-target-a", [
  {
    insert:
      "Per the contract's settled design, canvas declares an annotation-processing agent of its own, with a context loader that assembles the canvas file and a router that discovers the agent from the registry.",
  },
]);
li("b-24-canvas-adapter-li-target-b", [
  {
    insert:
      "That adapter is not wired in this repo; the forwarded action path above is the piece that exists.",
  },
]);

// ---------------------------------------------------------------------------
// Drop retired blocks, rebuild root order
// ---------------------------------------------------------------------------
delete blocks["b-24-canvas-example-h"]; // "Example" H2 — no live embed to keep
delete blocks["b-24-canvas-rendering-heading"]; // "Host Rendering Contract" H3 — content reconciled

root.children = [
  "b-24-canvas-lead-2",
  "b-24-canvas-lead-adapter",
  "b-24-canvas-state-h-3", // ## State Schema
  "b-24-canvas-state-intro",
  "b-24-canvas-state-4",
  "b-24-canvas-state-note-5",
  "b-24-canvas-example-intro",
  "b-24-canvas-example-code",
  "b-24-canvas-actions-h-8", // ## Typed Actions
  "b-24-canvas-actions-note-9",
  "b-24-canvas-lift-li-1",
  "b-24-canvas-lift-li-2",
  "b-24-canvas-actions-10",
  "b-24-canvas-proj-h-6", // ## Doc Renderer
  "b-24-canvas-slot-para",
  "b-24-canvas-embed-para",
  "b-24-canvas-rendering-inline",
  "b-24-canvas-overlay-li",
  "b-24-canvas-rendering-expanded",
  "b-24-canvas-rendering-edit",
  "b-24-canvas-rendering-portable",
  "b-24-canvas-editor-12",
  "b-24-canvas-agent-h-13", // ## Agent Renderer
  "b-24-canvas-proj-7",
  "b-24-canvas-theming-heading", // ## Theme
  "b-24-canvas-theming-para",
  "b-24-canvas-theming-table",
  "b-24-canvas-theming-note",
  "b-24-canvas-adapter-h", // ## Agent Adapter
  "b-24-canvas-adapter-lead",
  "b-24-canvas-adapter-li-alone",
  "b-24-canvas-adapter-li-fwd",
  "b-24-canvas-adapter-li-patch",
  "b-24-canvas-adapter-li-division",
  "b-24-canvas-adapter-li-target",
];

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error(JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));

const bytes = readFileSync(PATH, "utf8");
const revalidated = validateDocDocument(JSON.parse(bytes));
if (!revalidated.ok || serializeDocDocument(revalidated.document) !== bytes) {
  console.error("NOT CANONICAL after write");
  process.exit(1);
}
console.log("ok — canvas family page conformed to the six-H2 contract skeleton, canonical");
