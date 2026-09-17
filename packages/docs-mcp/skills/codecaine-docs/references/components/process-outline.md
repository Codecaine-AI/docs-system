# process-outline

Generated from Codecaine Docs sources. Snapshot: `sha256:acd72632b05751ccd41e5ab29e829ff35ee6b28293ad4f81ce94207cd98207f2`. Refresh the installation to regenerate these files.

Use Process Outline for the expected execution path, with nested phases and actor-and-action step names that can be compared with a trace.

Example: Outline discovery, guidance loading, editing, validation, and completion, with failure notes where needed.

Canonical document: `10-system-design/40-block-vocabulary/90-process-outline`.

Process Outline explains an ordered process through nested steps and short supporting notes. The stored steps form a typed recursive tree; notation supplies the import and agent projection forms.

For examples of this component's API, show the relevant state, real operation signature, and actual result when they clarify the contract. Ordinary process explanations need only the outline and useful context. Verify behavior against source and keep descriptions non-redundant.

It is the vocabulary's third diagram type, and the three split by question:

- canvas

  - Spatial relationships between shapes, links, and embeds.

- sequence

  - Exact exchanges: who sends what to whom, and in what order.

- `process-outline`

  - End-to-end phases, nested actions, and short clarification notes.

- file-tree

  - Not a diagram type, but the adjacent call: reach for it when the nested structure is files, not steps.

## Example

This example describes the Melee harness run loop. It contains four phases, nested actions, and two supporting notes.

```process-outline
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

Process-outline notation is the block's plain-text form: `serializeProcessOutline` writes it from the step tree and `parseProcessOutline` parses it on bulk import, both in packages/docs-model/src/components/process-outline/lib.ts. Seven rules cover all of it:

- Root line

  - A line with no arrow prefix starts a flow. The parser accepts multiple roots for compatibility, but author one named process per block and nest its phases beneath that root. Put independent processes in separate blocks.

- `-> step`

  - An arrow line is one step of the flow.

- `=> step`

  - A trace-marked line names a step corresponding to a real trace event. It can contain code chips and nested steps.

  - The marker replaces `->` and it marks root lines too, so a trace-marked root reads `=> text` rather than bare.

- Indentation = sublayers

  - A line's depth is the rank of its indent width among the distinct widths seen so far, sorted ascending.

  - Irregular indentation still nests, and a depth already assigned never changes when a new width appears later.

- Backticks

  - A backtick-wrapped span is a code value; the render gives it a code chip.

- `> note`

  - A `>` line is a clarification note on the step above it, not a step of its own.

  - Consecutive `>` lines group into one note card, rendered as bullets.

- Blank lines are ignored.

## Writing Rules

Write one named process per outline. Nest its phases beneath that shared parent so readers can follow one connected tree. Give independent processes separate diagrams. Steps and supporting notes each carry one bite-sized action or idea.

The process-outline.single-parent lint enforces this authoring structure at completion: exactly one named, non-note root with at least one action child. Empty or unfinished outlines remain editable in drafts but fail completion checks. The parser retains support for older multi-root data so it can be opened and repaired. Wrap related phases in a meaningful parent; split independent processes into separate blocks.

- Mark the trace events

  - An outline reads as the trace skeleton plus its smaller pieces: mark the steps that correspond to real trace events with `=>`.

  - Keep unmarked steps to the connective flow between those events. Do not narrate code.

- Verb-first steps

  - Write one short action or idea per arrow line, usually ten words or fewer. Use present tense and a concrete verb. Split multiple sentences or independent actions into separate steps.

  - Move explanations into notes. Keep conditions that change whether an action happens explicit in the step or its parent.

- Prose lives in notes

  - Keep each supporting note bite-sized: one useful fact about the step. Explain a constraint, reason, or expected result without repeating the step label. Split separate facts into separate note bullets.

  - Notes are prose, and notes never have children: a note that wants substructure is a step.

- Branches are steps

  - A branch or a failure path is its own step, never a trailing clause on the step it hangs off.

- Loops name their exit

  - A loop leads with `Repeat`, `While`, or `For each`, and names its exit with `until`.

- Backticks are the only chip syntax

  - Use backticks for code identifiers and actors such as Worker or Operator. Chips use the line's depth color and can contain multiple words.

  - Name an actor when it changes, not on every step.

- Split relentlessly

  - Split compound actions into steps and keep explanations in short notes. Use nesting to clarify the process, not to manufacture depth. Every step and note is visible by default; presentation must not depend on truncating prose.

Compare one overloaded step with short actions and a separate explanation:

```process-outline
Before
     -> Spawn a worker in an isolated worktree so tentative evidence never reaches the map, and retry the item if the build fails
