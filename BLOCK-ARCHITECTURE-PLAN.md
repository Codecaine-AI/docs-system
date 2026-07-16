# Block Architecture — Implementation Plan

**Source of truth:** `BLOCK-ARCHITECTURE.md` (D1–D10, all resolved — not relitigated here).
**This document:** the execution plan. Grounded in the actual code (file:line references
throughout), sequenced into the four phases of D9, deepest on P1.
**Status:** plan finalized after Ford interview (§0). No implementation started.

---

## 0. Interview decisions (Ford, 2026-07-10 — recorded, binding on this plan)

| # | Question | Decision |
|---|----------|----------|
| **A1** | Canvas has no runtime schemas (`CANVAS_AGENT_PATCH_OPERATIONS` does not exist; `CanvasAgentPatchOperation` is a TS-only union) — where do the runtime schemas live? | The canvas agent-update surface is essentially undefined today; **do a first-level pass of defining it, in the canvas's own vertical slice** — i.e. `external/canvas` grows a runtime op-schema module that docs-model lifts. Docs-model never hand-authors canvas op shapes. |
| **A2** | TypeBox state schemas closed or open? | **Closed** (`additionalProperties: false`). The P1 corpus test flushes out every real prop before P2 enforcement lands. |
| **A3** | New exports-map subpaths for `components/` / `discovery`? | **Root barrel only.** The 9 exports-map keys stay literally untouched; everything new exports from `"."`. |
| **A4** | Transport for forwarded (canvas) actions? | **Route via `POST /api/ops`**: a forward-marked `blockAction` is intercepted server-side and handed to the `canvas_apply_patch` path. One write endpoint for agents. |

---

## 1. Ground truth — what the code actually is today

Facts the plan is built on (verified 2026-07-10):

**docs-model (`packages/docs-model/src/`)**
- `doc-schema.ts` — `DOC_BLOCK_TYPES` (14, `doc-schema.ts:25`), tree validation, the
  flavour→type read alias + retired-type→callout coercion (`:263-305`), deterministic
  serializer (`:474`). The ONLY per-type props validation in the repo is the canvas check
  in `validateBlockProps` (`:181-206`), which tolerates a canvas block with neither
  `canvasId` nor `src`.
- `block-actions.ts` (954 lines) — 13 actions across 4 types, `BLOCK_TYPE_CATEGORY`
  (`:33`), `BlockActionParamSpec` discovery-only specs (`:52`), hand-rolled param helpers
  (`:98-165`), tolerant readers (`readFileTreeEntries:192`, `readInteractionSurfaceOperations:603`,
  `readCodeAnnotations:857`), registry (`:926-953`). Every rejection path is
  `$.params.<name>` (pinned by tests).
- `doc-ops.ts` — 7-op kernel; `blockAction` (`:536-557`) resolves via `getBlockAction`,
  type-checks the target, calls `apply()`, and funnels the patch through `updateBlock`
  (`:556`) so inverses are single-sourced.
- `project-markdown.ts` — all 14 projections in one file; walker handles list-item
  depth/run-numbering (`:475-509`); root wrapper skipped.
- `index.ts` barrel `export *`s everything; **`block-actions` has no exports-map subpath**
  — its symbols flow only through `"."`. Exports map = 9 frozen keys
  (`package.json:8-18`). **docs-model has zero runtime dependencies** — TypeBox is its first.
- All model source files carry a `"use client"` banner (Spectre extraction heritage).

**docs-server**
- `GET /api/blocks` = module-load constant `BLOCKS_DISCOVERY` (`routes.ts:30-90`),
  `{ schemaVersion: 1, genericOps, blockTypes }`; the only consumer of
  `BLOCK_TYPE_CATEGORY` + `listBlockActions` (barrel import, `routes.ts:7`). genericOps
  prose is a hand-maintained copy of the doc-ops docs.
- `POST /api/ops` (`routes.ts:275-312`) → `store.applyDocOps` → `applyDocOpsToBundle`
  (`doc-ops.ts:59`: path lock → hash 409 → draft-lock 423 → `applyOps` → serialize →
  atomic write → ledger). Failures return HTTP 400 `{ detail, issues }`.
- Canvas: `canvas_apply_patch` is a **programmatic agent tool only** (`agent-tools.ts:278-350`),
  no HTTP route. It applies ops via a local 5-case reducer (`applyCanvasPatchOperation`,
  `agent-tools.ts:202-255`), validates the whole resulting document, snapshots for undo
  (`patch-ledger.ts`, replay at `agent-tools.ts:408-430`).

**external/canvas (`@codecaine-ai/canvas`, git submodule)**
- Agent surface = `CanvasAgentPatchOperation` union (`packages/canvas/src/actions.ts:57-79`):
  `addObject`, `updateObject`, `addConnection`, `addAnnotation`, `fitContainerToChildren`
  — bare names, **no `canvas.` prefix**, **no runtime schemas anywhere** (no Zod/TypeBox/JSON
  Schema in the package). Validation = hand-written guards in `schema.ts`.
- No dependency on docs-model (deliberate local `spectre-ref.ts` copy) → docs-model
  importing canvas creates **no cycle**. `import-boundaries.test.ts` does not forbid it
  (rule 2 bans only react/react-dom/@tiptap in docs-model); type-only imports are the
  established pattern.

**docs-viewer**
- `docs-blocks/` has 7 type-named folders; **6 rich-text types + canvas render inline**
  in `block-registry.ts` (`:449-697`) with per-type prop guards (`:302-442`).
- `describeDocBlocksForAgent()` (`block-registry.ts:789`) has **no non-test consumer**.
- Editor: all PM nodes + `NODE_TYPE_TO_BLOCK_TYPE` maps in `editor/core/schema.ts`;
  `convert.ts` has exactly three per-type prop branches (`splitPropsForNode:125`,
  `joinPropsFromNode:259` — heading.level, list-item.ordered, code.language) and is
  otherwise type-agnostic. `SlashMenu.tsx` hardcodes the insertable-type list.
