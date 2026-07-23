The sequence component owns one type of the Block vocabulary: `sequence`, the UML-style sequence-diagram block. The block is only a reference — `src` (or `sequenceId`) points at a `SequenceDocument` owned by the external sequence engine (`external/sequence`); participants, messages, and style never enter the doc. Sequence diagrams are this block's whole territory — every other diagram type belongs to the canvas block.

The family is the vocabulary's flagship non-default agent-adapter case: its three typed actions carry `forward: { authority: "sequence" }` instead of a local `apply`, so diagram edits route to the sequence engine and come back validated. The JSON document is the source of truth; a compact text program is the agent-facing projection — agents rewrite the whole program, and the language carries no styling, no coordinates, and no ids.

## Example

A live block — the login flow from `assets/sequences/login-flow.sequence.json` — followed by the program projection of the same document:

<!-- sequence: assets/sequences/login-flow.sequence.json title="Login flow" -->

```
participant 1 text=user kind=actor
participant 2 text=login label="Login page"
participant 3 text=db label="Database server" stereotype=servlet

seq
  1 > 2 text="input(username, password)"
  2 > 3 text="fetch(username, password)"
  alt guard=fetching
    3 --> 2 text="end fetching"
    2 > 1 text=success
  else
    2 --> 1 text="incorrect input"
  opt guard="needs confirmation"
    2 -> 3 text=confirm
  note over=2 text="validates first"
```

## State Schema

`SequenceState` in the component's `state.ts` is a closed schema (`additionalProperties: false`) of three optional props:

**SequenceState** — packages/docs-model/src/components/sequence/state.ts#SequenceState

```
sequenceId?: string (min length 1)  # Central reference to a diagram living in Sequence Studio.
src?: string (min length 1)  # Sidecar path — docs-root-relative, or bundle-relative with a ./ prefix.
title?: string  # Display title.
```

```json
{
  "src": "assets/sequences/login-flow.sequence.json",
  "title": "Login flow"
}
```

- `carriesText: false`

  - The block carries no delta text: participants, messages, fragments, and style live in the referenced `SequenceDocument`, never in block state.

  - The program is a projection of that document, not a stored payload — nothing diagram-shaped is in the doc to drift.

- `src` over `sequenceId`

  - When both are set, the agent projection and the embed read `src` first.

## Typed Actions

Three actions, lifted at module load in `actions/lift.ts` from `SEQUENCE_AGENT_PATCH_OPERATIONS` in the engine's `agent-schema.ts` — schema truth stays in the sequence package; the lift strips only the envelope discriminant and prefixes the family name. Each rides a `componentAction` op as `sequence.<verb>` and carries `forward: { authority: "sequence" }` instead of a local `apply` — the forwarded shape of Typed actions.

**sequence — forwarded patch operations**

```
sequence.setProgram(program: string) -> forwarded to the sequence authority  # Replace diagram structure with a complete whole-program rewrite: every participant and item, never a patch. Styling never appears in the program.
sequence.setStyle(style: SequenceStylePatch) -> forwarded to the sequence authority  # Deep-merge visual style one level: element groups (surface, participant, lifeline, message, activation, fragment, note) merge per-field; null clears a field or a whole group; omitted fields are preserved.
sequence.setTitle(title: string) -> forwarded to the sequence authority  # Set the document title without changing structure or style.
```

`applySequenceOperations` in the engine's `actions.ts` gives each verb its semantics:

- `setProgram`

  - The program parses with `parseSequenceProgram`; a parse failure rejects the patch with per-line errors.

  - The document's `id` and stored `style` always survive the rewrite.

- `setStyle`

  - `mergeSequenceStyle`: shortcut fields replace, element groups merge per-field, `null` deletes a field or drops a whole group.

- `setTitle`

  - Replaces the title string; structure and style stay untouched.

### The Program Language

Language essentials: numbers are participant identity, `text=` is a display name. Arrows are `>` sync, `->` async, `-->` return. `alt`/`opt`/`loop` fragments take `guard=` and nest by indentation alone — there is no `end` keyword. `note` attaches `over`/`left`/`right` of a participant; activations are derived automatically. Styling lives in the document's separate style section, *never* in the program.

