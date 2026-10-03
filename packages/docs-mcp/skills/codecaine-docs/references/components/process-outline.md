# process-outline

Generated from Codecaine Docs sources. Snapshot: `sha256:df3a4be4499081f6aeab443ed890b96811fe78b263b4e16687f66296bf815cbf`. Refresh the installation to regenerate these files.

Use Process Outline for the expected execution path, with nested phases and actor-and-action step names that can be compared with a trace. Phases are short Title Case labels, and so is the root title. Substeps are sentence case actions.

Example: Outline discovery, guidance loading, editing, validation, and completion, with failure notes where needed.

Canonical document: `10-system-design/40-block-vocabulary/50-flow-and-diagrams/10-process-outline`.

Process Outline explains an ordered process through nested steps and short supporting notes. The stored steps form a typed recursive tree. Notation supplies the import and agent projection forms.

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

Two sibling types answer narrower questions: call-stack for one code path frame by frame, and component-tree for which component renders which.

## Example

This example describes the Melee harness run loop. It contains four phases, nested actions, and two supporting notes.

```process-outline
Run Mode
     -> Get Epoch-size Candidates From the Ranked Worker System
          -> Exclude locked, cooled-down, or unschedulable work
          -> Keep enough ready work to feed the worker pool
     -> Drain the Epoch With Workers
          -> Spawn workers through the kernel until the epoch is drained
          -> Each worker gets its own isolated worktree
          > workers produce tentative evidence
          > the epoch boundary makes the map authoritative again
     -> Finish the Epoch
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

  - A backtick-wrapped span is a code value. The render gives it a code chip.

- `> note`

  - A `>` line is a clarification note on the step above it, not a step of its own.

  - Consecutive `>` lines group into one note block, and each line renders as its own `//` aside.

- Blank lines are ignored.

## Writing Rules

Write one named process per outline. Nest its phases beneath that shared parent so readers can follow one connected tree. Give independent processes separate diagrams. Steps and supporting notes each carry one bite-sized action or idea.

The process-outline.single-parent lint enforces this authoring structure at completion: exactly one named, non-note root with at least one action child. Empty or unfinished outlines remain editable in drafts but fail completion checks. The parser keeps support for older multi-root data so it can be opened and repaired. Wrap related phases in a meaningful parent and split independent processes into separate blocks.

- Mark the trace events

  - An outline reads as the trace skeleton plus its smaller pieces: mark the steps that correspond to real trace events with `=>`.

  - Keep unmarked steps to the connective flow between those events. Do not narrate code.

- Verb-first steps

  - Write one short action or idea per arrow line, usually ten words or fewer. Use present tense and a concrete verb. Split multiple sentences or independent actions into separate steps.

  - Move explanations into notes. Keep conditions that change whether an action occurs explicit in the step or its parent.

  - Write the root title and each phase as a short Title Case label, and keep substeps as sentence-case actions. The `process-outline.phase-title-case` lint enforces this.

- Prose lives in notes

  - Keep each supporting note bite-sized: one useful fact about the step. Explain a constraint, reason, or expected result without repeating the step label. Split separate facts into separate note bullets.

  - Notes are prose. Notes never have children: a note that wants substructure is a step.

- Branches are steps

  - A branch or a failure path is its own step, never a trailing clause on the step it hangs off.

- Loops name their exit

  - A loop leads with `Repeat`, `While`, or `For each`, and names its exit with `until`.

- Backticks are the only chip syntax

  - Use backticks for code identifiers and actors such as Worker or Operator. A chip's text colour follows what the code is, and one chip can hold several words.

  - Name an actor when it changes, not on every step.

- Split relentlessly

  - Split compound actions into steps and keep explanations in short notes. Use nesting to clarify the process, not to manufacture depth. Every step and note is visible by default, and presentation must not depend on truncating prose.

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
  text: string  # Step text. Backticks mark code values.
  kind?: "step" | "note"  # "note" marks a clarification leaf. Omitted reads as "step".
  trace?: boolean  # Marks a step corresponding to a real trace event. Notes cannot carry this flag.
  steps?: ProcessOutlineStep[]  # Nested substeps. Notes never carry them.
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