- Viewer never imports the docs-model root barrel — subpaths only (§1 exports map safe).

**Tests / corpus / build**
- Bun workspaces, no build step — everything runs from source; `make check` =
  typecheck + scoped `bun test`. No TypeBox anywhere yet.
- `sample.doc.json` fixture = one block of every canonical type;
  `project-markdown.test.ts:143` asserts its type set === `DOC_BLOCK_TYPES`.
- Corpus: 9 `doc.json` under `docs/`; block types present: paragraph, heading, list-item,
  code, interaction-surface, divider, structured-table, callout, quote, mermaid,
  file-tree. **canvas/image/video appear only in the fixture.** No retired type names in
  the corpus.
- Contract-pinning tests: 13-action catalog + `$.params.*` paths
  (`block-actions.test.ts`), serializer byte-determinism (`doc-schema.test.ts:407-434`),
  `/api/blocks` v1 shape incl. `blockTypes.length === 14` (`routes.test.ts:449-560`),
  mdx→doc→markdown round-trip over real docs (`docs-cli round-trip.test.ts`).
- No boot-time corpus validation exists; server boot = `createDocsServeApp`
  (`docs-workbench/src/server.ts:78`); validation is per-request in `bundle.ts:83` (422).

---

## 2. Cross-phase invariants (the safety rails)

Every phase must hold these; each has a mechanical check:

1. **`doc.json` byte-identical.** `serializeDocDocument` and its key-order tables are
   not touched in any phase. Guard: existing determinism tests + a new
   *corpus re-serialize golden*: load + validate + re-serialize every `docs/**/doc.json`
   and the fixture; bytes must equal the file on disk. (Added in P1, kept forever.)
2. **Exports map untouched** (A3). All 9 keys byte-identical across all phases.
3. **Markdown projection byte-identical.** The P1 projection split is a pure refactor.
   Guard: a *projection golden* — snapshot `projectToMarkdown` over the corpus + fixture
   before P1, assert identical after (then keep as a regression corpus).
4. **`/api/blocks` v1 byte-identical through P1.** Discovery changes only in P2 (clean
   break to v2). Guard: snapshot the v1 JSON pre-P1, assert identical post-P1.
5. **Issue-path conventions preserved.** Action param rejections stay `$.params.<name>`;
   op rejections stay `$.op.*`. Message *text* may improve; paths may not change.
6. **Each phase ships green through `make check`** plus the golden suite, and each phase
   is a self-contained commit series revertable as a unit.

**Convention note:** new docs-model source files keep the `"use client"` banner to match
the existing convention (harmless directive, keeps the package uniform for RSC bundlers).

---

## 3. P1 — docs-model restructure (deepest)

**Goal:** `components/` bundles exist, TypeBox is in, every registry is a fold, boot
checks enforce 1:1, the corpus validates against the schemas — while every external
behavior (wire bytes, projection bytes, discovery v1 bytes, issue paths, test contracts)
is provably unchanged.

### 3.0 Wave structure

- **Wave 0 (sequential, one worker):** shared contract — types, helpers, dependency,
  goldens captured *before* any refactor.
- **Wave 1 (parallel, 7 workers):** one worker per bundle. Independent once Wave 0 lands.
- **Wave 2 (sequential, one worker + review):** integration — dispatcher, projection
  orchestrator, barrel/compat, boot checks, corpus test, golden verification, delete
  `block-actions.ts`.

### 3.1 Wave 0 — shared contract

**`packages/docs-model/package.json`** — add `"dependencies": { "@sinclair/typebox": "^0.34" }`
(pin the current 0.34.x; it's the JSON-Schema-native line matching agent-kernel's idiom).
First runtime dep, called out in the commit message. Run `bun install`.

**Golden capture (before any source change):**
- `src/__tests__/goldens/blocks-discovery.v1.json` — the exact `BLOCKS_DISCOVERY` JSON
  (captured from a running build or by evaluating the same fold routes.ts does).
- `src/__tests__/goldens/projection/*.md` — `projectToMarkdown` output for the fixture and
  each of the 9 corpus docs.
- Corpus re-serialize golden needs no stored file — the assertion is against the on-disk bytes.

**`components/types.ts`** — the contract, exactly the shapes in the design doc's
"Concrete shapes" section, with these concretions:

```ts
export type ComponentManifest = { name: string; ownedTypes: readonly DocBlockType[]; description: string };

export type BlockStateDefinition = {
  /** Closed TypeBox object schema (A2): additionalProperties: false. */
  schema: TObject;
  /** Per-type fact (D10): does this type carry delta text? */
  carriesText: boolean;
};

export type ComponentAction<P extends TObject = TObject> = {
  action: string;                 // "<blockType>.<verb>" — key format unchanged
  blockType: DocBlockType;
  description: string;
  params: P;                      // validated by the DISPATCHER before apply; served verbatim in P2
} & (
  | { apply(block: DocBlock, params: Static<P>): BlockActionResult }
  | { forward: { authority: string } }
);

export type ComponentBundle = {
  manifest: ComponentManifest;
  states: Partial<Record<DocBlockType, BlockStateDefinition>>;  // boot check makes it total over ownedTypes
  actions: readonly ComponentAction[];
  agentView(block: DocBlock, ctx: ProjectionContext): string | null;
};

export type ProjectionContext = {
  /** list-item support: nesting depth + index within the current consecutive run. */
  listDepth: number;
  listIndex: number;
};
```

`BlockActionResult` **moves here** from `block-actions.ts` (re-exported from the barrel,
same name/shape). `agentView` returns `string | null` mirroring
`projectBlockOwnLines` (`project-markdown.ts:412`) — `null` = "no own lines"
(empty paragraph). The walker stays in `project-markdown.ts` (§3.3).

**`components/define.ts`** — the two shared mechanisms:

- `defineComponentAction(def)` — identity helper with type inference (agent-kernel
  `defineAction` style); also asserts at definition time that `action` ===
  `` `${def.blockType}.` `` + verb (cheap early failure, duplicated by boot check 2).
