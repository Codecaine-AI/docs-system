# Agent-Native Block Architecture

**Status:** All decisions (D1–D10) resolved and reflected throughout. Awaiting
Ford's final confirmation of shared understanding before any implementation begins.
**Last updated:** 2026-07-10

## Purpose

Restructure how block types are defined so that each block type is a self-describing
bundle — a typed state definition plus its own action surface — the way an agent in
agent-kernel is a folder with a manifest, context, and tools. The goal is a system
where blocks of arbitrarily different internal complexity (a paragraph vs. a whole
canvas) are *not* forced into one lumped data shape, but every block still exposes
one standard way of interacting: discover, read, act through named typed actions.

## Where this comes from

Three grounded inputs (explored 2026-07-10):

1. **This repo today** (`packages/docs-model`): flat `DocBlock { id, type, props, text?, children }`
   with a 14-type vocabulary (`doc-schema.ts`), a 7-op pure mutation kernel with exact
   inverses (`doc-ops.ts`), and 13 typed per-block actions riding the `blockAction` op
   (`block-actions.ts`, one file). Agent discovery already exists at `GET /api/blocks`.
   Gaps: `props` is `Record<string, unknown>` everywhere (per-type shapes are implicit
   in action helpers and viewer render guards); all actions live in one file; adding a
   type touches five coordinated hand-written sites.
2. **The agent-native pattern** (agent-native.com docs + `Codecaine/agent-kernel`):
   a single typed action boundary both UI and agent call (`defineAction`: description
   + schema + run); entities laid out as on-disk bundles discovered by convention
   (`agent.json`, `prompt.json`, optional `context.ts` / `tools.ts` sidecars); registry
   scans folders and fails loudly at boot on any drift.
3. **BlockSuite reference** (`reference/`): simple blocks are tree nodes under one
   schema mechanism; the surface/canvas block is a sanctioned escape hatch — a "hub"
   block whose elements live in a nested Y.Map with their own type registry, event
   bus, and modeling layer. Same conclusion our canvas sidecar already reached
   independently: complex blocks get their own state world behind a standard anchor.

## Mental model — blocks vs. components (decided, D1a)

Two layers with different jobs:

- **Block** — the shared top-level representation: a node in the document tree
  with a stable id, a type, position, children. This is what the wire format,
  the 7 generic ops, anchoring (comments/backlinks), and interop operate on.
  Every one of the 14 types is a block at this layer, uniformly.
- **Component** — an *editing world*: a per-world definition that owns its
  internal state model, its actions, and its editing feel. Components are NOT
  1:1 with block types. The basic document-editing experience — paragraphs,
  headings, bullet points, inline embeds, bold — is collectively one component
  (the **rich-text component**; not named "document" because *every* doc is a
  document — the other components are parts of documents too). Mermaid "will be
  edited like a Mermaid diagram,
  and that's a very different feel." The canvas "has its own way of working."

The point of the architecture: "a shared top-level way of representing this so
that it is able to all interact properly," while "the actual specifics of how
you edit the Mermaid versus the text versus the canvas each has its own clearly
specified interaction surface."

### The component roster (decided, D1b)

**7 components** covering the 14 block types:

| Component | Block types | Editing world |
|-----------|-------------|---------------|
| **rich-text** | paragraph, heading, list-item, quote, callout, divider, image, video | rich-text flow: typing, marks, links, inline embeds |
| **code** | code | source + language + line annotations |
| **mermaid** | mermaid | diagram source with live render |
| **file-tree** | file-tree | structured entries (path/note/change) |
| **structured-table** | structured-table | columns × rows grid |
| **interaction-surface** | interaction-surface | operation list (name/params/returns) |
| **canvas** | canvas | full spatial canvas (its own system; the doc holds a reference) |

## Design principles (proposed)

- **Contract over shape.** Every block type satisfies the same *interface*
  (manifest, typed state, named actions, deterministic markdown projection) —
  not the same *data shape*.
