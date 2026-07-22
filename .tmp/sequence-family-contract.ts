/**
 * Rewrite 40-block-vocabulary/70-sequence as the SEQUENCE family's
 * contract-instantiation page (Ford's 2026-07-21 skeleton): lead paragraphs,
 * Example (kept — real props.src at docs/assets/sequences/login-flow.sequence.json),
 * then exactly six H2s — State Schema / Typed Actions / Doc Renderer /
 * Agent Renderer / Theme / Agent Adapter — each grounded in real code.
 * Target-state prose: sequence is in the vocabulary; the retired diagram
 * block is not mentioned. Facts verified against:
 *   docs-model components/sequence (state.ts, actions/lift.ts, agent-view.ts),
 *   external/sequence agent-schema.ts + actions.ts + language + theme.ts,
 *   docs-viewer sequence descriptor + editor-nodes + DocBlockRenderer,
 *   docs-workbench SequenceEmbed.tsx + theme-folders.ts,
 *   docs-server store.ts (forwardSequenceAction) + agent-tools.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const PATH = "docs/10-system-design/40-block-vocabulary/70-sequence/doc.json";

// ---------------------------------------------------------------------------
// Span helpers
// ---------------------------------------------------------------------------
type Span = { insert: string; attributes?: Record<string, unknown> };
const t = (insert: string): Span => ({ insert });
const c = (insert: string): Span => ({ insert, attributes: { code: true } });
const it = (insert: string): Span => ({ insert, attributes: { italic: true } });
const dref = (insert: string, path: string): Span => ({
  insert,
  attributes: { reference: { kind: "doc", path } },
});
const SREF_PATHS: string[] = [];
const sref = (insert: string, path: string): Span => {
  SREF_PATHS.push(path);
  return { insert, attributes: { code: true, reference: { kind: "source", path } } };
};

// ---------------------------------------------------------------------------
// Block helpers
// ---------------------------------------------------------------------------
type Block = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  text?: Span[];
  children: string[];
};
const blocks: Record<string, Block> = {};
const add = (b: Block): string => {
  if (blocks[b.id]) throw new Error(`duplicate id ${b.id}`);
  blocks[b.id] = b;
  return b.id;
};
const p = (id: string, text: Span[]): string =>
  add({ id, type: "paragraph", props: {}, text, children: [] });
const h2 = (id: string, text: string): string =>
  add({ id, type: "heading", props: { level: 2 }, text: [t(text)], children: [] });
const h3 = (id: string, text: string): string =>
  add({ id, type: "heading", props: { level: 3 }, text: [t(text)], children: [] });
const li = (id: string, text: Span[], children: string[] = [], ordered = false): string =>
  add({ id, type: "list-item", props: ordered ? { ordered: true } : {}, text, children });
const sub = (id: string, text: Span[]): string =>
  add({ id, type: "list-item", props: {}, text, children: [] });
const codeBlock = (id: string, source: string): string =>
  add({ id, type: "code", props: {}, text: [t(source)], children: [] });

// ---------------------------------------------------------------------------
// Load existing doc, carry the survivors over verbatim
// ---------------------------------------------------------------------------
const doc = JSON.parse(readFileSync(PATH, "utf8"));
const old = doc.blocks as Record<string, Block>;
const keep = (id: string): string => {
  if (!old[id]) throw new Error(`expected existing block ${id}`);
  return add(structuredClone(old[id]));
};

const children: string[] = [];

// ---------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------
children.push(
  p("b-23-sequence-lead-2", [
    t("The sequence component owns one type of the "),
    dref("Block vocabulary", "10-system-design/40-block-vocabulary"),
    t(": "),
    c("sequence"),
    t(", the UML-style sequence-diagram block. The block is only a reference — "),
    c("src"),
    t(" (or "),
    c("sequenceId"),
    t(") points at a "),
    c("SequenceDocument"),
    t(" owned by the external sequence engine ("),
    sref("external/sequence", "external/sequence"),
    t("); participants, messages, and style never enter the doc. Sequence diagrams are this block's whole territory — every other diagram type belongs to the "),
    dref("canvas", "10-system-design/40-block-vocabulary/80-canvas"),
    t(" block."),
  ]),
);
children.push(
  p("b-seqfam-lead-3", [
    t("The family is the vocabulary's flagship non-default agent-adapter case: its three typed actions carry "),
    c('forward: { authority: "sequence" }'),
    t(" instead of a local "),
    c("apply"),
    t(", so diagram edits route to the sequence engine and come back validated. The JSON document is the source of truth; a compact text program is the agent-facing projection — agents rewrite the whole program, and the language carries no styling, no coordinates, and no ids."),
  ]),
);

// ---------------------------------------------------------------------------
// Example — kept: real props.src, asset exists on disk
// ---------------------------------------------------------------------------
if (!existsSync("docs/assets/sequences/login-flow.sequence.json")) {
  throw new Error("example asset missing — do not keep the Example section");
}
children.push(h2("b-23-sequence-example-h", "Example"));
children.push(
  p("b-23-sequence-example-intro", [
    t("A live block — the login flow from "),
    c("assets/sequences/login-flow.sequence.json"),
    t(" — followed by the program projection of the same document:"),
  ]),
);
children.push(keep("b-23-sequence-embed-8"));
children.push(keep("b-23-sequence-program-4"));

// ---------------------------------------------------------------------------
// State Schema
// ---------------------------------------------------------------------------
children.push(h2("b-seqfam-state-h", "State Schema"));
children.push(
  p("b-seqfam-state-intro", [
    c("SequenceState"),
    t(" in the component's "),
    sref("state.ts", "packages/docs-model/src/components/sequence/state.ts"),
    t(" is a closed schema ("),
    c("additionalProperties: false"),
    t(") of three optional props:"),
  ]),
);
add({
  id: "b-seqfam-state-shape",
  type: "state-shape",
  props: {
    name: "SequenceState",
    source: {
      path: "packages/docs-model/src/components/sequence/state.ts",
      symbol: "SequenceState",
    },
    fields: [
      {
        name: "sequenceId",
        type: "string (min length 1)",
        required: false,
        description: "Central reference to a diagram living in Sequence Studio.",
      },
      {
        name: "src",
        type: "string (min length 1)",
        required: false,
        description: "Sidecar path — docs-root-relative, or bundle-relative with a ./ prefix.",
      },
      {
        name: "title",
        type: "string",
        required: false,
        description: "Display title.",
      },
    ],
    example: '{\n  "src": "assets/sequences/login-flow.sequence.json",\n  "title": "Login flow"\n}',
  },
  children: [],
});
children.push("b-seqfam-state-shape");
children.push(
  li("b-seqfam-state-li-text", [c("carriesText: false")], [
    sub("b-seqfam-state-li-text-1", [
      t("The block carries no delta text: participants, messages, fragments, and style live in the referenced "),
      c("SequenceDocument"),
      t(", never in block state."),
    ]),
    sub("b-seqfam-state-li-text-2", [
      t("The program is a projection of that document, not a stored payload — nothing diagram-shaped is in the doc to drift."),
    ]),
  ]),
);
children.push(
  li("b-seqfam-state-li-src", [c("src"), t(" over "), c("sequenceId")], [
    sub("b-seqfam-state-li-src-1", [
      t("When both are set, the agent projection and the embed read "),
      c("src"),
      t(" first."),
    ]),
  ]),
);

// ---------------------------------------------------------------------------
// Typed Actions
// ---------------------------------------------------------------------------
children.push(h2("b-seqfam-actions-h", "Typed Actions"));
children.push(
  p("b-seqfam-actions-intro", [
    t("Three actions, lifted at module load in "),
    sref("actions/lift.ts", "packages/docs-model/src/components/sequence/actions/lift.ts"),
    t(" from "),
    c("SEQUENCE_AGENT_PATCH_OPERATIONS"),
    t(" in the engine's "),
    sref("agent-schema.ts", "external/sequence/packages/sequence/src/agent-schema.ts"),
    t(" — schema truth stays in the sequence package; the lift strips only the envelope discriminant and prefixes the family name. Each rides a "),
    c("componentAction"),
    t(" op as "),
    c("sequence.<verb>"),
    t(" and carries "),
    c('forward: { authority: "sequence" }'),
    t(" instead of a local "),
    c("apply"),
    t(" — the forwarded shape of "),
    dref("Typed actions", "10-system-design/30-data-model/20-block-design/20-typed-actions"),
    t("."),
  ]),
);
add({
  id: "b-seqfam-actions-surface",
  type: "interaction-surface",
  props: {
    title: "sequence — forwarded patch operations",
    operations: [
      {
        name: "sequence.setProgram",
        description:
          "Replace diagram structure with a complete whole-program rewrite: every participant and item, never a patch. Styling never appears in the program.",
        params: [{ name: "program", type: "string", required: true }],
        returns: "forwarded to the sequence authority",
      },
      {
        name: "sequence.setStyle",
        description:
          "Deep-merge visual style one level: element groups (surface, participant, lifeline, message, activation, fragment, note) merge per-field; null clears a field or a whole group; omitted fields are preserved.",
        params: [{ name: "style", type: "SequenceStylePatch", required: true }],
        returns: "forwarded to the sequence authority",
      },
      {
        name: "sequence.setTitle",
        description: "Set the document title without changing structure or style.",
        params: [{ name: "title", type: "string", required: true }],
        returns: "forwarded to the sequence authority",
      },
    ],
  },
  children: [],
});
children.push("b-seqfam-actions-surface");
children.push(
  p("b-seqfam-actions-apply", [
    c("applySequenceOperations"),
    t(" in the engine's "),
    sref("actions.ts", "external/sequence/packages/sequence/src/actions.ts"),
    t(" gives each verb its semantics:"),
  ]),
);
children.push(
  li("b-seqfam-actions-li-program", [c("setProgram")], [
    sub("b-seqfam-actions-li-program-1", [
      t("The program parses with "),
      c("parseSequenceProgram"),
      t("; a parse failure rejects the patch with per-line errors."),
    ]),
    sub("b-seqfam-actions-li-program-2", [
      t("The document's "),
      c("id"),
      t(" and stored "),
      c("style"),
      t(" always survive the rewrite."),
    ]),
  ]),
);
children.push(
  li("b-seqfam-actions-li-style", [c("setStyle")], [
    sub("b-seqfam-actions-li-style-1", [
      c("mergeSequenceStyle"),
      t(": shortcut fields replace, element groups merge per-field, "),
      c("null"),
      t(" deletes a field or drops a whole group."),
    ]),
  ]),
);
children.push(
  li("b-seqfam-actions-li-title", [c("setTitle")], [
    sub("b-seqfam-actions-li-title-1", [
      t("Replaces the title string; structure and style stay untouched."),
    ]),
  ]),
);
children.push(h3("b-seqfam-lang-h", "The Program Language"));
children.push(keep("b-23-sequence-lang-5"));
children.push(keep("b-23-sequence-program-6"));

// ---------------------------------------------------------------------------
// Doc Renderer
// ---------------------------------------------------------------------------
children.push(h2("b-seqfam-docrender-h", "Doc Renderer"));
children.push(
  p("b-seqfam-docrender-intro", [
    t("The viewer descriptor in "),
    sref(
      "packages/docs-viewer/src/components/sequence/descriptor.tsx",
      "packages/docs-viewer/src/components/sequence/descriptor.tsx",
    ),
    t(" renders the block through the host's "),
    c("renderSequence"),
    t(" slot; with no host wired, a dashed placeholder card names the source instead."),
  ]),
);
children.push(
  li("b-seqfam-docrender-li-slot", [t("Slot chain")], [
    sub("b-seqfam-docrender-li-slot-1", [
      c("DocBlockRenderer"),
      t(" ("),
      sref("DocBlockRenderer.tsx", "packages/docs-viewer/src/render/DocBlockRenderer.tsx"),
      t(") builds "),
      c("renderSequence"),
      t(" from "),
      c("DocsClientProvider"),
      t("'s "),
      c("sequenceEmbed"),
      t(" slot — the sequence counterpart of the canvas embed slot."),
    ]),
    sub("b-seqfam-docrender-li-slot-2", [
      c("resolveBundleSequenceSrc"),
      t(" canonicalizes the src first: a "),
      c("./"),
      t(" prefix resolves against the doc bundle's own assets; anything else is docs-root-relative."),
    ]),
  ]),
);
children.push(
  li("b-seqfam-docrender-li-host", [t("Workbench host")], [
    sub("b-seqfam-docrender-li-host-1", [
      c("StandaloneSequenceEmbed"),
      t(" ("),
      sref("SequenceEmbed.tsx", "packages/docs-workbench/web/src/pages/SequenceEmbed.tsx"),
      t(") loads the sidecar through the serve/export data layer, validates with "),
      c("validateSequenceDocument"),
      t(", and renders the read-only "),
      sref("SequenceViewer", "external/sequence/packages/sequence/src/SequenceViewer.tsx"),
      t(" — no editing, no saving."),
    ]),
    sub("b-seqfam-docrender-li-host-2", [
      t("A "),
      c("sequenceId"),
      t(" without a "),
      c("src"),
      t(" renders an Open in Sequence Studio affordance instead of an inline diagram."),
    ]),
  ]),
);
children.push(
  li("b-seqfam-docrender-li-editor", [t("Editor surface")], [
    sub("b-seqfam-docrender-li-editor-1", [
      t("The block is a non-editable atom leaf ("),
      c("docSequence"),
      t(" in "),
      sref("editor-nodes.ts", "packages/docs-viewer/src/components/sequence/editor-nodes.ts"),
      t("); the shared atom node view reuses the same descriptor and slot, so edit mode shows the same embed as reading."),
    ]),
  ]),
);

// ---------------------------------------------------------------------------
// Agent Renderer
// ---------------------------------------------------------------------------
children.push(h2("b-seqfam-agentrender-h", "Agent Renderer"));
children.push(
  p("b-seqfam-agentrender-intro", [
    t("The markdown projection in "),
    sref("agent-view.ts", "packages/docs-model/src/components/sequence/agent-view.ts"),
    t(" is one comment line — a greppable reference, not the diagram:"),
  ]),
);
children.push(
  codeBlock(
    "b-seqfam-agentrender-code",
    '<!-- sequence: assets/sequences/login-flow.sequence.json title="Login flow" -->',
  ),
);
children.push(
  li("b-seqfam-agentrender-li-form", [t("The comment form")], [
    sub("b-seqfam-agentrender-li-form-1", [
      c("src"),
      t(" wins over "),
      c("sequenceId"),
      t(" as the source; "),
      c('title="…"'),
      t(" appends only when a title is set."),
    ]),
    sub("b-seqfam-agentrender-li-form-2", [
      c("<!-- sequence: (missing src) -->"),
      t(" when no source is set."),
    ]),
  ]),
);
children.push(
  li("b-seqfam-agentrender-li-content", [t("Content lives behind the reference")], [
    sub("b-seqfam-agentrender-li-content-1", [
      t("An agent that needs the diagram reads the "),
      c("SequenceDocument"),
      t(" with "),
      c("sequence_get"),
      t(" ("),
      sref("agent-tools.ts", "packages/docs-server/src/agent-tools.ts"),
      t(") and writes back through the forwarded actions."),
    ]),
    sub("b-seqfam-agentrender-li-content-2", [
      c("parseSequenceProgram"),
      t(" and "),
      c("serializeSequenceProgram"),
      t(" ("),
      sref("language/index.ts", "external/sequence/packages/sequence/src/language/index.ts"),
      t(") round-trip document and program, so the compact program is the agent-facing text of the diagram."),
    ]),
  ]),
);

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
children.push(h2("b-seqfam-theme-h", "Theme"));
children.push(
  p("b-seqfam-theme-intro", [
    t("The docs theme owns nothing here: "),
    c("THEME_TOKEN_REGISTRY"),
    t(" ("),
    sref("theme-folders.ts", "packages/docs-workbench/web/src/theme/theme-folders.ts"),
    t(") has no sequence entry, and the default theme folder ships no "),
    c("components/sequence.json"),
    t(". Diagram visuals live in the "),
    c("SequenceDocument"),
    t("'s own "),
    c("style"),
    t(" section, edited through "),
    c("sequence.setStyle"),
    t(" — see "),
    dref("Theming", "10-system-design/30-data-model/20-block-design/50-theming"),
    t(" for the contract this deviates from."),
  ]),
);
children.push(
  li("b-seqfam-theme-li-hook", [c("--docs-sequence-border")], [
    sub("b-seqfam-theme-li-hook-1", [
      t("The one doc-side hook: the placeholder card's border color, unregistered in the token registry, falling back to "),
      c("--border"),
      t("."),
    ]),
  ]),
);
children.push(
  li("b-seqfam-theme-li-engine", [t("Engine-side painting")], [
    sub("b-seqfam-theme-li-engine-1", [
      t("The renderer paints from "),
      c("--seq-*"),
      t(" CSS variables with its own defaults ("),
      sref("theme.ts", "external/sequence/packages/sequence/src/theme.ts"),
      t(")."),
    ]),
    sub("b-seqfam-theme-li-engine-2", [
      t("Document style overrides field by field: shortcut fields ("),
      c("accent"),
      t(", "),
      c("fragmentAccent"),
      t(", "),
      c("participantFill"),
      t(", "),
      c("scale"),
      t(") apply first; per-element groups override them per field."),
    ]),
  ]),
);
children.push(
  li("b-seqfam-theme-li-channel", [t("One styling channel")], [
    sub("b-seqfam-theme-li-channel-1", [
      c("setStyle"),
      t(" is the only way style changes; styling never rides the program."),
    ]),
  ]),
);

// ---------------------------------------------------------------------------
// Agent Adapter
// ---------------------------------------------------------------------------
children.push(h2("b-seqfam-adapter-h", "Agent Adapter"));
children.push(
  p("b-seqfam-adapter-intro", [
    t("The flagship non-default case of "),
    dref("Agent adapter", "10-system-design/30-data-model/20-block-design/60-agent-adapter"),
    t(": the sequence engine is the external authority, and the block's actions forward to it instead of patching props locally. Doc-side props ("),
    c("src"),
    t(", "),
    c("sequenceId"),
    t(", "),
    c("title"),
    t(") still edit through the generic ops; diagram content never does."),
  ]),
);
children.push(
  p("b-seqfam-adapter-steps", [t("A forwarded action travels four steps:")]),
);
children.push(
  li(
    "b-seqfam-adapter-step-1",
    [
      t("The dispatcher validates params against the lifted TypeBox schema, then refuses to apply the op locally: a forwarded action \"cannot be applied as a doc op\" ("),
      sref("doc-ops.ts", "packages/docs-model/src/doc-ops.ts"),
      t(")."),
    ],
    [],
    true,
  ),
);
children.push(
  li(
    "b-seqfam-adapter-step-2",
    [
      c("forwardSequenceAction"),
      t(" ("),
      sref("store.ts", "packages/docs-server/src/store.ts"),
      t(") takes over under the doc bundle's path lock: doc-hash precondition first, then the target block must exist and be a "),
      c("sequence"),
      t(" block."),
    ],
    [],
    true,
  ),
);
children.push(
  li(
    "b-seqfam-adapter-step-3",
    [
      t("The block's "),
      c("src"),
      t(" resolves doc-relative to the sidecar path. Only sidecar references route; a central "),
      c("sequenceId"),
      t(" reference is rejected."),
    ],
    [],
    true,
  ),
);
children.push(
  li(
    "b-seqfam-adapter-step-4",
    [
      c("sequence_apply_patch"),
      t(" ("),
      sref("agent-tools.ts", "packages/docs-server/src/agent-tools.ts"),
      t(") applies through "),
      c("applySequenceOperations"),
      t(", persists atomically, and stores the full prior snapshot as the undo inverse."),
    ],
    [],
    true,
  ),
);
children.push(
  li("b-seqfam-adapter-li-undo", [t("Validation and undo hold for every editor")], [
    sub("b-seqfam-adapter-li-undo-1", [
      t("Human, host, or agent — every content write goes through the engine's own operations, so schema validation and the inverse snapshot apply no matter who edits."),
    ]),
  ]),
);
children.push(
  li("b-seqfam-adapter-li-authority", [t("A registered authority")], [
    sub("b-seqfam-adapter-li-authority-1", [
      c('"sequence"'),
      t(" is one of the two entries in the model's "),
      c("KNOWN_AUTHORITIES"),
      t(" ("),
      sref("checks.ts", "packages/docs-model/src/components/checks.ts"),
      t("); boot checks reject any action forwarding anywhere else."),
    ]),
  ]),
);
children.push(
  li("b-seqfam-adapter-li-agent", [t("The processing agent")], [
    sub("b-seqfam-adapter-li-agent-1", [
      t("The adapter contract's target design adds a sequence-specialist processing agent whose context loader assembles the sequence source instead of the doc render alone; its writeback path is the forwarding above."),
    ]),
  ]),
);

// ---------------------------------------------------------------------------
// Assemble, verify, write
// ---------------------------------------------------------------------------
for (const path of SREF_PATHS) {
  if (!existsSync(path)) throw new Error(`source ref target missing on disk: ${path}`);
}

const root = structuredClone(old[doc.root]) as Block;
root.children = children;
add(root);

// Banned-content sweep over everything we are about to write.
const banned = [/mermaid/i, /\bchrome\b/i, /blockAction/, /label if present/i];
for (const b of Object.values(blocks)) {
  const text = JSON.stringify(b);
  for (const re of banned) {
    if (re.test(text)) throw new Error(`banned content ${re} in block ${b.id}`);
  }
}

const next = { ...doc, blocks };
const result = validateDocDocument(next);
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
console.log("ok — sequence family contract page written, canonical");
console.log(`blocks: ${Object.keys(blocks).length}, root children: ${children.length}`);