```

```process-outline
After
     -> Spawn a `Worker` in an isolated worktree
     > the worktree keeps tentative evidence off the authoritative map
     -> Run the full build
     -> Retry the item once when the build fails
```

## State Schema

The state schema stores the complete outline in typed props:

**ProcessOutlineState** — packages/docs-model/src/components/process-outline/state.ts#ProcessOutlineState

```
steps: ProcessOutlineStep[]  # Recursive step tree, the block's entire state.
  text: string  # Step text; backticks mark code values.
  kind?: "step" | "note"  # "note" marks a clarification leaf; omitted reads as "step".
  trace?: boolean  # Marks a step corresponding to a real trace event. Notes cannot carry this flag.
  steps?: ProcessOutlineStep[]  # Nested substeps; notes never carry them.
```

```json
{
  "steps": [
    {
      "text": "Run the builder",
      "trace": true,
      "steps": [
        {
          "text": "Read the approved brief"
        },
        {
          "text": "Edit the allowed source"
        },
        {
          "text": "Only the captured renderer can change.",
          "kind": "note"
        }
      ]
    }
  ]
}
```

- `ProcessOutlineState` in packages/docs-model/src/components/process-outline/state.ts defines the closed one-prop schema; `additionalProperties: false` rejects anything else.

- Each recursive step contains text, an optional kind, an optional trace flag, and optional child steps. An omitted kind means step.

- A heading above the outline supplies its title. Notation is generated for import and projection rather than stored alongside the tree.

- Validation rejects children or trace marks on notes. Notes are explanatory leaves.

- Depth derives from nesting. The document stores no layout geometry.

- The type carries no delta text (`carriesText: false`).

- The tolerant reader skips malformed entries and returns fresh objects.

## Typed Actions

Five actions instantiate the Typed actions contract element:

**process-outline, actions**

```
process-outline.setSteps(steps: ProcessOutlineStep[]) -> ProcessOutlinePatch  # Bulk replace: swap the entire ordered step tree for the given steps, parse process-outline notation with parseProcessOutline to build the tree from text.
  steps: ProcessOutlineStep[]  # Complete replacement step tree; an empty array empties the process outline.
  Returns ProcessOutlinePatch:
    steps: ProcessOutlineStep[]  # Recursive step tree, the block's entire state.
      text: string  # Step text; backticks mark code values.
      kind?: "step" | "note"  # "note" marks a clarification leaf; omitted reads as "step".
      trace?: boolean  # Marks a step corresponding to a real trace event. Notes cannot carry this flag.
      steps?: ProcessOutlineStep[]  # Nested substeps; notes never carry them.
process-outline.insertStep(path: number[], text: string, kind?: "step" | "note", trace?: boolean) -> ProcessOutlinePatch  # Insert a step at an index path: the last element is the insert position among the addressed sibling list.
  path: number[]  # Index path; [i] inserts at position i among the roots, [a, ..., i] at position i under the step addressed by the prefix.
  text: string  # Step text; backticks mark code values.
  kind?: "step" | "note"  # Step kind; "note" is a clarification leaf. Default "step".
  trace?: boolean  # Marks a step corresponding to a real trace event. Notes cannot carry this flag.
  Returns ProcessOutlinePatch:
    steps: ProcessOutlineStep[]  # Recursive step tree, the block's entire state.
      text: string  # Step text; backticks mark code values.
      kind?: "step" | "note"  # "note" marks a clarification leaf; omitted reads as "step".
      trace?: boolean  # Marks a step corresponding to a real trace event. Notes cannot carry this flag.
      steps?: ProcessOutlineStep[]  # Nested substeps; notes never carry them.
process-outline.setStepText(path: number[], text: string, trace?: boolean) -> ProcessOutlinePatch  # Replace the text of the step at an index path.
  path: number[]  # Index path of the step, e.g. [0, 2] for the third child of the first root.
  text: string  # Replacement step text; backticks mark code values.
  trace?: boolean  # Set or clear the trace mark. Omit to preserve it. Notes cannot be trace-marked.
  Returns ProcessOutlinePatch:
    steps: ProcessOutlineStep[]  # Recursive step tree, the block's entire state.
      text: string  # Step text; backticks mark code values.
      kind?: "step" | "note"  # "note" marks a clarification leaf; omitted reads as "step".
      trace?: boolean  # Marks a step corresponding to a real trace event. Notes cannot carry this flag.
      steps?: ProcessOutlineStep[]  # Nested substeps; notes never carry them.
