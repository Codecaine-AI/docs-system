The waterfall component owns one type of the Block vocabulary: `waterfall`, the process-flow diagram block — the virtual form of a hand-drawn nested arrow flow. A block stores a typed recursive step tree in `steps`; the arrow-tree notation is the text form of that tree — `serializeWaterfall` writes it for the agent surface, `parseWaterfall` turns it back into steps on bulk import.

- Model code: `packages/docs-model/src/components/waterfall/`.

- Doc renderer: `packages/docs-viewer/src/components/waterfall/`.

It is the vocabulary's third diagram type, and the three split by question:

- canvas

  - How things relate — spatial boards of shapes, links, and embeds.

- sequence

  - Exact exchanges — who sends what to whom, in what order.

- `waterfall`

  - How a process flows end to end — arrow steps, nested sublayers, and clarification notes on one rail.

- file-tree

  - Not a diagram type, but the adjacent call: reach for it when the nested structure is files, not steps.

## Example

A live block — the run-mode loop of the Melee decomp harness: one root, four arrow steps, nested sublayers, and two clarification notes that render as one bulleted card.

```waterfall
Run mode
     -> Get epoch-size candidates from the ranked worker system
          -> Exclude locked, cooled-down, or unschedulable work
          -> Keep enough ready work to feed the worker pool
     -> Drain the epoch with workers
          -> Spawn workers through the kernel until the epoch is drained
          -> Each worker gets its own isolated worktree
          > workers produce tentative evidence
          > the epoch boundary makes the map authoritative again
     -> Finish the epoch
          -> Run the full build
          -> Move every item to its authoritative lane
     -> Continue
          -> Repeat until the operator stops or the run bound is reached
```

## Notation

The arrow-tree notation is the block's plain-text form: `serializeWaterfall` writes it from the step tree and `parseWaterfall` parses it on bulk import, both in `packages/docs-model/src/components/waterfall/lib.ts`. Six rules cover all of it:

- Root line

  - A line with no arrow prefix starts a flow; the parser returns a forest, so one block can carry multiple roots.

- `-> step`

  - An arrow line is one step of the flow.

- Indentation = sublayers

  - A line's depth is the rank of its indent width among the distinct widths seen so far, sorted ascending.

  - Irregular indentation still nests, and a depth already assigned never changes when a new width appears later.

- Backticks

  - A backtick-wrapped span is a code value; the render gives it a code chip.

- `> note`

  - A `>` line is a clarification note on the step above it, not a step of its own.

  - Consecutive `>` lines group into one note card, rendered as bullets.

- Blank lines are ignored.

## State Schema

The State schema contract element — all state lives in typed props:

**WaterfallState** — packages/docs-model/src/components/waterfall/state.ts#WaterfallState

```
steps: WaterfallStep[]  # Recursive step tree — the block's entire state.
  text: string  # Step text; backticks mark code values.
  kind?: "step" | "note"  # "note" marks a clarification leaf; omitted reads as "step".
  steps?: WaterfallStep[]  # Nested substeps; notes never carry them.
```

```json
{
  "steps": [
    {
      "text": "Drain the epoch with workers",
      "steps": [
        {
          "text": "Each worker gets its own isolated worktree"
        },
        {
          "text": "workers produce tentative evidence",
          "kind": "note"
        }
      ]
    }
  ]
}
```

- `WaterfallState` in `packages/docs-model/src/components/waterfall/state.ts` defines the closed one-prop schema; `additionalProperties: false` rejects anything else.

- `steps` is the whole state: a recursive `WaterfallStep` tree — `{ text, kind?, steps? }`, where `kind` is `"step"` or `"note"` and omitted reads as `"step"`.

- Two omissions are deliberate: no title — a heading block above the waterfall carries one — and no stored text form — the arrow-tree notation exists only for import and the agent projection.

- `check()` rejects a `kind: "note"` step that carries child steps — notes are leaves.

- The block stores structure, not layout: no depths, no geometry enters the doc — depth derives from nesting at read time.

- The type carries no delta text (`carriesText: false`).

- `readWaterfallStepTree` reads `steps` tolerantly — malformed entries are skipped, never thrown on.

## Typed Actions

Five actions instantiate the Typed actions contract element:

**waterfall — actions**