- **Vertical slices.** Everything a component needs is tightly contained in its
  slice: model bundle + mirrored viewer folder (+ external system, if any).
  Updating the file-tree component means touching `components/file-tree/` on
  two sides — never revamping the system. Same for canvas: its complexity
  lives in its own system, and only its slice in this repo knows about it.
- **The kernel stays universal.** Tree structure, id stability, the 7 generic ops,
  and exact-inverse undo are properties of the system, not of any block type.
- **One action boundary.** Human UI gestures and agent tool calls enter the same
  validated, pure action handlers. No agent-only or UI-only write paths.
- **Discovery is derived, not maintained.** `GET /api/blocks`, validation, and
  registries are folds over the bundles. Drift fails at boot, not mid-edit.
- **Agents read before they write.** The markdown projection remains the primary
  read contract; every type must have a deterministic, greppable form.
- **The bundle is the contract, not the implementation.** What lives in this
  repo per component is the contract surface: manifest, state schema, actions,
  projection, renderer. A component may implement everything inside its bundle
  (file-tree — "thick") or be a thin adapter over an external system (canvas →
  `external/canvas` — "thin"). Same bundle shape either way; complexity beyond
  the contract belongs outside the component vocabulary, in its own system.

## Proposed shape (sketch — details resolve via the decision log)

```
packages/docs-model/src/components/
  <component>/
    manifest.ts      # identity: name, owned block types, agent-facing description
    state.ts         # "here is the state" — TypeBox schemas for its block types
    actions/         # "here is how you update it" — one file per named action
      <verb>.ts
    agent-view.ts    # how an agent reads it — deterministic markdown projection
  rich-text/         # owns 8 types: paragraph, heading, list-item, quote, callout, divider, image, video
  code/
  mermaid/
  file-tree/
  structured-table/
  interaction-surface/
  canvas/            # state = a reference to a canvas document; actions imported + forwarded
```

**The four-part contract** — every component answers the same four questions,
and that uniformity (not a shared data shape) is what makes components
mix-and-matchable:

| Piece | Question it answers | Lives |
|-------|--------------------|-------|
| **State** | what is this thing? | `state.ts` — instances stored in the doc JSON blob (canvas stores a *reference*) |
| **Actions** | how do you change it? | `actions/` — named, schema-typed, callable by UI and agent alike |
| **Agent view** | how does an agent read it? | `agent-view.ts` — markdown projection (agents never parse the raw blob) |
| **User view** | how does a person see and edit it? | `docs-viewer/src/components/<name>/` — the Notion-style renderer |

There are no tiers and no special kinds of component. Canvas answers the four
questions like everyone else — its state is simply a reference into its own
system (it's a whole separate process, deeply linked to the doc through the
anchor block), and its actions are imported from that system and *forwarded*
to it rather than applied as props patches. Forwarding is a property of an
individual action, not a classification of the component.

---

## Decision log

Decisions are resolved one at a time, in dependency order. Each carries Ford's
answer once made. Statuses: ⬜ not yet discussed · 🔶 asked, awaiting answer ·
✅ decided.

### D1. Vocabulary: frozen list or plugin registration? — ✅ decided

**Question:** Is this restructure a pure internal reorganization of the frozen
14-type vocabulary, or folder-driven registration where dropping a bundle into
`blocks/` defines a type?

**Decision (Ford):** Frozen list. `DOC_BLOCK_TYPES` stays the literal source of
truth and functions "almost like the index file — this is everything that is
allowed that we currently have." Boot validation asserts a strict 1:1 match
between the list and the bundle folders (missing bundle = boot failure, extra
folder = boot failure).

