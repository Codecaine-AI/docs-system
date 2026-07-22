/**
 * Rewrite 40-block-vocabulary/40-file-tree as the family's contract-
 * instantiation page (Ford's 2026-07-21 skeleton): lead, Example, then the
 * six H2s — State Schema / Typed Actions / Doc Renderer / Agent Renderer /
 * Theme / Agent Adapter. Fixes fact errors vs code: the state has NO `title`
 * prop (FileTreeState is `{ entries }` only) and the agent render draws no
 * bold title line. The agent-render excerpt is computed from the real
 * projector so it can never drift.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";
import { fileTreeAgentView } from "../packages/docs-model/src/components/file-tree/agent-view.ts";

const PATH = "docs/10-system-design/40-block-vocabulary/40-file-tree/doc.json";
const DESIGN = "10-system-design/30-data-model/20-block-design";

const doc = JSON.parse(readFileSync(PATH, "utf8"));
const blocks = doc.blocks as Record<string, any>;
const root = blocks[doc.root];

// ---- helpers ---------------------------------------------------------------

const srcRef = (path: string) => {
  if (!existsSync(path)) throw new Error(`source ref does not exist: ${path}`);
  return { kind: "source", path };
};
const code = (insert: string) => ({ insert, attributes: { code: true } });
const codeSrc = (insert: string, path: string) => ({
  insert,
  attributes: { code: true, reference: srcRef(path) },
});
const docRef = (insert: string, path: string) => ({
  insert,
  attributes: { reference: { kind: "doc", path } },
});
const para = (id: string, text: any[]) => {
  blocks[id] = { id, type: "paragraph", props: {}, text, children: [] };
  return id;
};
const li = (id: string, text: any[], children: string[] = []) => {
  blocks[id] = { id, type: "list-item", props: {}, text, children };
  return id;
};
const heading = (id: string, level: number, text: string) => {
  blocks[id] = { id, type: "heading", props: { level }, text: [{ insert: text }], children: [] };
  return id;
};

// ---- 1. Lead ---------------------------------------------------------------

blocks["b-21-file-tree-lead-2"].text = [
  { insert: "The file-tree component owns one block type, " },
  code("file-tree"),
  { insert: ": the vocabulary's annotated path tree. A flat list of path entries in props renders — on both surfaces — as a " },
  code("tree"),
  {
    insert:
      "-command drawing, with per-entry notes and change markers for describing repo slices and refactors. State and actions live in ",
  },
  codeSrc(
    "packages/docs-model/src/components/file-tree/",
    "packages/docs-model/src/components/file-tree",
  ),
  { insert: "; the doc render lives in " },
  codeSrc(
    "packages/docs-viewer/src/components/file-tree/",
    "packages/docs-viewer/src/components/file-tree",
  ),
  { insert: "." },
];

// ---- 2. State Schema -------------------------------------------------------

blocks["b-21-file-tree-state-h-3"].text = [{ insert: "State Schema" }];

para("b-ftfam-state-lead", [
  { insert: "All state is one props key: " },
  code("entries"),
  { insert: ", an array of path entries validated by the closed " },
  code("FileTreeState"),
  { insert: " schema in " },
  codeSrc("state.ts", "packages/docs-model/src/components/file-tree/state.ts"),
  { insert: ". The type carries no delta text (" },
  code("carriesText: false"),
  { insert: ") and no title prop — every fact lives in " },
  code("entries"),
  { insert: ". The contract is " },
  docRef("State schema", `${DESIGN}/10-state-schema`),
  { insert: "." },
]);

// Entry table stays; the old block-props table (which claimed a `title` prop
// the schema does not have) goes.
delete blocks["b-21-file-tree-state-4"];
delete blocks["b-21-file-tree-state-note-6"];

li("b-ftfam-path-rules", [{ insert: "Path rules" }], [
  li("b-ftfam-path-rules-1", [
    code("path"),
    { insert: " is /-separated; " },
    code("validateTreePath"),
    { insert: " in " },
    codeSrc("lib.ts", "packages/docs-model/src/components/file-tree/lib.ts"),
    { insert: ' rejects a leading "./", a leading "/", and empty segments on every action write.' },
  ]),
  li("b-ftfam-path-rules-2", [
    {
      insert:
        "Directories need no entries of their own — they are derived from path prefixes, and a derived directory carries no note or change state.",
    },
  ]),
  li("b-ftfam-path-rules-3", [
    {
      insert:
        "An entry authored as a file is promoted to a directory when later entries nest beneath it.",
    },
  ]),
]);

blocks["b-ftfam-dir-gotcha"] = {
  id: "b-ftfam-dir-gotcha",
  type: "callout",
  props: { kind: "Gotcha", tone: "warning" },
  text: [
    { insert: 'The trailing "/" is the directory marker. An entry without it renders as a file — and files sort after directories — so a bare directory path lands styled and ordered as a file. Author an explicit directory as ' },
    code("path/"),
    { insert: "." },
  ],
  children: [],
};

li("b-ftfam-tolerant", [{ insert: "Tolerant read" }], [
  li("b-ftfam-tolerant-1", [
    code("readFileTreeEntries"),
    { insert: " skips an entry whose " },
    code("path"),
    { insert: " is missing or empty and drops wrong-typed " },
    code("note"),
    { insert: "/" },
    code("change"),
    { insert: "/" },
    code("from"),
    { insert: " values; nothing is repaired." },
  ]),
  li("b-ftfam-tolerant-2", [
    { insert: "Actions match the " },
    code("path"),
    { insert: " string literally — keep paths exact." },
  ]),
]);

// ---- 3. Typed Actions ------------------------------------------------------

para("b-ftfam-actions-intro", [
  { insert: "Three actions — one file each under " },
  codeSrc("actions/", "packages/docs-model/src/components/file-tree/actions"),
  { insert: " — are the type's whole custom write surface. " },
  code("addEntry"),
  { insert: " is the Structure excerpt on " },
  docRef("Typed actions", `${DESIGN}/20-typed-actions`),
  { insert: "." },
]);

li("b-ftfam-act-add", [code("addEntry")], [
  li("b-ftfam-act-add-1", [
    { insert: "Appends to the end of " },
    code("entries"),
    { insert: "; a duplicate path is an error." },
  ]),
  li("b-ftfam-act-add-2", [
    { insert: "Params are " },
    code("path"),
    { insert: " plus optional " },
    code("note"),
    { insert: " and " },
    code("change"),
    { insert: " — " },
    code("from"),
    { insert: " enters only through " },
    code("updateEntry"),
    { insert: "." },
  ]),
]);

li("b-ftfam-act-update", [code("updateEntry")], [
  li("b-ftfam-act-update-1", [
    { insert: "Patches " },
    code("note"),
    { insert: "/" },
    code("change"),
    { insert: "/" },
    code("from"),
    { insert: " in place; " },
    code("null"),
    { insert: " clears a field." },
  ]),
  li("b-ftfam-act-update-2", [
    code("newPath"),
    { insert: " renames without moving — the entry keeps its array position; a " },
    code("newPath"),
    { insert: " that collides with another entry is an error." },
  ]),
]);

li("b-ftfam-act-remove", [code("removeEntry")], [
  li("b-ftfam-act-remove-1", [
    { insert: "Deletes by exact path; a missing path is an error, not a no-op." },
  ]),
]);

para("b-ftfam-actions-close", [
  { insert: "Every " },
  code("apply"),
  { insert: " is pure — entries in, a props patch " },
  code("{ entries }"),
  { insert: " out — and the patch revalidates against " },
  code("FileTreeState"),
  { insert: " before anything persists." },
]);

delete blocks["b-21-file-tree-actions-note-10"];

// ---- 4. Doc Renderer -------------------------------------------------------

blocks["b-21-file-tree-renderers-heading"].text = [{ insert: "Doc Renderer" }];

para("b-ftfam-docr-lead", [
  code("FileTreeDocsBlock"),
  { insert: " (" },
  codeSrc(
    "FileTreeDocsBlock.tsx",
    "packages/docs-viewer/src/components/file-tree/FileTreeDocsBlock.tsx",
  ),
  { insert: ") draws the block on the doc surface — reader and editor alike — as a bordered monospace panel: a " },
  code("."),
  { insert: " root line, then one row per node with " },
  code("tree"),
  { insert: "-style guides (" },
  code("├──"),
  { insert: ", " },
  code("└──"),
  { insert: ", " },
  code("│"),
  { insert: "). An empty " },
  code("entries"),
  { insert: " array renders a " },
  code("(no entries)"),
  { insert: " placeholder. The contract is " },
  docRef("Doc renderer", `${DESIGN}/30-doc-renderer`),
  { insert: "." },
]);

li("b-ftfam-docr-order", [{ insert: "Ordering" }], [
  li("b-ftfam-docr-order-1", [
    { insert: "Directories sort first at every level, then names in ascending codepoint order; directory names render with a trailing \"/\"." },
  ]),
  li("b-ftfam-docr-order-2", [
    { insert: "The order matches the agent render exactly — the two surfaces agree by design." },
  ]),
]);

li("b-ftfam-docr-changes", [{ insert: "Change markers" }], [
  li("b-ftfam-docr-changes-1", [
    { insert: "A change tints the row and puts its marker in the gutter: " },
    code("+"),
    { insert: " added (emerald), " },
    code("-"),
    { insert: " removed (rose, name struck through), " },
    code("~"),
    { insert: " modified (amber), " },
    code(">"),
    { insert: " renamed (sky)." },
  ]),
  li("b-ftfam-docr-changes-2", [
    { insert: "A renamed row draws the old " },
    code("from"),
    { insert: " path struck through, then " },
    code("→"),
    { insert: ", then the new name." },
  ]),
]);

li("b-ftfam-docr-notes", [{ insert: "Notes" }], [
  li("b-ftfam-docr-notes-1", [
    code("note"),
    { insert: " renders as a muted " },
    code("# note"),
    { insert: " comment after the name, truncated at 48ch with the full text on hover." },
  ]),
]);

li("b-ftfam-docr-editor", [{ insert: "In the editor" }], [
  li("b-ftfam-docr-editor-1", [
    code("file-tree"),
    { insert: " is an atom leaf node (" },
    code("ATOM_BLOCK_TYPES"),
    { insert: " in " },
    codeSrc("schema.ts", "packages/docs-viewer/src/editor/core/schema.ts"),
    { insert: "): read-only, rendered by the same " },
    code("FileTreeDocsBlock"),
    { insert: " through the shared atom node view." },
  ]),
  li("b-ftfam-docr-editor-2", [
    { insert: "No slash-menu entry — file trees enter through agent ops or existing content." },
  ]),
]);

delete blocks["b-21-file-tree-editor-13"];
delete blocks["b-21-file-tree-proj-8"];

// ---- 5. Agent Renderer -----------------------------------------------------

blocks["b-21-file-tree-agent-h-14"].text = [{ insert: "Agent Renderer" }];

para("b-ftfam-agentr-lead", [
  code("projectFileTree"),
  { insert: " in " },
  codeSrc("agent-view.ts", "packages/docs-model/src/components/file-tree/agent-view.ts"),
  { insert: " renders the same tree as literal text inside a bare fence — the greppable form an agent reads. The Example block above projects to:" },
]);

// Compute the excerpt from the real projector so it cannot drift.
const example = blocks["b-21-file-tree-example-block"];
const projected = fileTreeAgentView(example, { listDepth: 0, listIndex: 0 });
if (!projected?.startsWith("```\n") || !projected.endsWith("\n```")) {
  throw new Error("unexpected projection shape");
}
const projLines = projected.split("\n").slice(1, -1);
if (projLines.length !== 11 || !projLines[8].startsWith("> ")) {
  throw new Error("projection changed shape — re-check annotation line numbers");
}
blocks["b-ftfam-agentr-code"] = {
  id: "b-ftfam-agentr-code",
  type: "code",
  props: {
    language: "text",
    annotations: [
      {
        lines: "9",
        label: "Renamed",
        note: "A renamed entry draws the full old path, an ASCII ->, then the new leaf name — the whole diff story on one line.",
      },
      {
        lines: "10-11",
        label: "Marker padding",
        note: "Entries in this tree carry markers, so unmarked lines pad with two spaces and the guides stay aligned.",
      },
    ],
  },
  text: [{ insert: projLines.join("\n") }],
  children: [],
};

li("b-ftfam-agentr-1", [
  { insert: "Ordering and guides match the doc render; top-level nodes render flat, with no " },
  code("."),
  { insert: " root line." },
]);
li("b-ftfam-agentr-2", [
  { insert: "Notes append as " },
  code("  # note"),
  { insert: "; directory names keep the trailing \"/\"." },
]);
li("b-ftfam-agentr-3", [
  { insert: "Change markers prefix the line: " },
  code("+"),
  { insert: " added, " },
  code("-"),
  { insert: " removed, " },
  code("~"),
  { insert: " modified, " },
  code(">"),
  { insert: " renamed." },
]);
li("b-ftfam-agentr-4", [
  { insert: "The render is pure and pinned byte-for-byte by goldens; the obligations are " },
  docRef("Agent renderer", `${DESIGN}/40-agent-renderer`),
  { insert: "." },
]);

delete blocks["b-21-file-tree-agent-1-15"];
delete blocks["b-21-file-tree-agent-2-16"];

// ---- 6. Theme --------------------------------------------------------------

blocks["b-21-file-tree-theming-heading"].text = [{ insert: "Theme" }];

blocks["b-21-file-tree-theming-para"].text = [
  { insert: "This block's theme file is " },
  code("components/file-tree.json"),
  { insert: " in a theme folder (" },
  code("themes/<id>/"),
  { insert: "). Every value is one string for both modes or a " },
  code("{ light, dark }"),
  { insert: " pair, validated against " },
  code("THEME_TOKEN_REGISTRY"),
  { insert: " in " },
  codeSrc("theme-folders.ts", "packages/docs-workbench/web/src/theme/theme-folders.ts"),
  { insert: ". The contract is " },
  docRef("Theming", `${DESIGN}/50-theming`),
  { insert: "." },
];

para("b-ftfam-theme-note", [
  { insert: "The registry carries exactly these two keys for " },
  code("file-tree"),
  { insert: ", both colors. The diff row tints and guide colors are fixed styles, not tokens." },
]);

// ---- 7. Agent Adapter ------------------------------------------------------

heading("b-ftfam-adapter-h", 2, "Agent Adapter");

para("b-ftfam-adapter-p", [
  { insert: "The family uses the default adapter: no agent of its own, no forwarding to an external authority. All three actions declare " },
  code("apply"),
  { insert: ", so agent edits ride the generic op stream as " },
  code("componentAction"),
  { insert: " ops — " },
  code('{ type: "componentAction", blockId, action: "file-tree.addEntry", params }'),
  { insert: " — which resolve the action from the registry, validate params, and land as an " },
  code("updateBlock"),
  { insert: " props patch with the usual inverse. The contract is " },
  docRef("Agent adapter", `${DESIGN}/60-agent-adapter`),
  { insert: "." },
]);

// ---- 8. Root order ---------------------------------------------------------

root.children = [
  "b-21-file-tree-lead-2",
  "b-21-file-tree-example-heading",
  "b-21-file-tree-example-intro",
  "b-21-file-tree-example-block",
  "b-21-file-tree-state-h-3", // ## State Schema
  "b-ftfam-state-lead",
  "b-21-file-tree-entry-state-5",
  "b-ftfam-path-rules",
  "b-ftfam-dir-gotcha",
  "b-ftfam-tolerant",
  "b-21-file-tree-actions-h-9", // ## Typed Actions
  "b-ftfam-actions-intro",
  "b-ftfam-act-add",
  "b-ftfam-act-update",
  "b-ftfam-act-remove",
  "b-21-file-tree-actions-11",
  "b-ftfam-actions-close",
  "b-21-file-tree-renderers-heading", // ## Doc Renderer
  "b-ftfam-docr-lead",
  "b-ftfam-docr-order",
  "b-ftfam-docr-changes",
  "b-ftfam-docr-notes",
  "b-ftfam-docr-editor",
  "b-21-file-tree-agent-h-14", // ## Agent Renderer
  "b-ftfam-agentr-lead",
  "b-ftfam-agentr-code",
  "b-ftfam-agentr-1",
  "b-ftfam-agentr-2",
  "b-ftfam-agentr-3",
  "b-ftfam-agentr-4",
  "b-21-file-tree-theming-heading", // ## Theme
  "b-21-file-tree-theming-para",
  "b-21-file-tree-theming-table",
  "b-ftfam-theme-note",
  "b-ftfam-adapter-h", // ## Agent Adapter
  "b-ftfam-adapter-p",
];

// ---- validate + write + canonical round-trip -------------------------------

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
console.log("ok — file-tree family page rewritten, canonical");