```
waterfall.setSteps(steps: WaterfallStep[]) -> props patch: { steps }  # Bulk replace: swap the entire step tree for the given steps — parse arrow-tree notation with parseWaterfall to build the tree from text.
  steps: WaterfallStep[]  # Complete replacement step tree; an empty array empties the waterfall.
waterfall.insertStep(path: number[], text: string, kind?: "step" | "note") -> props patch: { steps }  # Insert a step at an index path: the last element is the insert position among the addressed sibling list.
  path: number[]  # Index path; [i] inserts at position i among the roots, [a, ..., i] at position i under the step addressed by the prefix.
  text: string  # Step text; backticks mark code values.
  kind?: "step" | "note"  # Step kind; "note" is a clarification leaf. Default "step".
waterfall.setStepText(path: number[], text: string) -> props patch: { steps }  # Replace the text of the step at an index path.
  path: number[]  # Index path of the step, e.g. [0, 2] for the third child of the first root.
  text: string  # Replacement step text; backticks mark code values.
waterfall.removeStep(path: number[]) -> props patch: { steps }  # Remove the step at an index path, together with its entire subtree.
  path: number[]  # Index path of the step to remove, e.g. [0, 2].
waterfall.moveStep(from: number[], to: number[]) -> props patch: { steps }  # Move the step at from (with its subtree) to the insert position to — to is interpreted against the tree after the step is removed.
  from: number[]  # Index path of the step to move.
  to: number[]  # Insertion index path (last element = insert position), resolved after the step is detached.
```

- Each action is one file in `packages/docs-model/src/components/waterfall/actions/`.

- Params validate against the action's TypeBox schema before `apply()` runs; each returns a shallow props patch.

- `waterfall.setSteps` is the bulk edit: it replaces the entire step tree in one validated call — an agent still edits by rewriting what it reads.

- The four step actions address by index path: elements walk `steps` from the root — `[0, 2]` is the third child of the first root — and insert paths end with the insert position.

- `waterfall.moveStep` resolves `to` after the moved step is detached, so a move within one sibling list uses post-removal indices.

- Unresolvable paths, out-of-range insert positions, and inserts or moves under a note reject in the house pattern — `{ ok: false, issues }` — because notes are leaves.

## Doc Renderer

The Doc renderer contract element: `WaterfallDocsBlock` in `packages/docs-viewer/src/components/waterfall/WaterfallDocsBlock.tsx`, wired through the descriptor in the same folder:

- Render loop

  - `readWaterfallSteps` derives depth-computed nodes from the step tree; the viewer never parses, and the forest draws as monospace text.

  - The stylesheet injects once per document; the block scrolls in its own overflow container at a 640 px minimum width.

  - A block with no steps renders the placeholder line `empty waterfall — no steps yet`.

- One ink, one rail

  - Every flow is free text on one connected rail: a trunk drops from each parent, turns a rounded elbow into each child, and runs into an open-V arrowhead whose tip lands just before the text.

  - Rail geometry is var-driven — private `--wf-indent`, `--wf-arrow-gap`, `--wf-gap`, `--wf-line`, `--wf-stroke`, `--wf-arrow` — indent sets the per-level inset and the elbow's left edge, arrow-gap is the distance from the arrowhead tip to the first letter, and the elbow lands on the first-line center while the trunk overlaps into both sibling gaps, so segments always meet.

  - The elbow's flat run is derived — `indent − arrow-gap − arrow/2`, clamped at zero — so it ends in the arrowhead's open back and the two stay connected at any knob values.

  - Every geometry var reads a style-rail token with the prototype default as fallback: `--docs-waterfall-indent`, `--docs-waterfall-row-gap`, `--docs-waterfall-arrow-gap`, `--docs-waterfall-line-height`, `--docs-waterfall-arrow-size`, `--docs-waterfall-stroke`; step text size reads `--docs-waterfall-text-size`.

  - No kind colors, no icons, no collapse — the simplicity is deliberate, carried over from the pen-and-paper prototype.

- Hierarchy by weight

  - Root lines render heaviest, depth-one steps semibold, and depth three and deeper dims to a 78% mix of the ink.

  - `Repeat`, `While`, and `For each` at the start of a segment and `until` anywhere in it render bold as keywords.

  - Backtick spans render as code chips on a muted background.

- Notes

  - A note step renders as a bordered card — the component's only box — hung under its step, deliberately off the rail: no elbow, no arrowhead.

  - Consecutive note siblings collapse into one card, each note a bullet in its list.

  - Note text renders at the step ink and step text size by default — `--docs-waterfall-note-fg` defaults to the ink, `--docs-waterfall-note-text-size` to the text size — so the card keeps only its fill and border.