**Note carried forward:** Ford flagged that "block" may not be the right mental
frame — each of these has a completely different internal structure ("different
components"), and the unifying act is that we "make them all viewable in this
kind of viewer system." → spun off as D1a.

### D1a. Mental model & terminology: what IS one of these things? — ✅ decided

**Decision (Ford):** Two-level vocabulary, with a twist: *block* = the node in
the shared document tree (wire format, ops, anchoring — unchanged); *component*
= an editing world with its own clearly specified interaction surface.
Components are **not 1:1 with block types**: the basic text-flow types
(paragraphs, bullets, inline embeds…) collectively form one component (now
named `rich-text` — see D1b), while Mermaid, canvas, etc. are each their own
component with their own editing feel. See the "Mental model" section above.

### D1b. The component roster: how do the 14 types partition? — ✅ decided

**Decision (Ford):** 7 components. `rich-text` owns the 8 text-flow types
including image/video as inline embeds; `code`, `mermaid`, `file-tree`,
`structured-table`, `interaction-surface`, `canvas` are each their own editing
world. See roster table in the Mental model section. *(Originally named
`document`; renamed `rich-text` because the docs are documentation — every doc
is a document, and all components are parts of documents, so the text-flow
world shouldn't claim that name.)*

### D2. Bundle layout across packages — ✅ decided

**Decision (Ford):** Two packages, mirrored names. The authoritative bundle
lives in `packages/docs-model/src/components/<name>/` (manifest, state,
actions, projection — pure TS, React-free, importable by server and agents).
`packages/docs-viewer` reorganizes its per-type `docs-blocks/` folders into
`src/components/<name>/` using the same 7 component names, holding each
component's React renderer and ProseMirror editor nodes. A boot/test check
enforces the 1:1 name mirror. No package or exports-map changes. Canvas's
model bundle is intentionally thin (embed pointer + sidecar patch bridge);
the real canvas system stays external.

### D3. Schema technology for `state.ts` — ✅ decided

**Decision (Ford):** TypeBox. Each component's state shapes and each action's
params are defined once as TypeBox schemas: TS types via `Static<>`, runtime
validation via the TypeBox value checker, and — because TypeBox schemas ARE
JSON Schema — `GET /api/blocks` serves the schema objects verbatim, eliminating
the hand-written discovery-only `BlockActionParamSpec` layer entirely. Matches
agent-kernel's `Type.Object` tool-registration idiom. Validation results stay
wrapped in the existing `{ ok } | { ok: false, issues }` shape. (Effect was
considered and declined — its Schema/codec layer is powerful but is an
ecosystem commitment this zero-dep model package doesn't need; Zod declined in
favor of the native-JSON-Schema + agent-kernel idiom match.)

### D4. Bundle anatomy: exact files and their contracts — ✅ decided

**Decision (Ford):** Every component bundle has an `actions/` folder, one file
per action. Full anatomy:

```
components/<name>/
  manifest.ts   # typed literal: name, ownedTypes, agent-facing description
  state.ts      # one TypeBox schema per owned block type + defaults
  actions/
    <verb>.ts   # schema + description + pure apply (defineAction style)
  project.ts    # deterministic markdown projection (renamed agent-view.ts by D10)
  index.ts      # assembles and exports the ComponentBundle
```

**Lift rule (Ford):** for a component backed by an external system, the
action *definitions* live in that system — docs-system "is just one consumer of
the canvas." The bundle's `actions/` folder lifts up the import: it adapts the
external system's own exported action/patch surface (e.g.
`CanvasAgentPatchOperation` from `@codecaine-ai/canvas`) into the standard
contract. Docs-system never redefines an external system's operations.

`context.ts` (richer agent-facing summary sidecar) is noted as a future
optional file, not built now.

### D5. Canvas actions in discovery and dispatch — ✅ decided (refined by D10)

**Decision (Ford):** Unified discovery, routed dispatch. The canvas bundle
imports the canvas system's action/param schemas (never redefines them) and
`GET /api/blocks` lists them as `canvas.*` actions alongside every other
component — one endpoint teaches an agent the entire edit surface. Dispatch:
the server routes canvas actions to the canvas authority (today's
`canvas_apply_patch` path), NOT through `blockAction → updateBlock`, which
remains props-only. *(D10 refined the expression: no `tier`/`sovereign`
manifest fields — forwarding is declared on the actions themselves.)*

### D6. Undo everywhere — ✅ decided (refined by D10)

**Decision (Ford):** Undoable, mechanism-agnostic. The system guarantee is:
**every action listed in the discovery payload is undoable.** Actions that
apply props patches get exact inverse ops free via `updateBlock` merge
semantics; forwarded actions are undone by the system that handles them
(canvas today: full pre-patch snapshot replayed with a staleness check —
`patch-ledger.ts`, `agent-tools.ts:409`). Codifies existing behavior; no
rework. *(D10 refined the expression: the mechanism is the handling
authority's implementation detail, not a manifest field.)*

### D7. Actions for the rich-text component — ✅ decided

**Decision (Ford):** No new actions; codify the rule. **A named action exists
iff the mutation targets a structured collection with positional/keyed
semantics** (file-tree entries, table rows/columns, interaction-surface
operations, code annotations). Scalar props (heading level, callout tone,
image caption…) edit via `updateBlock`, which is now schema-validated against
the component's TypeBox state (D3) and therefore discoverable. The rich-text
component ships zero actions by principle, not omission. The 13-action
catalog stays 13.

### D8. Discovery payload evolution — ✅ decided

**Decision (Ford):** `schemaVersion: 2`, clean break. The payload becomes
`{ schemaVersion, ops, components }` derived entirely by folding over the
bundles — owned types with their TypeBox state schemas served verbatim,
actions with param schemas (forwarded ones indistinguishable to agents). The
builder moves out of `docs-viewer/src/render/block-registry.ts` into
`docs-model` (it is model knowledge; the server should not serve a
viewer-built description). Self-docs update in the same change. No legacy
shape retained.

### D8a. Server-side props validation on writes — ✅ decided

**Decision (Ford):** Strict writes, tolerant reads. `applyOp` validates the
*resulting* block's props against its component's state schema; nonconforming
`insertBlock`/`updateBlock`/`blockAction` returns `{ ok: false, issues }` —
the same refusal style as hash staleness and draft locks. Reading/loading
never rejects: schema issues on read are advisory. One-time chore folded into
migration (D9): run the schemas over the repo's own `docs/` bundles in a test
and fix any drift, so the shipped corpus validates clean.

### D9. Migration sequencing — ✅ decided

**Decision (Ford):** Four phases, each independently shippable, `doc.json`
byte-stable throughout:

1. **P1 — docs-model restructure.** `components/` bundles (manifest, state,
   actions one-per-file, project, index), TypeBox introduced, registries become
   folds over bundles, boot validation (1:1 `DOC_BLOCK_TYPES` ↔ bundles),
   schemas run over the repo's own `docs/` corpus as a test (fix drift found).
2. **P2 — discovery v2 + enforcement.** `/api/blocks` schemaVersion 2 built in
   docs-model; strict write validation in `applyOp`; self-docs updated.
3. **P3 — canvas lift.** `actions/` lifts the `@codecaine-ai/canvas` surface
   as `forward` actions; `canvas.*` in discovery; dispatch routed to the
   existing sidecar authority (snapshot undo unchanged).
4. **P4 — viewer mirror.** `docs-viewer/src/components/<name>/` reorg to the
   7 component names; render registry becomes a fold; mirror check enforced.

### D10. Simplification: no tiers, no "sovereignty" — one uniform contract — ✅ decided

**Decision (Ford):** Drop the tier taxonomy (`inline`/`text-bearing`/
`sovereign`) and the sovereignty concept entirely. Every component answers the
same four questions — **state** (`state.ts`), **actions** (`actions/`),
**agent view** (`agent-view.ts`, the markdown projection — agents don't read
the raw JSON blob), **user view** (the viewer mirror). Canvas is not a
different kind of component: its state schema is a *reference* to a canvas
document, and its actions are imported from the canvas system and marked
`forward`, so the server hands them to the canvas authority instead of
applying a props patch. Consequences:

- Manifest shrinks to identity only: `{ name, ownedTypes, description }`.
  The `tier`, `undo`, and `sovereign{}` fields are deleted.
- An action carries either `apply` (pure → props patch) or `forward`
  (handled by the authority that owns the referenced state). Discovery shows
  both identically; dispatch routing follows from the action, not from a
  component classification.
- Undo mechanism is the handling authority's implementation detail (D6 note).
- `project.ts` renamed `agent-view.ts` so the bundle layout reads as the
  four-part contract. (Whether a block type carries delta `text` is a per-type
  fact declared beside its state schema, not a component classification.)

---

## Resolved structure — the definitive spec

All decisions D1–D10 are resolved; this section consolidates them.

### The two layers

- **Blocks** (unchanged): the shared top-level representation. `DocBlock
  { id, type, props, text?, children }`, the frozen 14-type vocabulary
  (`DOC_BLOCK_TYPES` stays the literal index of everything allowed), the 7-op
  kernel with exact inverses, deterministic `doc.json` serialization. Wire
  format does not change one byte.
- **Components**: 7 editing worlds covering the 14 types (roster table above).
  Each is a bundle in `packages/docs-model/src/components/<name>/`, mirrored
  by name in `packages/docs-viewer/src/components/<name>/` (React renderer +
  ProseMirror nodes). Boot/test checks enforce: 14 types ↔ bundles 1:1, and
  model↔viewer component names 1:1.

### The bundle contract

```
packages/docs-model/src/components/<name>/
  manifest.ts    # identity: name, ownedTypes, agent-facing description
  state.ts       # TypeBox schema per owned block type (Static<> types + defaults)
  actions/       # one file per action: schema + description + apply OR forward
  agent-view.ts  # deterministic markdown projection for owned types
  index.ts       # assembles the ComponentBundle
```

(User view = the mirrored `docs-viewer/src/components/<name>/` folder.)

- **Thick vs. thin:** a bundle may implement everything inline (file-tree) or
  adapt an external system (canvas → `external/canvas`). Adapting bundles
  never redefine the external system's operations — they lift up the import.
- **Action rule:** a named action exists iff the mutation targets a structured
  collection with positional/keyed semantics. Scalars edit via schema-validated
  `updateBlock`. The rich-text component has zero actions by principle.
- **apply vs. forward:** an action either applies a pure props patch to the
  block in the doc (the normal case) or forwards to the system that owns the
  referenced state (canvas). This is per-action plumbing, not a component
  classification — there are no tiers.
- **Undo guarantee:** everything in the discovery payload is undoable.
  Props-patch actions get exact inverse ops automatically; forwarded actions
  are undone by their handling authority (canvas: pre-patch snapshot replay).

### The agent surface

- `GET /api/blocks` → `{ schemaVersion: 2, ops, components }`, folded from the
  bundles in docs-model, TypeBox schemas served verbatim as JSON Schema.
- Writes are strictly validated: resulting props must conform to the owning
  component's state schema; refusals use the existing `{ ok: false, issues }`
  style. Reads stay tolerant (advisory issues only).
- Forwarded actions dispatch to their owning authority (canvas →
  `canvas_apply_patch` path); apply actions ride `blockAction → updateBlock`
  as today.

### Sequencing

P1 model bundles → P2 discovery v2 + enforcement → P3 canvas lift →
P4 viewer mirror. Details in D9.

---

## Concrete shapes

Illustrative but faithful — exact code lands in P1 review. Signatures shown
against the real current code they replace.

### The shared contract (`components/types.ts`)

```ts
import type { TSchema, Static } from "@sinclair/typebox";

export type ComponentManifest = {
  /** Component name — folder name, discovery key, viewer mirror key. */
  name: string;
  /** The block types this component owns (must partition DOC_BLOCK_TYPES). */
  ownedTypes: readonly DocBlockType[];
  /** Agent-facing, one paragraph: what this editing world is. */
  description: string;
};

export type ComponentAction<P extends TSchema = TSchema> = {
  /** Registry key, "<blockType>.<verb>" — unchanged from today. */
  action: string;
  blockType: DocBlockType;
  description: string;
  /** TypeBox schema: validated BEFORE handling; served verbatim by /api/blocks. */
  params: P;
} & (
  | {
      /** Pure. Receives already-validated params. Returns a props patch or issues. */
      apply(block: DocBlock, params: Static<P>): BlockActionResult;
    }
  | {
      /** Handled by the system that owns the referenced state (e.g. canvas). */
      forward: { authority: string };   // e.g. "canvas" → canvas_apply_patch path
    }
);

export type ComponentBundle = {
  manifest: ComponentManifest;
  /** "Here is the state": one TypeBox schema per owned block type (enforced on writes, D8a).
   *  Types that carry delta text mark it here (carriesText), per-type. */
  states: Record<DocBlockType, TSchema>;
  /** "Here is how you update it." */
  actions: readonly ComponentAction[];
  /** How an agent reads it — markdown projection (agents never parse the raw blob). */
  agentView: (block: DocBlock, ctx: ProjectionContext) => string;
  // User view: the mirrored docs-viewer/src/components/<name>/ folder.
};
```

The key upgrade over today's `BlockActionDefinition`: `params` stops being a
discovery-only description (`BlockActionParamSpec[]`) that `apply` re-validates
by hand — the schema IS the validation, run by the dispatcher before `apply`,
and IS the discovery payload.

### A thick bundle: `components/file-tree/`

`state.ts` — the shape that is implicit today, made real:

```ts
import { Type, type Static } from "@sinclair/typebox";

export const FileTreeEntry = Type.Object({
  path: Type.String({
    description: '/-separated path, no leading "./"; trailing "/" marks a directory.',
  }),
  note: Type.Optional(Type.String()),
  change: Type.Optional(Type.Union([
    Type.Literal("added"), Type.Literal("removed"),
    Type.Literal("modified"), Type.Literal("renamed"),
  ])),
  from: Type.Optional(Type.String({ description: "Previous path when renamed." })),
});

export const FileTreeState = Type.Object({
  entries: Type.Array(FileTreeEntry),
});
export type FileTreeState = Static<typeof FileTreeState>;
```

`actions/add-entry.ts` — today's `block-actions.ts:251-286`, minus all the
hand-rolled param checking (`requireString`/`optionalChange` disappear):

```ts
export const addEntry = defineComponentAction({
  action: "file-tree.addEntry",
  blockType: "file-tree",
  description: "Append a path entry (optional note and change marker) to the file tree.",
  params: Type.Object({
    path: FileTreeEntry.properties.path,
    note: Type.Optional(Type.String()),
    change: FileTreeEntry.properties.change,
  }),
  apply(block, { path, note, change }) {
    const entries = readEntries(block);           // typed: FileTreeState["entries"]
    if (entries.some((e) => e.path === path)) {
      return fail("path", `File-tree entry "${path}" already exists.`);
    }
    return { ok: true, props: { entries: [...entries, { path, note, change }] } };
  },
});
```

`manifest.ts` + `index.ts`:

```ts
export const manifest: ComponentManifest = {
  name: "file-tree",
  ownedTypes: ["file-tree"],
  description: "Annotated path tree: entries with notes and change markers.",
};
```

```ts
export const fileTreeComponent: ComponentBundle = {
  manifest,
  states: { "file-tree": FileTreeState },
  actions: [addEntry, removeEntry, updateEntry],
  agentView: fileTreeAgentView,
};
```

### The multi-type bundle: `components/rich-text/`

Owns 8 types, zero actions (D7). Its `state.ts` exports one schema per type:

```ts
export const ParagraphState = Type.Object({});
export const HeadingState  = Type.Object({
  level: Type.Integer({ minimum: 1, maximum: 6 }),
});
export const CalloutState  = Type.Object({
  tone:  Type.Optional(Type.Union([...CALLOUT_TONES.map(Type.Literal)])),
  kind:  Type.Optional(Type.String()),   // preserves retired-type coercions
  title: Type.Optional(Type.String()),
});
export const ImageState    = Type.Object({
  src: Type.String(), alt: Type.Optional(Type.String()),
  caption: Type.Optional(Type.String()),
});
// list-item, quote, divider, video …
```

```ts
export const richTextComponent: ComponentBundle = {
  manifest: {
    name: "rich-text",
    ownedTypes: ["paragraph", "heading", "list-item", "quote",
                 "callout", "divider", "image", "video"],
    description: "The rich-text flow: typing, marks, links, lists, inline embeds.",
  },
  states: { paragraph: ParagraphState, heading: HeadingState, /* … */ },
  actions: [],          // by principle (D7) — scalars edit via updateBlock
  agentView: richTextAgentView,
};
```

### The referencing bundle: `components/canvas/`

Nothing defined here — the canvas is its own system, deeply linked to the doc
through the anchor block. The bundle answers the four questions by reference:

```ts
import {
  CANVAS_AGENT_PATCH_OPERATIONS,   // the canvas system's own action surface
} from "@codecaine-ai/canvas/schema";

// State: the reference, not the canvas itself.
export const CanvasState = Type.Object({
  canvasId: Type.Optional(Type.String()),
  src:      Type.Optional(Type.String()),   // legacy sidecar path
  view:     Type.Optional(CanvasViewCrop),
});

export const canvasComponent: ComponentBundle = {
  manifest: {
    name: "canvas",
    ownedTypes: ["canvas"],
    description: "Spatial canvas. The block holds a reference; the canvas lives in its own system.",
  },
  states: { canvas: CanvasState },
  // Actions: imported and marked forward — adapt, never redefine.
  actions: liftCanvasOperations(CANVAS_AGENT_PATCH_OPERATIONS),
  //        ^ each lifted action = { action: "canvas.<op>", params: <imported schema>,
  //                                 forward: { authority: "canvas" } }
  agentView: canvasAgentView,   // summarizes the referenced canvas for agents
};
```

Dispatch follows from the action itself: `apply` actions ride
`blockAction → updateBlock` exactly as today; `forward` actions are handed to
their authority (canvas → the existing `canvas_apply_patch` path: sidecar,
patch ledger, snapshot undo).

### Registry + boot validation (`components/index.ts`)

```ts
export const ALL_COMPONENTS: readonly ComponentBundle[] = [
  richTextComponent, codeComponent, mermaidComponent, fileTreeComponent,
  structuredTableComponent, interactionSurfaceComponent, canvasComponent,
];

// Boot checks (throw with an aggregate report, agent-kernel style):
//  1. ownedTypes across bundles exactly partition DOC_BLOCK_TYPES (14 ↔ 14).
//  2. Every action key is "<ownedType>.<verb>" of its own bundle.
//  3. Every state schema compiles; every forward authority is registered.
//  4. (viewer side, P4) component folder names mirror ALL_COMPONENTS 1:1.
```

Derived from this array, nothing hand-maintained: `BLOCK_ACTIONS` lookup,
per-type state validation for D8a, the markdown projector's per-type table,
and the `/api/blocks` v2 payload.

### File tree — before → after

`packages/docs-model/src/` today:

```
doc-schema.ts        # types + 14-type list + validation + serialization
block-actions.ts     # all 13 actions, param specs, category map (926 lines)
doc-ops.ts           # the 7-op kernel
project-markdown.ts  # all per-type markdown projection
delta-markdown.ts  markdown-to-delta.ts  comments-schema.ts  spectre-ref.ts
index.ts  __tests__/  __fixtures__/
```

`packages/docs-model/src/` after P1/P2:

```
doc-schema.ts            # KEEPS: DocBlock, DOC_BLOCK_TYPES (the frozen index),
                         #   tree validation, deterministic serialization
                         # LOSES: per-type prop validation → bundles
doc-ops.ts               # unchanged kernel; blockAction dispatch now consults
                         #   the component registry + validates via state schemas
components/
  types.ts               # ComponentManifest / ComponentAction / ComponentBundle
  index.ts               # ALL_COMPONENTS + boot validation
  rich-text/
    manifest.ts  state.ts  agent-view.ts  index.ts        # actions/: none (D7)
  code/
    manifest.ts  state.ts  agent-view.ts  index.ts
    actions/  set-annotation.ts  remove-annotation.ts
  mermaid/
    manifest.ts  state.ts  agent-view.ts  index.ts
  file-tree/
    manifest.ts  state.ts  agent-view.ts  index.ts
    actions/  add-entry.ts  remove-entry.ts  update-entry.ts
  structured-table/
    manifest.ts  state.ts  agent-view.ts  index.ts
    actions/  add-row.ts  remove-row.ts  update-cell.ts
              add-column.ts  remove-column.ts
  interaction-surface/
    manifest.ts  state.ts  agent-view.ts  index.ts
    actions/  add-operation.ts  update-operation.ts  remove-operation.ts
  canvas/
    manifest.ts  state.ts  agent-view.ts  index.ts
    actions/  lift.ts     # adapts @codecaine-ai/canvas operations (P3)
discovery.ts             # builds the /api/blocks v2 payload from ALL_COMPONENTS
project-markdown.ts      # thin orchestrator: walks tree, delegates to bundle agentView()
delta-markdown.ts  markdown-to-delta.ts  comments-schema.ts  spectre-ref.ts   # unchanged (shared)
index.ts                 # exports-map keys unchanged; block-actions re-exported
                         #   from bundles for compat during migration
__tests__/  __fixtures__/
```

Dissolved: `block-actions.ts` (into `components/*/actions/`), the
`BlockActionParamSpec` layer (schemas replace it), the `BLOCK_TYPE_CATEGORY`
text/object map (subsumed by the D7 action rule + per-type carriesText facts).

`packages/docs-viewer/src/` after P4:

```
components/                      # renamed from docs-blocks/, mirrors model names
  attrs.ts  base.tsx             # shared render helpers (unchanged)
  rich-text/                     # CalloutDocsBlock.tsx, VideoDocsBlock.tsx,
                                 #   + paragraph/heading/list/quote/divider/image
                                 #   rendering pulled out of block-registry.ts
  code/                          # CodeDocsBlock.tsx  (+ editor-nodes.ts)
  mermaid/                       # MermaidDocsBlock.tsx
  file-tree/                     # FileTreeDocsBlock.tsx
  structured-table/              # StructuredTableDocsBlock.tsx
  interaction-surface/           # InteractionSurfaceDocsBlock.tsx
  canvas/                        # canvas embed frame
render/
  block-registry.ts              # becomes a fold over components/* descriptors;
                                 #   describeDocBlocksForAgent() moves to docs-model
editor/core/
  schema.ts                      # assembles PM nodes from per-component editor-nodes
  convert.ts                     # unchanged (pmToDoc / diffToOps)
```

## Future extensions (noted, not designed yet)

Directions Ford has flagged that the architecture should leave room for — the
bundle shape accommodates all of them as additional sidecar files, agent-kernel
style, without changing the four-part contract:

- **Component operating knowledge.** A component whose editing world needs
  real technique (canvas foremost) may carry a skill — loadable instructions
  an agent reads before operating it — as a bundle sidecar (e.g. `skill.md`).
  Mirrors agent-native's `.agents/skills/<name>/SKILL.md` "loaded on demand"
  pattern.
- **Specialist agents.** Forwarded actions for a complex component may route
  to a dedicated agent rather than a plain handler — e.g. a canvas update
  arrives and a *canvas agent* (with the canvas skill loaded) performs it.
  The `forward.authority` seam is where such an agent would plug in.
- **Richer agent context.** The deferred `context.ts` idea (D4): a component
  contributing a structured summary of a specific block instance to an agent's
  context, beyond the markdown agent view.

## Out of scope / non-goals

- No change to the `doc.json` wire format. Serialization stays byte-identical.
- No growth of the 14-type vocabulary as part of this work.
- The canvas document model itself (`external/canvas`) is not being redesigned —
  only how the docs system declares and interfaces with it.