process-outline.removeStep(path: number[]) -> ProcessOutlinePatch  # Remove the step at an index path, together with its entire subtree.
  path: number[]  # Index path of the step to remove, e.g. [0, 2].
  Returns ProcessOutlinePatch:
    steps: ProcessOutlineStep[]  # Recursive step tree, the block's entire state.
      text: string  # Step text; backticks mark code values.
      kind?: "step" | "note"  # "note" marks a clarification leaf; omitted reads as "step".
      trace?: boolean  # Marks a step corresponding to a real trace event. Notes cannot carry this flag.
      steps?: ProcessOutlineStep[]  # Nested substeps; notes never carry them.
process-outline.moveStep(from: number[], to: number[]) -> ProcessOutlinePatch  # Move the step at from (with its subtree) to the insert position to, to is interpreted against the tree after the step is removed.
  from: number[]  # Index path of the step to move.
  to: number[]  # Insertion index path (last element = insert position), resolved after the step is detached.
  Returns ProcessOutlinePatch:
    steps: ProcessOutlineStep[]  # Recursive step tree, the block's entire state.
      text: string  # Step text; backticks mark code values.
      kind?: "step" | "note"  # "note" marks a clarification leaf; omitted reads as "step".
      trace?: boolean  # Marks a step corresponding to a real trace event. Notes cannot carry this flag.
      steps?: ProcessOutlineStep[]  # Nested substeps; notes never carry them.
```

- Params validate against the action's TypeBox schema before `apply()` runs; each returns a shallow props patch.

- setSteps replaces the entire tree with validated steps. Agents can also use the individual step actions.

- An index path walks child arrays from the root. For example, [0, 2] names the third child of the first root. An insertion path ends with the insertion position.

- `process-outline.moveStep` resolves `to` after the moved step is detached, so a move within one sibling list uses post-removal indices.

- Invalid paths and insertions beneath notes return validation issues.

## Doc Renderer

The Doc renderer contract element, `ProcessOutlineDocsBlock`:

- Render loop

  - `readProcessOutlineSteps` derives depth-computed nodes from the step tree; the viewer never parses, and the forest draws as monospace text.

  - The stylesheet is shared within the document. The approved Continuous Outline fills its lane, uses a faint background and rounded top and bottom boundaries, and wraps text within narrow containers.

  - A block with no steps renders the placeholder line `empty process outline — no steps yet`.

- One ink, one rail per depth

  - One trunk connects the process parent to its ordered phases. Rounded elbows and open arrowheads connect each child. The approved Continuous Outline uses 1.5px strokes and distinct branch colors by depth.

  - Indentation and line height set the branch geometry. The approved tuning revision explicitly overrides trunk, elbow, and arrowhead widths together so the line-thickness control changes the entire connection.

  - The approved tuning values assign six depth colors. A deeper node without an explicit override inherits its ancestor’s color. Colors identify nesting, not actors or runtime conditions.

  - Elbows and arrowheads share the same indentation variables. Their overlap keeps the visible connections joined.

  - Every geometry var reads a style-rail token with the prototype default as fallback: `--docs-process-outline-indent`, `--docs-process-outline-row-gap`, `--docs-process-outline-arrow-gap`, `--docs-process-outline-line-height`, `--docs-process-outline-arrow-size`, `--docs-process-outline-stroke`, plus `--docs-process-outline-branch-gap` for depth-one phase groups and `--docs-process-outline-root-gap` between root steps; step text size reads `--docs-process-outline-text-size`, the root line reads `--docs-process-outline-root-text-size`, and the empty placeholder reads `--docs-process-outline-empty-text-size`.

  - The current renderer shows all content. Colors identify depth, not actors, conditions, or step kinds.

- Hierarchy by weight

  - Root lines render heaviest, depth-one steps semibold, and depth three and deeper dims to a 78% mix of the ink.

  - `Repeat`, `While`, and `For each` at the start of a segment and `until` anywhere in it render bold as keywords, in a rust accent held deliberately outside the depth cycle so loop control reads the same at every level.

  - Backticks render code chips in the line's depth color. Multi-word spans remain one chip.

- Notes

  - Supporting notes appear as short bullet lines with a vertical guide. Note text, dots, and that guide have separate color controls in Variator. Every authored note remains visible.

  - Consecutive note siblings collapse into one card, each note a bullet in its list.

  - Notes have their own text size and line height. They remain visually subordinate to action lines and visible by default.

- Editor surface

  - The ProcessOutlineNodeView edits the same renderer through renderLine and renderEmpty hooks. Enter splits a line, Tab indents, Shift+Tab outdents, and line ranges support selection, copy, cut, and deletion. Edits use typed component actions and the outer editor history.

## Agent Renderer

The Agent renderer contract element: the markdown projection is a `process-outline` fence whose body is `serializeProcessOutline` over the step tree. Projected, the live Example above is:

```
```process-outline
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

- A bare process-outline fence identifies the notation. A heading outside the block supplies its title.

- Serialization emits bare roots, arrow steps, note markers, and trace markers with five spaces per depth. Parse notation into steps before using setSteps.

- Malformed props project an empty fence body rather than crashing.

## Theme

The theme registry retains the original Process Outline variables listed below. The approved Continuous Outline also embeds its saved Variator overrides for six branch colors, 1.5px strokes, and note colors. Those overrides take precedence over inherited theme values. The component’s design approval package records the exact values and their scope.

- Style rail

  - Theme controls expose text, rail, depth, loop, note, and chip colors together with spacing and size settings.

  - Length controls set indentation, gaps, line heights, text sizes, note spacing, and arrow geometry. Strength controls set note accents and chip mixes.

  - Backed by the `process-outline` entry in `THEME_TOKEN_REGISTRY` (theme-folders.ts) and the `process-outline` picker file in the Components section.

- Derived deep ink

  - Deep-step ink mixes the main ink at 78 percent by default.

- Opaque rail

  - The fallback rail color is opaque. Transparent overlapping strokes can create darker joins.

  - Light `#b3b1ad`, dark `#5d6266`.