- Editor surface

  - The block is a non-editable atom leaf (`docWaterfall` in `editor-nodes.ts`); the shared atom node view reuses the same descriptor, so edit mode shows the same render as reading.

## Agent Renderer

The Agent renderer contract element: the markdown projection in `agent-view.ts` is a `waterfall` fence whose body is `serializeWaterfall` over the step tree. Projected, the live Example above is:

```
```waterfall
Run mode
     -> Get epoch-size candidates from the ranked worker system
          -> Exclude locked, cooled-down, or unschedulable work
          -> Keep enough ready work to feed the worker pool
     -> Drain the epoch with workers
          -> Spawn workers through the kernel until the epoch is drained
          -> Each worker gets its own isolated worktree
          > workers produce tentative evidence
          > the epoch boundary makes the map authoritative again
     -> Finish the epoch
          -> Run the full build
          -> Move every item to its authoritative lane
     -> Continue
          -> Repeat until the operator stops or the run bound is reached
```
```

- The info string is bare `waterfall` — the block has no title; a heading above carries one.

- The fence body is serialized arrow-tree notation — root lines bare, `-> ` steps at 5-space indents, `> ` notes — parse a rewrite with `parseWaterfall` and write it back through `waterfall.setSteps` to round-trip the structure.

- Malformed props project an empty fence body rather than crashing.

## Theme

The Theming contract element: the renderer paints from fifteen `--docs-waterfall-*` tokens, defined in both theme blocks of `packages/docs-workbench/web/src/theme/semantic.css`; corner radii derive from `--radius`.

- Style rail

  - Fourteen knobs under Theme → Components → Waterfall: six color — Ink, Rail, Note text, Note background, Note border, Code background — plus eight length sliders.

  - Length sliders and ranges: Indent 16–72 px, Row gap 0–24 px, Arrow gap 0–16 px, Line height 16–40 px, Text size 10–18 px, Note text size 10–18 px, Arrow size 3–12 px, Stroke 0.5–4 px.

  - Backed by the `waterfall` entry in `THEME_TOKEN_REGISTRY` (`theme-folders.ts`) and the `waterfall` picker file in the Components section.

- Derived deep ink

  - `--docs-waterfall-deep-ink` is a 78% color-mix of the ink — deliberately not a knob, so depth dimming tracks any ink change.

- Opaque rail

  - `--docs-waterfall-rail` is opaque by contract: overlapping elbow and trunk strokes double alpha at the joins.

  - Light `#b3b1ad`, dark `#5d6266`.

| CSS variable | Default | Styles |
| --- | --- | --- |
| --docs-waterfall-ink | --docs-viewer-text-body | Text ink — title and step lines |
| --docs-waterfall-deep-ink | 78% mix of the ink | Step text at depth three and deeper |
| --docs-waterfall-rail | #b3b1ad light · #5d6266 dark | The rail — trunks, elbows, arrowheads |
| --docs-waterfall-note-fg | the ink | Note card text |
| --docs-waterfall-note-bg | --muted | Note card background |
| --docs-waterfall-note-border | --border | Note card border |
| --docs-waterfall-code-bg | --muted | Backtick code-chip background |
| --docs-waterfall-indent | 36px | Horizontal inset per nesting level — also the elbow's left edge |
| --docs-waterfall-row-gap | 7px | Vertical gap between sibling rows |
| --docs-waterfall-arrow-gap | 4px | Arrowhead tip to the first letter |
| --docs-waterfall-line-height | 22px | Step first-line height — the elbow centers on half of it |
| --docs-waterfall-text-size | 12.5px | Step text size |
| --docs-waterfall-note-text-size | the text size | Note card text size |
| --docs-waterfall-arrow-size | 6px | Arrowhead edge length |
| --docs-waterfall-stroke | 1.5px | Rail stroke width — trunks, elbows, arrowheads |

## Agent Adapter

The type uses the default adapter — no agent of its own; the contract is Agent adapter.

- The five typed actions ride `componentAction` ops in the seven-op doc vocabulary (`packages/docs-model/src/doc-ops.ts`).

- A `componentAction` names the registry key (`"waterfall.setSteps"`), resolves the action, validates params, and runs `apply()` against the target block.

- The returned props patch executes through the existing `updateBlock` path — merge semantics are single-sourced, the block id is preserved, and the inverse is the usual `updateBlock` inverse.

- Structural edits ride the generic ops — `insertBlock`, `updateBlock`, `deleteBlock`, `moveBlock`. `splitBlock` and `mergeBlocks` never apply: the type carries no text.