```
title "Order distribution"
participant 1 text=order label=Order
participant 2 text=careful label="Careful distributor"
participant 3 text=regular label="Regular distributor"
participant 4 text=messenger label=Messenger

seq
  loop guard="for each line item"
    alt guard="value > $15,000"
      1 > 2 text=dispatch
    else
      1 > 3 text=dispatch
  opt guard="needs confirmation"
    1 -> 4 text=confirm
```

## Doc Renderer

The viewer descriptor in `packages/docs-viewer/src/components/sequence/descriptor.tsx` renders the block through the host's `renderSequence` slot; with no host wired, a dashed placeholder card names the source instead.

- Slot chain

  - `DocBlockRenderer` (`DocBlockRenderer.tsx`) builds `renderSequence` from `DocsClientProvider`'s `sequenceEmbed` slot — the sequence counterpart of the canvas embed slot.

  - `resolveBundleSequenceSrc` canonicalizes the src first: a `./` prefix resolves against the doc bundle's own assets; anything else is docs-root-relative.

- Workbench host

  - `StandaloneSequenceEmbed` (`SequenceEmbed.tsx`) loads the sidecar through the serve/export data layer, validates with `validateSequenceDocument`, and renders the read-only `SequenceViewer` — no editing, no saving.

  - A `sequenceId` without a `src` renders an Open in Sequence Studio affordance instead of an inline diagram.

- Editor surface

  - The block is a non-editable atom leaf (`docSequence` in `editor-nodes.ts`); the shared atom node view reuses the same descriptor and slot, so edit mode shows the same embed as reading.

## Agent Renderer

The markdown projection in `agent-view.ts` is one comment line — a greppable reference, not the diagram:

```
<!-- sequence: assets/sequences/login-flow.sequence.json title="Login flow" -->
```

- The comment form

  - `src` wins over `sequenceId` as the source; `title="…"` appends only when a title is set.

  - `<!-- sequence: (missing src) -->` when no source is set.

- Content lives behind the reference

  - An agent that needs the diagram reads the `SequenceDocument` with `sequence_get` (`agent-tools.ts`) and writes back through the forwarded actions.

  - `parseSequenceProgram` and `serializeSequenceProgram` (`language/index.ts`) round-trip document and program, so the compact program is the agent-facing text of the diagram.

## Theme

The docs theme owns nothing here: `THEME_TOKEN_REGISTRY` (`theme-folders.ts`) has no sequence entry, and the default theme folder ships no `components/sequence.json` (theme folders: Theming). Diagram visuals live in the `SequenceDocument`'s own `style` section, edited through `sequence.setStyle` — see Theming for the contract this deviates from.

- `--docs-sequence-border`

  - The one doc-side hook: the placeholder card's border color, unregistered in the token registry, falling back to `--border`.

- Engine-side painting

  - The renderer paints from `--seq-*` CSS variables with its own defaults (`theme.ts`).

  - Document style overrides field by field: shortcut fields (`accent`, `fragmentAccent`, `participantFill`, `scale`) apply first; per-element groups override them per field.

- One styling channel

  - `setStyle` is the only way style changes; styling never rides the program.

## Agent Adapter

The flagship non-default case of Agent adapter: the sequence engine is the external authority, and the block's actions forward to it instead of patching props locally. Doc-side props (`src`, `sequenceId`, `title`) still edit through the generic ops; diagram content never does.

A forwarded action travels four steps:

1. The dispatcher validates params against the lifted TypeBox schema, then refuses to apply the op locally: a forwarded action "cannot be applied as a doc op" (`doc-ops.ts`).

2. `forwardSequenceAction` (`store.ts`) takes over under the doc bundle's path lock: doc-hash precondition first, then the target block must exist and be a `sequence` block.

3. The block's `src` resolves doc-relative to the sidecar path. Only sidecar references route; a central `sequenceId` reference is rejected.

4. `sequence_apply_patch` (`agent-tools.ts`) applies through `applySequenceOperations`, persists atomically, and stores the full prior snapshot as the undo inverse.

- Validation and undo hold for every editor

  - Human, host, or agent — every content write goes through the engine's own operations, so schema validation and the inverse snapshot apply no matter who edits.

- A registered authority

  - `"sequence"` is a registered entry in the model's `KNOWN_AUTHORITIES` (`checks.ts`); boot checks reject any action forwarding anywhere else.

- The processing agent

  - The adapter contract's target design adds a sequence-specialist processing agent whose context loader assembles the sequence source instead of the doc render alone; its writeback path is the forwarding above.