| CSS variable | Default | Styles |
| --- | --- | --- |
| --docs-process-outline-ink | --docs-viewer-text-body | Text ink, title and step lines |
| --docs-process-outline-deep-ink | 78% mix of the ink | Step text at depth three and deeper |
| --docs-process-outline-rail | #b3b1ad light · #5d6266 dark | Fallback for the depth cycle, used wherever a cycle slot is missing |
| --docs-process-outline-cycle-1..5 | steel blue, sage, plum, slate teal, ochre | The depth cycle, one hue per nesting level, then it repeats |
| --docs-process-outline-keyword-fg | #a4552c light · #e2a07e dark | Loop keywords, outside the depth cycle on purpose |
| --docs-process-outline-note-fg | the ink | Note card text |
| --docs-process-outline-note-bg | #f2f1ed light · rgba(255,255,255,.045) dark | Note card fill, flat and muted, never depth-tinted |
| --docs-process-outline-note-border | --border | Note card border, and what the accented left rule mixes into |
| --docs-process-outline-code-bg | transparent | What the chip tint mixes over, set it opaque for a flat chip |
| --docs-process-outline-indent | 46px | Horizontal inset per nesting level, also the elbow's left edge |
| --docs-process-outline-row-gap | 12px | Vertical gap between sibling rows |
| --docs-process-outline-branch-gap | 20px | Row gap inside a depth-one phase group, does not cascade deeper |
| --docs-process-outline-root-gap | 30px | Separation between root steps |
| --docs-process-outline-arrow-gap | 4px | Arrowhead tip to the first letter |
| --docs-process-outline-line-height | 22px | Step first-line height, the elbow centers on half of it |
| --docs-process-outline-text-size | 12.5px | Step text size |
| --docs-process-outline-root-text-size | 13.5px | Root step text size |
| --docs-process-outline-empty-text-size | 12px | Empty-outline placeholder text size |
| --docs-process-outline-note-text-size | 11.5px | Note card text size |
| --docs-process-outline-note-line-height | 17px | Note card line height, bullet dots center on half of it |
| --docs-process-outline-note-inset | 10px | How far the note card is pulled in under its parent step |
| --docs-process-outline-note-rule-width | 2px | Width of the note card's accented left rule |
| --docs-process-outline-note-accent | 55 light · 60 dark | Depth-color strength in the note rule and bullet dots (unitless %) |
| --docs-process-outline-chip-tint | 13 light · 15 dark | Depth-color strength in the chip fill (unitless %) |
| --docs-process-outline-chip-ink-mix | 60 light · 70 dark | Depth-color strength in the chip label, mixed into the ink (unitless %) |
| --docs-process-outline-arrow-size | 6px | Arrowhead edge length |
| --docs-process-outline-stroke | 1.5px | Rail stroke width, trunks, elbows, arrowheads |

## Agent Adapter

Process Outline uses the default agent adapter and has no component-specific agent.

- The five typed actions ride `componentAction` ops in the seven-op doc vocabulary (packages/docs-model/src/doc-ops.ts).

- A `componentAction` names the registry key (`"process-outline.setSteps"`), resolves the action, validates params, and runs `apply()` against the target block.

- Typed actions return props patches through updateBlock. This preserves the block ID and the normal inverse operation.

- Structural operations insert, update, delete, or move the block. splitBlock and mergeBlocks do not apply because this block carries no delta text.