- `schemaIssues(errors, base = "$.params")` — maps TypeBox `Value.Errors()` (JSON-pointer
  paths like `/entries/0/path`) into the repo's issue shape:
  `{ path: "$.params.entries[0].path", message }`. **Paths preserve today's convention
  exactly** (invariant 5); messages are TypeBox's (clearer than today's, tests assert
  paths not messages — any message-level assert found gets updated in Wave 2).
- `checkParams(action, params): DocValidationIssue[]` — `Value.Check` +
  `schemaIssues` wrap; used by the dispatcher.

**Validation split rule (applies to every bundle in Wave 1):** the TypeBox `params`
schema owns *shape* — types, required-ness, enums (`Type.Union` of literals for change
markers / kinds), integer-ness, string min-length, `Type.Union([T, Type.Null()])` for the
"null clears" fields. `apply()` keeps only *domain* checks that need the block or
cross-field logic: duplicate keys ("path already exists"), block-relative ranges
(`index ∈ [0, rows.length]`), file-tree path grammar (`validateTreePath` — bespoke
messages worth keeping), "exactly one of column | columnIndex". Those stay hand-written,
with the same issue paths as today. `requireString`/`optionalString`/`optionalInteger`
and friends disappear; `optionalStringOrNull` semantics move into schemas.

**`components/index.ts` (skeleton)** — `ALL_COMPONENTS` (empty-ish until Wave 1 lands),
`assertComponentRegistry()` executed **at module load** (agent-kernel style: importing a
drifted registry throws with an aggregated report), plus the derived folds:

```
COMPONENT_BY_TYPE : Map<DocBlockType, ComponentBundle>
ACTION_REGISTRY   : Map<string, ComponentAction>        // replaces BLOCK_ACTIONS' internals
stateFor(type)    : BlockStateDefinition
agentViewFor(type): ComponentBundle["agentView"]
```

Boot checks (each produces ALL failures, then one throw):
1. `ownedTypes` across bundles exactly partition `DOC_BLOCK_TYPES` (missing / extra /
   duplicate ownership all reported).
2. Every action key is `"<type>.<verb>"` where `<type>` ∈ its own bundle's `ownedTypes`,
   and keys are globally unique.
3. Every owned type has a `states` entry; every schema is a compilable closed `TObject`
   (`Value.Check(schema, <its own default instance>)` smoke + `additionalProperties === false`);
   every `forward.authority` ∈ a `KNOWN_AUTHORITIES` list (P1: `["canvas"]`).