- `ProcessOutlineState` in packages/docs-model/src/components/process-outline/state.ts defines a closed schema with one prop, `steps`. `additionalProperties: false` rejects anything else.

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

`ProcessOutlineDocsBlock` implements the Doc renderer contract element in five parts.

- Render loop

  - `readProcessOutlineSteps` derives depth-computed nodes from the step tree, and the viewer never parses notation. Each root step draws as a panel whose head strip shows the flow tile and the root text.

  - The panel follows the page, light on the light page and dark on the dark page. It is not a code surface.

  - A lone outline shrinks to its content, capped at the wide lane, and its step lines wrap at 60ch.

  - Consecutive outlines share one width, the widest of the run, which `equal-width.ts` measures.

  - A block with no steps renders the placeholder line `empty process outline — no steps yet`.

- One neutral rail

  - A 1.5px rail drops from each parent and ends in a plain file-tree elbow before each child. The elbow is a short tick with no arrowhead.

  - Indentation and line height set the geometry, and each elbow meets the middle of its step's first line. The tick stops `--docs-process-outline-arrow-gap` short of the text, 4px by default.

  - Depth reads from indent, not colour, so every depth shares one rail colour. The light rail is `color-mix(in srgb, var(--docs-ink) 45%, var(--docs-panel))`, and the dark rail is `color-mix(in srgb, var(--docs-ink) 75%, transparent)`.

  - The trunk continues only toward a later step, so a trailing note hangs free. The first phase hangs from the panel's head rule.

  - Every geometry and size value reads a `--docs-process-outline-*` style-rail token, with its light default as the fallback. The suffixes are `indent`, `row-gap`, `branch-gap`, `root-gap`, `arrow-gap`, `line-height`, `stroke`, `text-size`, `root-text-size`, and `empty-text-size`.

  - The six depth tokens, `cycle-1` to `cycle-6`, tint only the note accent and the selection, never a rail or an elbow.

- Hierarchy by weight

  - The root title and each phase, a first-level step with substeps, render in ink at weight 600. Nested steps render at weight 400, and phases with substeps sit 16px apart.

  - `Repeat`, `While`, and `For each` at the start of a segment and `until` anywhere in it render as loop keywords at weight 500. They use the VS Code control colour, `#AF00DB` in Light+ and `#C586C0` in Dark+.

  - Backticks render typed code chips, and a multi-word span stays one chip. `chipKind` in `packages/docs-viewer/src/components/typed-chip.ts` picks the kind, and `typedChipVsCodeColorCss` colours it through `light-dark()` with Light+ and Dark+.

  - Two Light+ chip colours are darkened to keep 4.5:1 contrast on the chip fill, type to `#22728A` and number to `#08794F`.

- Notes

  - A note renders in italics behind a mono `//` marker, aligned with its sibling steps. Notes use the VS Code comment colour, `#008000` in Light+ and `#6A9955` in Dark+.

  - Consecutive note siblings group into one block, and each note stays its own `//` line.

  - Notes have their own text size and line height. They remain visually subordinate to action lines and visible by default.

- Editor surface

  - The ProcessOutlineNodeView edits the same renderer through renderLine and renderEmpty hooks. Enter splits a line, Tab indents, Shift+Tab outdents, and line ranges support selection, copy, cut, and deletion. Edits use typed component actions and the outer editor history.

## Agent Renderer

The Agent renderer contract element: the markdown projection is a `process-outline` fence whose body is `serializeProcessOutline` over the step tree. Projected, the live Example above is:

```
```process-outline
Run Mode
     -> Get Epoch-size Candidates From the Ranked Worker System
          -> Exclude locked, cooled-down, or unschedulable work
          -> Keep enough ready work to feed the worker pool
     -> Drain the Epoch With Workers
          -> Spawn workers through the kernel until the epoch is drained
          -> Each worker gets its own isolated worktree
          > workers produce tentative evidence
          > the epoch boundary makes the map authoritative again
     -> Finish the Epoch
          -> Run the full build
          -> Move every item to its authoritative lane
     -> Continue
          -> Repeat until the operator stops or the run bound is reached