4. (Viewer mirror is P4's check — noted, not built here.)

Checks are implemented as a pure `collectRegistryIssues(bundles): string[]` so tests can
feed synthetic bad registries without module-load games.

**`components/compat.ts`** — the migration shims, all *derived*, nothing hand-maintained
except the one literal that isn't derivable:

- `BLOCK_TYPE_CATEGORY` — **kept as a literal** (it is NOT derivable: divider/image/
  video/canvas/mermaid are "object" with zero actions, code carries text but is "object").
  Marked deprecated, deleted in P2 with its only consumers (routes.ts v1 payload + tests).
- `BlockActionDefinition` adapter: wraps each `ComponentAction` into today's shape —
  including **deriving `BlockActionParamSpec[]` from the TypeBox schema** (property name,
  `type` from the schema node kind, `required` from the Optional modifier, `description`
  from the schema's `description`). This is what keeps `/api/blocks` v1 byte-identical
  (invariant 4): the current param-spec strings become the schema `description` strings
  verbatim. The adapter's `apply` runs `checkParams` first, then the bundle `apply` —
  preserving today's "apply validates" behavior for any direct caller.
- `BLOCK_ACTIONS` / `getBlockAction` / `listBlockActions` — folds over `ACTION_REGISTRY`
  through the adapter. Same names, same signatures, same iteration order as today's
  catalog (order the bundles + actions to match `ALL_BLOCK_ACTIONS` order,
  `block-actions.ts:926-940`, so v1 discovery ordering is stable).
- Type/value re-exports that currently live in `block-actions.ts` and must keep flowing
  from the barrel: `BlockCategory`, `BlockActionParamType`, `BlockActionParamSpec`,
  `FILE_TREE_CHANGES`, `FileTreeChange`, `FileTreeEntry`, `readFileTreeEntries`,
  `INTERACTION_SURFACE_KINDS`, `InteractionSurfaceKind`, `InteractionSurfaceParam`,
  `InteractionSurfaceOperation`, `readInteractionSurfaceOperations`, `CodeAnnotation`,
  `readCodeAnnotations` — re-exported from their new bundle homes (below).

### 3.2 Wave 1 — the seven bundles (parallel)

Common per-bundle shape: `manifest.ts`, `state.ts`, `actions/<verb>.ts` (if any),
`agent-view.ts`, `index.ts`, `__tests__/` colocated. Every worker receives: the Wave 0
contract files, the exact current source lines to move, and the rule "behavior-identical:
the existing monolith tests must keep passing against the compat layer."

State schemas are derived from what the projection, viewer guards, fixture, and corpus
*actually read* — enumerated per type below. `Type.Object({...}, { additionalProperties: false })`
everywhere (A2). Delta `text` is NOT in props schemas (it's a block-level field);
`carriesText` declares it.

**`rich-text/`** — owns 8 types, zero actions (D7).
- `state.ts`:
  - `paragraph: {}` — carriesText ✓
  - `heading: { level?: Integer 1..6 }` — carriesText ✓. *Optional*, because the current
    projection defaults absent level to 2 (`project-markdown.ts:109-113`) and the PM
    schema defaults it; making it required would reclassify tolerated docs as invalid.
    (Deviation from the design sketch's required `level` — flagged in §9; corpus audit
    may allow tightening.)
  - `list-item: { ordered?: Boolean }` — carriesText ✓
  - `quote: {}` — carriesText ✓
  - `callout: { tone?: Union(literals of the viewer's tone set), kind?: String, title?: String }`
    — carriesText ✓. `kind` free-form (preserves retired-type coercions, doc-schema.ts:293-305).
  - `divider: {}` — carriesText ✗
  - `image: { src: String, alt?: String, caption?: String }` — carriesText ✗. `src`
    required per the design sketch; only the fixture has images — if corpus audit finds
    src-less images, loosen (rule in §3.4).
  - `video: { src?: String, url?: String, title?: String, caption?: String }` — carriesText ✗.
    Both optional (either may appear; url wins in projection, `project-markdown.ts:399`).
- `agent-view.ts`: moves `projectBlockOwnLines`'s heading/paragraph/quote/divider/
  callout/image/video branches + `projectCallout`, `projectImage`, `projectVideo`,
  `blockquotePrefix`, `stringProp`/`numberProp` helpers (shared helpers land in
  `components/projection-utils.ts` since code/mermaid/file-tree also need them), and
  `projectListItem` (consumes `ctx.listDepth`/`ctx.listIndex`).
- No `actions/` folder — and a one-line comment in `index.ts` citing D7 so its absence
  reads as principle, not omission.

**`code/`** — owns `code`. carriesText ✓ (the source).
- `state.ts`: `{ language?: String, annotations?: Array({ lines: String, label?: String, note: String }) }`.
- `actions/set-annotation.ts` ← `block-actions.ts:870-899`; `actions/remove-annotation.ts`
  ← `:901-920`. Schema handles string/required checks; `apply` keeps upsert/missing-key
  domain logic. `readCodeAnnotations` (`:857-868`) moves to `state.ts` (exported for compat).
- `agent-view.ts` ← the `code` branch + `codeAnnotations` helper (`project-markdown.ts:149-167, 420-429`).

**`mermaid/`** — owns `mermaid`. carriesText ✓ (diagram source rides `text`).
- `state.ts`: `{ title?: String }`.
- No actions. `agent-view.ts` ← `projectSemanticBlock` + the `CALLOUT_LIKE_SEMANTIC_TYPES`
  special case (`project-markdown.ts:93-133`) — which then *dies* as a concept: mermaid's
  bundle owns its projection directly, no semantic-label lookup table.

**`file-tree/`** — owns `file-tree`. carriesText ✗.
- `state.ts`: `{ title?: String, entries: Array(FileTreeEntry) }` with `FileTreeEntry`
  exactly the design sketch (path + note? + change?(enum) + from?). `FILE_TREE_CHANGES`,
  `FileTreeChange`, `FileTreeEntry`, `readFileTreeEntries` (`block-actions.ts:175-205`) live here.
- `actions/add-entry.ts` ← `:250-286`, `remove-entry.ts` ← `:288-307`,
  `update-entry.ts` ← `:309-361`. `validateTreePath` (`:207-222`) → bundle-local
  `lib.ts` (domain check, stays in apply). Null-clear semantics via
  `Type.Union([Type.String(), Type.Null()])` in the update schema.
- `agent-view.ts` ← `projectFileTree` + tree-render machinery (`project-markdown.ts:273-373`).

**`structured-table/`** — owns `structured-table`. carriesText ✗.
- `state.ts`: `{ title?: String, columns: Array(String), rows: Array(Array(String)), density?: Union("compact","normal","relaxed") }`
  — `density` is read by the viewer (`block-registry.ts:364-387`); closed schemas mean it
  must be declared or die; it's real, so declared.
- `actions/`: `add-row.ts` ← `block-actions.ts:414-446`, `remove-row.ts` ← `:448-462`,
  `update-cell.ts` ← `:464-492`, `add-column.ts` ← `:494-523`, `remove-column.ts` ← `:525-545`.
  `readTableColumns/readTableRows/normalizeRow/resolveColumn` (`:367-412`) → bundle `lib.ts`.
  "Exactly one of column|columnIndex" stays a domain check in apply (same
  `$.params.column` issue path); both params optional in the schema with the constraint
  in the action `description`.
- `agent-view.ts` ← `projectStructuredTable` (`project-markdown.ts:169-191`).

**`interaction-surface/`** — owns `interaction-surface`. carriesText ✗.
- `state.ts`: `{ title?: String, operations: Array({ name: String, description?: String, params?: Array({ name, type?, required?, description? }), returns?: String, kind?: Union("action","query","event") }) }`.
  `INTERACTION_SURFACE_KINDS` + types + `readInteractionSurfaceOperations`
  (`block-actions.ts:557-630`) live here.
- `actions/add-operation.ts` ← `:706-739`, `update-operation.ts` ← `:741-824` (note its
  hand-remapped patch issue paths, `:779-785` — the schema-driven version produces
  `$.params.patch.<field>` natively, deleting that remap), `remove-operation.ts` ← `:826-847`.
- `agent-view.ts` ← `projectInteractionSurface` (`project-markdown.ts:193-271`).

**`canvas/`** — owns `canvas`. carriesText ✗. **P1 scope is state + view only** (actions are P3).
- `state.ts`: `{ canvasId?: String(minLength 1), src?: String(minLength 1), view?: String, title?: String }`
  — matches the fixture (`sample.doc.json` canvas block) and today's tolerance for
  neither-id-nor-src placeholders (`doc-schema.ts:201-205`). `title` and `view` are in the
  design sketch's spirit but `title` is missing from its `CanvasState` — the data has it,
  so the schema has it. `view` is a plain string today (named view crop), not a structured
  `CanvasViewCrop` — first pass keeps it a string (P3/A1 may structure it).
- `actions/`: empty folder + comment pointing at P3.
- `agent-view.ts` ← `projectCanvas` (`project-markdown.ts:375-385`).

**Per-bundle tests (Wave 1, each worker):** move the relevant `describe` blocks out of
`block-actions.test.ts` semantics into `components/<name>/__tests__/actions.test.ts` /
`state.test.ts` — but **do not delete the monolith test yet**: through Wave 2 it runs
against the compat exports and is the proof that behavior didn't change. Each bundle also
gets a `state.test.ts`: its fixture block(s) `Value.Check` clean; a stray-prop block fails
(closed-schema smoke).

### 3.3 Wave 2 — integration (sequential)

**`doc-ops.ts` — the dispatcher change.** The `blockAction` case (`:536-557`) becomes:

```
resolve ACTION_REGISTRY.get(op.action)        → unknown: fail "$.op.action" (same message shape)
block exists + block.type === action.blockType → same checks, same paths
checkParams(action, op.params ?? {})           → NEW: schema validation BEFORE apply
  (issues come back as $.params.* — same paths the old in-apply checks produced)
if "apply" in action:  action.apply(block, params) → updateBlock funnel, UNCHANGED (:556)
if "forward" in action: fail "$.op.action",
  `Action "<a>" is handled by the <authority> authority and cannot be applied as a doc op.`
```

The forward refusal is dead code until P3 registers forward actions, but the dispatcher
distinguishing `apply` vs `forward` is a P1 contract fact (D10): routing follows from the
action, and the pure kernel only ever executes `apply`. Imports switch from
`./block-actions` to `./components`.

**`project-markdown.ts` — thin orchestrator.** Keeps: module-header format doc (updated to
point at bundle files), the walker (`projectToMarkdown`, list-run numbering, root-wrapper
skip, join semantics). `projectBlockOwnLines` becomes
`agentViewFor(block.type)(block, ctx)`; the list-item special case moves behind the same
call (rich-text's agentView handles it via ctx). The `default:` fallback for unknown
types (unreachable post-validation) stays in the walker. **Output must be byte-identical**
— verified by the projection golden (invariant 3).

**`doc-schema.ts` — deliberately almost untouched in P1.** `DOC_BLOCK_TYPES`, tree
validation, coercion, serializer: unchanged. **The canvas `validateBlockProps` check
STAYS in P1** and is deleted in P2 — a deviation from the design doc's "after P1/P2" file
map, chosen so P1 changes zero read-path behavior; P2 owns the strict-writes/tolerant-reads
flip as one coherent change. (Flagged in §9 so it's not a silent call.)

**`index.ts` barrel:** `export * from "./components"` (which re-exports `./components/compat`)
replaces `export * from "./block-actions"`. Net effect: every symbol importable from
`@codecaine-ai/docs-model` today remains importable, plus the new surface
(`ALL_COMPONENTS`, bundle exports, `ComponentBundle` types). **Then `block-actions.ts` is
deleted** — nothing may import it (grep-verified; today only `doc-ops.ts`, `index.ts`,
and its own test do).

**Boot-check wiring:** `components/index.ts` module-load assert (already built Wave 0);
additionally `createDocsServeApp` gets nothing new in P1 — importing docs-model anywhere
already trips the check. (A server-boot corpus sweep was considered and deferred: the
per-request 422 in `bundle.ts:83` is today's behavior; changing boot semantics isn't P1's job.)

**New tests (Wave 2):**
1. `components/__tests__/registry.test.ts` — boot-check failure modes via
   `collectRegistryIssues` with synthetic bad registries (missing bundle, extra type,
   double ownership, malformed action key, unknown forward authority, open schema).
2. `components/__tests__/schema-over-corpus.test.ts` — **the D8a chore**: for the fixture
   + every `docs/**/doc.json`, every block's props `Value.Check` against its type's state
   schema; failures listed with doc path + block id. Drift found gets fixed in the same
   PR under this rule: *if the projection or viewer reads the prop → add it to the schema;
   otherwise → remove it from the doc (byte change to that doc.json is a corpus content
   fix, not a wire-format change — commit separately with the diff spelled out).*
3. `__tests__/goldens.test.ts` — the three goldens: corpus re-serialize (invariant 1),
   projection (invariant 3), discovery v1 (invariant 4 — builds the payload exactly as
   routes.ts does, from the compat exports, and diffs against the captured JSON).
4. Param-spec derivation unit test — derived `BlockActionParamSpec[]` for all 13 actions
   equals the pre-P1 hand-written specs (belt-and-braces under the discovery golden).

**Updated tests:** `block-actions.test.ts` — audit for message-text assertions (path
assertions all survive; message texts that moved to TypeBox get their expected strings
updated). `doc-schema`, `doc-ops.contract`, `project-markdown`, `comments`, `delta`
tests: unchanged and must pass unmodified. docs-server `routes.test.ts` and docs-cli
round-trip: unchanged and must pass unmodified.

### 3.4 P1 exit criteria

- `make check` green; monolith `block-actions.test.ts` green against compat exports.
- All three goldens pass. Exports map diff = empty. `git diff docs/` = only corpus-drift
  fixes explicitly enumerated in the PR description.
- New file tree matches the design doc's "after" sketch (minus `discovery.ts`, which is P2).

### 3.5 P1 parallelization (sub-agent / codex map)

| Work item | Depends on | Workers | Codex effort |
|---|---|---|---|
| Wave 0: contract + define + compat skeleton + goldens | — | 1 | `xhigh` (design-bearing) |
| Wave 1: rich-text bundle | Wave 0 | 1 | `xhigh` (8 types, projection nuances) |
| Wave 1: code / mermaid / canvas bundles | Wave 0 | 1–3 | `low` (small, fully specified) |
| Wave 1: file-tree / structured-table / interaction-surface bundles | Wave 0 | 3 | `xhigh` (validation-split judgment) |
| Wave 2: dispatcher + orchestrator + barrel + corpus test + goldens verify | all Wave 1 | 1 | `xhigh` |
| Independent review: behavior-parity audit of the whole P1 diff | Wave 2 | 1 | `xhigh` |

Wave 1 workers are fully independent of each other (distinct directories; the only shared
files — `types.ts`, `define.ts`, `projection-utils.ts` — are Wave 0 outputs and read-only
to them). Per the workflow rules, every worker performs its edits through `codex exec`
with explicit effort, and prompts carry the exact source line ranges to move plus the
"paths preserved / monolith tests must pass" contract.

---

## 4. P2 — discovery v2 + strict write validation

**Goal:** `/api/blocks` becomes the bundle fold at `schemaVersion: 2`; writes are
schema-validated; reads become uniformly tolerant. Clean break (D8) — v1 golden retires.

### 4.1 `discovery.ts` in docs-model

`buildBlocksDiscovery(): BlocksDiscovery` — pure fold over `ALL_COMPONENTS`. Proposed
concrete shape (D8 fixes `{ schemaVersion, ops, components }`; the leaf fields are this
plan's proposal — **sign-off at P2 review**):

```jsonc
{
  "schemaVersion": 2,
  "ops": [ { "op": "insertBlock", "description": "..." }, ...7 ],   // prose MOVES here from routes.ts:34-79
  "components": [
    {
      "name": "file-tree",
      "description": "<manifest.description>",
      "types": [
        { "type": "file-tree", "carriesText": false, "state": { /* TypeBox schema, verbatim JSON Schema */ } }
      ],
      "actions": [
        { "action": "file-tree.addEntry", "description": "...", "params": { /* schema verbatim */ } }
      ]
    }, ...
  ]
}
```

Forwarded actions serialize identically to apply actions (D5/D10 — agents can't tell).
Exported from the barrel (A3). The hand-maintained genericOps prose in `routes.ts:34-79`
moves into `discovery.ts` next to the DocOp docs it mirrors (single home; doc-ops keeps
the authoritative JSDoc, discovery.ts holds the agent-facing copy with a keep-in-sync
comment — collapsing them fully is noted in §9).

**docs-server change:** `routes.ts` drops the `BLOCK_TYPE_CATEGORY`/`listBlockActions`
imports and the local constant; `BLOCKS_DISCOVERY = buildBlocksDiscovery()` at module
load. Route handler unchanged.

### 4.2 Strict writes in `applyOp` (D8a)

- After computing the next block for **`insertBlock`** and **`updateBlock`** (which
  `blockAction` funnels through), validate `next.props` against
  `stateFor(next.type).schema`. Failure → `{ ok: false, issues }` with paths
  `$.op.props.<key>` (insert/update) — same refusal style as today's op failures; the op
  never half-applies.
- `splitBlock`/`mergeBlocks` are NOT validated (D8a names the three write ops; split/merge
  copy props from already-present blocks). Noted in §9.
- Implementation: `TypeCompiler.Compile` each state schema once at registry build (cheap,
  14 schemas) so the hot write path is a compiled check, not schema interpretation.

### 4.3 Tolerant reads

- Delete `validateBlockProps` from `doc-schema.ts:181-206` (the canvas check) — its job is
  taken by the canvas bundle schema on the write path. `validateDocDocument` no longer
  rejects any doc on props content; `bundle.ts` 422s remain for *structural* invalidity only.
- No advisory-issues channel is built in P2 (nothing consumes it; the corpus is clean by
  P1's test). Deferred — §9.

### 4.4 Compat removals + self-docs

- Delete from `components/compat.ts`: `BLOCK_TYPE_CATEGORY`, `BlockCategory`,
  `BlockActionParamType`, `BlockActionParamSpec`, the param-spec derivation. (Their only
  consumers were the v1 payload and tests.) `BLOCK_ACTIONS`/`getBlockAction`/
  `listBlockActions` **stay** — they're one-line folds, used by the monolith test and any
  external caller, and cost nothing.
- Retire the discovery-v1 golden and the derivation test; keep projection + re-serialize
  goldens forever.
- Self-docs: update `docs/10-system-design/10-block-vocabulary` and `20-mutation-model`
  (discovery shape, strict-write behavior) via normal doc edits in the same PR.

### 4.5 P2 tests

- Rewrite `routes.test.ts:449-560` discovery suite for v2: 7 components, 14 types
  partitioned, every action's `params` is a JSON-Schema object, schemaVersion 2, byte-equal
  to `buildBlocksDiscovery()`.
- New `discovery.test.ts` in docs-model: fold correctness + "schemas served verbatim"
  (deep-equal the served state schema and the bundle's TypeBox object).
- New strict-write tests in doc-ops: per type, a conforming update passes; an unknown prop
  refuses (closed schema); a wrong-typed known prop refuses; `blockAction` producing a
  valid patch still passes end-to-end; `POST /api/ops` returns 400 `{ detail, issues }` for
  a schema-refused write (routes.test addition).
- Tolerant-read test: a doc.json with a stray canvas prop loads (200) where it used to 422
  — pinned as the new behavior.
- `doc-schema.test.ts` canvas-props cases (`:203-218`) updated: validation-level rejection
  cases become write-level rejection cases.

**Parallelization:** three independent workers — (a) discovery.ts + routes re-point +
tests (`xhigh`), (b) strict writes + tolerant reads + tests (`xhigh`), (c) self-docs
(`low`) — then one integration pass reconciling compat deletions.

---

## 5. P3 — canvas lift

Per **A1**: the canvas agent-update surface gets its **first real definition, inside
external/canvas** (its own vertical slice); docs-model lifts it; per **A4** dispatch rides
`POST /api/ops`. Three workstreams, strictly ordered A → B → C.

### 5.1 Workstream A — external/canvas grows its agent schema (first-level pass)

New module `external/canvas/packages/canvas/src/agent-schema.ts` (+ exports-map entry
`"./agent-schema"` — the canvas package's map is its own, not covered by the docs-model
freeze; additive anyway):

- TypeBox schemas for the params of the **existing five** `CanvasAgentPatchOperation`
  variants (`actions.ts:57-79`) — a *description* pass, not a redesign: `addObject`,
  `updateObject`, `addConnection`, `addAnnotation`, `fitContainerToChildren`. The nested
  shapes (`InteractiveCanvasObject`, geometry, connection endpoints…) get first-pass
  schemas mirroring `schema.ts`'s hand validators — as strict as is safe, loosening where
  the hand validators are tolerant.
- `CANVAS_AGENT_PATCH_OPERATIONS: readonly [{ type, description, params: TObject }]` —
  the enumeration the design doc's sketch imports.
- Compile-time sync: `Static<typeof X>` assignability asserts against the existing union
  members, so schema/type drift fails `tsc`.
- `@sinclair/typebox` added to the canvas package deps.
- Submodule mechanics: this lands as a canvas-repo commit/PR first; docs-system then bumps
  the submodule pointer. (The two repos version together in this workflow already.)

Explicit **non-goals** (first pass): no new operations, no rewrite of
`validateInteractiveCanvasDocument`, no change to the server reducer's semantics.

### 5.2 Workstream B — the docs-model canvas bundle's `actions/`

- `actions/lift.ts`: `liftCanvasOperations(CANVAS_AGENT_PATCH_OPERATIONS)` → one
  `ComponentAction` per op: `action: "canvas.<opType>"` (the naming gap is real and
  handled here: patch ops are bare `addObject`; the lift adds the `canvas.` prefix and the
  server strips it back off), `params` = the imported schema **by reference** (served
  verbatim), `forward: { authority: "canvas" }`.
- Import is a **value import of `@codecaine-ai/canvas/agent-schema` only** — a new leaf
  module with no React/reducer imports, so docs-model purity holds (import-boundaries
  passes today; a follow-up rule addition to import-boundaries.test.ts pins that
  docs-model may import canvas *only* via `/agent-schema` — cheap insurance, listed in tests).
- docs-model `package.json` gains the `@codecaine-ai/canvas` workspace dep.
- Boot check 3 already covers: forward authority `"canvas"` ∈ known authorities.

### 5.3 Workstream C — docs-server routing (A4)

In `applyDocOpsToBundle`'s caller path (`store.applyDocOps` / `routes.ts /api/ops`):

- **Batch rule (proposal — Ford sign-off at P3 review):** a request whose ops contain a
  forward-marked `blockAction` must contain **exactly that one op**. Mixed doc+forward
  batches are refused 400 with a clear issue (`$.ops`: "forwarded actions must be sent
  alone") — atomicity across two authorities is not promisable, so we don't fake it.
- Routing: load the doc bundle (existing path), find `op.blockId`, require
  `block.type === "canvas"`, resolve the sidecar from `props.canvasId ?? props.src`
  (the exact resolution `GET /api/canvas-by-doc` already uses), strip the `canvas.` prefix,
  build `CanvasAgentPatchOperation`, and call the existing `canvas_apply_patch` core
  (`agent-tools.ts:278-350`) — sidecar lock, canvas-hash staleness, draft lock, whole-doc
  re-validation, snapshot ledger, all unchanged (D6: undo = authority's mechanism).
- **Hash semantics (proposal):** body gains optional `expected_canvas_hash`; `expected_hash`
  keeps meaning the doc hash (checked to confirm the anchor block resolution isn't stale),
  `expected_canvas_hash` feeds `canvas_apply_patch`'s 409. Response for a forwarded op:
  `{ canvas, canvas_hash, patch_id }` (no `doc`/`hash` — the doc didn't change).
  `POST /api/undo` already replays canvas snapshots by patch id — works unchanged.
- Params are validated against the lifted schema **before** forwarding (same
  `checkParams` the dispatcher uses), so the canvas authority receives well-shaped ops.

### 5.4 P3 tests

- canvas repo: schema↔type sync (compile-time) + `Value.Check` fixtures for each op
  (valid + invalid) against the schemas.
- docs-model: lift correctness (5 actions, `canvas.*` keys, forward-marked, schemas
  reference-equal to the imports); discovery v2 now shows them indistinguishably;
  dispatcher refuses a forwarded action arriving through pure `applyOp`.
- docs-server: end-to-end forward via `/api/ops` (happy path mutates the sidecar and
  ledgers a snapshot; undo restores); canvas-hash 409; draft-lock 423; mixed-batch 400;
  unknown canvasId/src 4xx; non-canvas target block 400.

**Parallelization:** A first (one worker, `xhigh` — this is the real design work of P3).
B and C are then independent of each other (B: `low`, mechanical lift; C: `xhigh`,
routing + hash semantics) and merge under one integration review.

---

## 6. P4 — viewer mirror

**Goal:** `docs-viewer/src/components/<name>/` mirrors the 7 bundle names 1:1; the render
registry is a fold; the enforced mirror check exists. No behavior change — pixels, PM
schema, and convert.ts output identical.

### 6.1 File moves / extractions

- `docs-blocks/` → `components/`; shared `attrs.ts`, `base.tsx` stay at `components/` root.
- Folder mapping: `callout/` + `video/` fold **into `components/rich-text/`**;
  `code/` (incl. `CodeAnnotations.tsx`, `highlight.ts`), `mermaid/`, `file-tree/`,
  `structured-table/`, `interaction-surface/` keep their names.
- **Extractions out of `block-registry.ts`** (the real work — these have no component file
  today): paragraph/heading/list-item/quote/divider/image inline descriptors
  (`:449-513, 562-657`) → `components/rich-text/descriptors.tsx`; canvas (`:658-697`) →
  `components/canvas/descriptor.tsx`; the per-type prop guards (`:302-442`) move beside
  their component's descriptor.
- Each component folder exports `descriptors: DocBlockDescriptor[]`;
  `render/block-registry.ts` becomes the fold: assemble the Map from the 7 component
  exports, assert coverage of `DOC_BLOCK_TYPES` (the viewer-side half of boot check 4).
  `getDocBlockDescriptor` signature unchanged — `DocBlockRenderer`, `DocsBlockLibrary`,
  `node-views.tsx` untouched.
- `describeDocBlocksForAgent()` + the deprecated flavour alias: **deleted** (superseded by
  discovery v2 in P2; zero non-test consumers verified). Its test block goes with it.
- Editor nodes: per-type PM node classes move to `components/<name>/editor-nodes.ts`
  (rich-text gets its five text-block nodes + divider/image/video atoms; code gets its
  text-block node; mermaid/file-tree/structured-table/interaction-surface/canvas get
  their atom). `editor/core/schema.ts`
  keeps: `DocBlockText`, `blockAttrs`, the `NODE_TYPE_TO_BLOCK_TYPE` maps (central literal
  + a test asserting it matches the per-component node exports), and assembles
  `TEXT_BLOCK_NODES`/`ATOM_BLOCK_NODES` from the component folders. `convert.ts` and
  `SlashMenu.tsx` unchanged (SlashMenu's hardcoded insertable list is UX policy, not
  contract — noted in §9).

### 6.2 The mirror check

`docs-viewer/src/__tests__/component-mirror.test.ts`: `readdir(src/components)` minus
shared files === `ALL_COMPONENTS.map(c => c.manifest.name)`, exactly, both directions.
(Test-time is the honest "boot" for a component library; the render-registry fold's
coverage assert is the runtime half.)

### 6.3 P4 tests

- Existing per-block render tests move with their folders (import-path-only diffs).
- `block-registry.test.ts`: registry-fold coverage stays; `describeDocBlocksForAgent`
  suite deleted; guard tests re-pointed to component files.
- Editor suites (`convert`, `DocEditor`, `SlashMenu`, `input-rules`, `keymap`) must pass
  **unmodified** — they are the proof the PM schema didn't shift.

**Parallelization:** skeleton first (registry fold + folder scaffold, one worker,
`xhigh`), then up to 7 parallel per-component move/extract workers (`low` for the five
that already have component files; `xhigh` for rich-text and the editor-nodes split),
then the mirror test + integration pass.

---

## 7. Phase-gate summary

| Phase | Ships | Proof it's safe |
|---|---|---|
| P1 | bundles, TypeBox, folds, boot checks, corpus-clean | 3 goldens byte-equal; monolith tests green on compat; exports map diff empty |
| P2 | discovery v2, strict writes, tolerant reads | v2 suite; strict/tolerant behavior tests; corpus still clean; self-docs updated |
| P3 | canvas agent schema (canvas repo), lifted `canvas.*` forwards, /api/ops routing | schema↔type compile sync; e2e forward + undo; discovery shows canvas.* |
| P4 | viewer mirror, registry fold, mirror check | editor/convert suites unmodified-green; mirror test; render tests green |

Each phase = one PR series, independently revertable, `doc.json` bytes untouched by all
four (corpus-drift content fixes in P1 are explicitly enumerated exceptions).

---

## 8. Risks

1. **Discovery v1 byte-stability through P1** hinges on deriving `BlockActionParamSpec[]`
   from schemas exactly. Mitigated twice (golden + derivation unit test); worst case the
   derivation keeps a per-action literal override, which is still deleted in P2.
2. **Projection byte-stability**: the orchestrator split touches every projection path.
   The corpus golden + fixture tests make regressions loud; the risk is corpus coverage
   gaps (canvas/image/video appear only in the fixture — fixture is in the golden set).
3. **Closed schemas vs. unknown reality** (A2): the corpus is small (9 docs) and the
   canvas *sibling project's* docs — the coercion path's raison d'être — are not in this
   repo's test corpus. A sibling doc with legacy props will load fine (tolerant reads)
   but refuse edits post-P2 until cleaned. Accepted consequence of A2; the refusal
   message carries the exact issue paths, so cleanup is guided.
4. **TypeBox becomes load-bearing in a zero-dep package.** Pinned minor version; schemas
   are plain JSON-compatible objects so the blast radius of a future swap is `define.ts`
   plus the `Value`/`TypeCompiler` call sites.
5. **Submodule coupling in P3**: docs-system P3 blocks on a canvas-repo change landing
   and the pointer bump. Sequenced explicitly (5.1 before 5.2/5.3) so nothing in
   docs-system half-lands.
6. **Compat-layer drift**: the shims in `compat.ts` could quietly diverge from bundle
   truth. They're all folds (except the one literal), and the monolith test runs against
   them until P2/P4 retire the consumers.
7. **Module-load boot checks throw in every consumer** — including the viewer's client
   bundle and tests. Intentional (drift should be unmissable), but it means a broken
   registry breaks *everything* at import time; the pure `collectRegistryIssues` keeps
   that debuggable.

---

## 9. Open questions (surfaced, not silently decided)

Deliberate proposals in this plan that deviate from or go beyond the design doc — each is
flagged at its phase's review gate rather than needing an answer now:

1. **Canvas `validateBlockProps` stays through P1, dies in P2** (§3.3) — deviation from
   the design doc's combined "after P1/P2" file map, for per-phase behavior stability.
2. **`heading.level` optional (default 2), `image.src` required** (§3.2) — sketch vs.
   tolerated reality; resolution rule: match what projection/viewer tolerate, tighten only
   with corpus evidence. Confirm at P1 review.
3. **Discovery v2 leaf shape** (§4.1) — D8 fixed the top level; the per-type/per-action
   field names are this plan's proposal. Confirm at P2 review.
4. **No advisory-issues channel for tolerant reads in P2** (§4.3) — D8a says read issues
   are "advisory", but nothing consumes advisories yet; building the channel is deferred
   until something does.
5. **split/merge results are not schema-validated in P2** (§4.2) — D8a letter; props are
   copied from valid blocks. Confirm this reading.
6. **P3 batch rule** — forwarded action must travel alone in `/api/ops` (§5.3); and
   **`expected_canvas_hash`** as the staleness transport. Both need Ford's eyes at P3
   review before the route contract ships.
7. **genericOps prose double-home** (§4.1) — discovery.ts holds the agent-facing copy of
   the doc-ops docs; fully single-sourcing (generating one from the other) is left as a
   later cleanup.
8. **`BLOCK_ACTIONS`/`getBlockAction`/`listBlockActions` live on indefinitely** as folds
   (§4.4) — cheap and stable; delete only if Ford wants the legacy names gone post-P4.
9. **SlashMenu + `NODE_TYPE_TO_BLOCK_TYPE` stay centralized in P4** (§6.1) — the viewer
   mirror moves renderers and PM nodes; insertable-types UX policy and the node-name map
   remain central literals with sync tests. Componentizing them further is future work.
10. **`view` stays a plain string in CanvasState** (§3.2) — the design sketch's
    `CanvasViewCrop` structure would be new invention; first pass mirrors stored reality.
    Revisit inside P3's workstream A if the canvas slice wants to own a structured crop.