```
```

- A bare `process-outline` fence identifies the notation. A heading outside the block supplies its title.

- Serialization emits bare roots, arrow steps, note markers, and trace markers with five spaces per depth. Parse notation into steps before using setSteps.

- Malformed props project an empty fence body rather than crashing.

## Theme

The `process-outline` entry in `THEME_TOKEN_REGISTRY` lists the variables below. `semantic.css` sets each one in a light block and a dark block, and the table gives both values where they differ.

- Style rail

  - Theme controls expose text, rail, depth, loop, note, and chip colors together with spacing and size settings.

  - Length controls set indentation, gaps, line heights, text sizes, note spacing, and the **Elbow gap**. Strength controls set the note accent and the selection tint.

  - Backed by the `process-outline` entry in `THEME_TOKEN_REGISTRY` (theme-folders.ts) and the `process-outline` picker file in the Components section. Values save to `components/process-outline.json` in the active theme folder, which is the Global theme by default.

- Derived deep ink

  - Deep-step ink defaults to the main ink.

- Rail per mode

  - The light rail mixes ink into the panel colour, so the stroke stays opaque.

  - The dark rail is ink at 75% opacity over the dark panel.

| CSS variable | Default | Styles |
| --- | --- | --- |
| --docs-process-outline-ink | --docs-text | Step text |
| --docs-process-outline-title-fg | --docs-ink | Root title and phase lines |
| --docs-process-outline-deep-ink | the ink | Step text at depth three and deeper |
| --docs-process-outline-bg, -header-bg | --docs-panel | Panel and head strip fill |
| --docs-process-outline-border | --docs-rule | Panel frame |
| --docs-process-outline-rail | color-mix(in srgb, var(--docs-ink) 45%, var(--docs-panel)) light · color-mix(in srgb, var(--docs-ink) 75%, transparent) dark | Rails and elbows at every depth |
| --docs-process-outline-cycle-1..6 | --docs-cat-1, -3, -5, -4, -2, -6 | Note accent and selection tint only |
| --docs-process-outline-keyword-fg | #AF00DB light · #C586C0 dark | Loop keywords, the VS Code control colour, at keyword-weight 500 |
| --docs-process-outline-note-fg | #008000 light · #6A9955 dark | Note text, the VS Code comment colour |
| --docs-process-outline-note-bullet | #008000 light · #6A9955 dark | The // note marker |
| --docs-process-outline-code-bg | --docs-chip-bg | Chip fill |
| --docs-process-outline-indent | 28px | Horizontal inset per nesting level |
| --docs-process-outline-row-gap | 4px | Vertical gap between sibling rows |
| --docs-process-outline-branch-gap | 16px | Gap between phases that have substeps |
| --docs-process-outline-root-gap | 12px | Gap between root panels |
| --docs-process-outline-arrow-gap | 4px | Gap between the elbow tick and the step text |
| --docs-process-outline-line-height | 24px | Step line height, the elbow meets half of it |
| --docs-process-outline-text-size | 13.5px | Step text size |
| --docs-process-outline-root-text-size | 13.5px | Root title text size |
| --docs-process-outline-branch-weight | 600 | Phase line weight |
| --docs-process-outline-step-weight | 400 | Nested step weight |
| --docs-process-outline-note-text-size | 13.5px | Note text size |
| --docs-process-outline-note-line-height | 21px | Note line height |
| --docs-process-outline-stroke | 1.5px | Rail and elbow stroke width |

## Agent Adapter

Process Outline uses the default agent adapter and has no component-specific agent.

- The five typed actions ride `componentAction` ops in the seven-op doc vocabulary (packages/docs-model/src/doc-ops.ts).

- A `componentAction` names the registry key (`"process-outline.setSteps"`), resolves the action, validates params, and runs `apply()` against the target block.

- Typed actions return props patches through updateBlock. This preserves the block ID and the normal inverse operation.

- Structural operations insert, update, delete, or move the block. splitBlock and mergeBlocks do not apply because this block carries no delta text.

