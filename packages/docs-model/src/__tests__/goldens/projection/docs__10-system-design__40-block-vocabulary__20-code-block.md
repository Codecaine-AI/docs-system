The code component owns a single block type, `code` — the language-tagged block for real, annotated source listings in the Block vocabulary. The source lives in the block's delta text; the language tag and structured line annotations live in `props`. The model contract lives in `packages/docs-model/src/components/code/`; every doc surface lives in `packages/docs-viewer/src/components/code/`.

In the documentation doctrine the type is the source-evidence surface: state-shape blocks carry state examples, code blocks carry the evidence — annotated listings of the defining source.

## Example

A live instance of the type — a small annotated listing:

```typescript
export function requireRoot(doc: DocDocument): DocBlock {
  const root = doc.blocks[doc.root];
  if (!root) {
    throw new Error(`missing root block: ${doc.root}`);
  }
  return root;
}
```
> **L3-5 (Guard):** Rejects a document whose root pointer names no block — the tree invariant every reader assumes.
> **L6:** Callers get the resolved root shell, never the raw id.

## State Schema

The type declares `carriesText: true` in `packages/docs-model/src/components/code/state.ts`: the delta text is the source payload itself, not prose. The editor schema sets `marks: ""` on the node (`packages/docs-viewer/src/components/code/editor-nodes.ts`), so the spans are plain inserts — no bold, link, or reference marks inside code. Everything else is props, defined by two closed TypeBox schemas:

```typescript
export const CodeAnnotationSchema = Type.Object(
  { lines: Type.String(), label: Type.Optional(Type.String()), note: Type.String() },
  { additionalProperties: false },
);

export const CodeState = Type.Object(
  { language: Type.Optional(Type.String()), annotations: Type.Optional(Type.Array(CodeAnnotationSchema)) },
  { additionalProperties: false },
);

export const codeState: BlockStateDefinition = { schema: CodeState, carriesText: true };
```
> **L1-4 (Annotation shape):** lines and note are required strings, label optional. Closed object: an unknown key is a validation refusal, not a pass-through.
> **L6-9 (Block props):** Both props optional — a bare code block is valid. Every write revalidates the array items against the annotation shape.
> **L11 (Text carrier):** carriesText: true — the one non-prose text carrier in the vocabulary.

| prop | type | required | notes |
| --- | --- | --- | --- |
| language | string | no | Fence tag for highlighting and the header label, e.g. "json", "ts". Written by the editor's language picker. |
| annotations | array | no | Array of { lines, label?, note }: lines is a 1-indexed range string and the entry's identity key, label an optional short heading on the note, note the annotation body. |

### Line Ranges

- `lines` is a 1-indexed range string: "4" covers one line, "4-9" a span, "1,4-6" a comma list.

- The exact string is the annotation's identity key.

  - Both typed actions and the pairing engine key on it; two annotations can never share a key — `setAnnotation` replaces in place.

- `expandLineRange` in `packages/docs-viewer/src/components/code/annotations.ts` expands a key into the covered line set.

  - Parts clamp to the text's line count; unparseable parts contribute nothing — bad input never crashes a render.

### Tolerant Reads

- Two tolerant readers, one per package.

  - `readCodeAnnotations` (`packages/docs-model/src/components/code/state.ts`) feeds the typed actions.

  - `parseCodeAnnotations` (`packages/docs-viewer/src/components/code/annotations.ts`) feeds every doc surface, so edit and read mode can never disagree about which entries are renderable.

- Both skip entries missing a non-empty `lines` or `note` string instead of failing.

  - `parseCodeAnnotations` returns null when nothing renderable remains, so a surface branches on "has annotations at all" with one check.

## Typed Actions

The component registers exactly two typed actions, both built with `defineComponentAction` against block type `code`. Annotations edit only through them; the source text stays on generic text ops — no typed action touches the delta.

- `code.setAnnotation`

  - Upserts keyed by the exact `lines` string: replaces in place when the key exists, appends otherwise.

  - A `label` omitted from params stays omitted in the stored entry.

  - Defined in `packages/docs-model/src/components/code/actions/set-annotation.ts`.

- `code.removeAnnotation`

  - Refuses a key that does not exist — the failure reports issue path `$.params.lines` instead of silently no-opping.

  - Defined in `packages/docs-model/src/components/code/actions/remove-annotation.ts`.

**code — annotation actions**

```
code.setAnnotation(lines: string, note: string, label?: string) -> props patch: { annotations }  # Upsert a line annotation keyed by its exact "lines" string (e.g. "4-9").
code.removeAnnotation(lines: string) -> props patch: { annotations }  # Remove the annotation whose "lines" key matches exactly.
```

The upsert body in full:

```typescript
apply(block, { lines, note, label }) {
  const annotation: CodeAnnotation = { lines, note };
  if (label !== undefined) annotation.label = label;
  const annotations = readCodeAnnotations(block);
  const index = annotations.findIndex((candidate) => candidate.lines === lines);
  const next = [...annotations];
  if (index === -1) next.push(annotation);
  else next[index] = annotation;
  return { ok: true, props: { annotations: next } };
}
```
> **L4 (Tolerant read):** Malformed stored entries drop before the upsert — one bad entry never wedges the block.
> **L5-8 (Exact-key upsert):** The lines string is the identity: replace when it exists, append when it does not.
> **L9 (Props patch):** A shallow-merge patch replacing the whole annotations array; executing it is the adapter's job.

## Doc Renderer

Three surfaces, one shell: the plain read surface (`packages/docs-viewer/src/components/code/descriptor.tsx`), the annotated read surface (`packages/docs-viewer/src/components/code/CodeAnnotations.tsx`), and the edit surface (`packages/docs-viewer/src/components/code/editor-node-view.tsx`). Shared furniture — header row, sticky gutter, zebra striping, notes aside — comes from `packages/docs-viewer/src/components/code/CodeShell.tsx` and the class constants in `packages/docs-viewer/src/components/code/classes.ts`, so the three surfaces look identical.

### Shared Shell

- Header row.

  - Quiet uppercase language label left, ghost copy button right — no pill, no background.

  - The copy button appears on block hover or focus and copies the surface's exact displayed source.

- Gutter.

  - A sticky 3rem column that stays put under horizontal scroll; numbers render at 55% strength at rest.

  - Its background must be opaque (it is sticky) but defaults to a mix matching the block background, so no band is perceptible.

- Zebra.

  - One absolute layer behind the code column; the gradient period is two 20px lines, aligned to line 1 by construction.

- Notes aside.

  - A 320px right column at lg widths, stacked below the code when narrow.

  - Notes are plain prose rows with a hairline rule between items — never zebra; each note's `lines` key rides in its title attribute.

- Design principle: one surface, one accent, interaction reveals the rest.

  - At rest an annotated range shows only the 2px accent bar plus accent line numbers; the tint appears when its pair is lit.

### The 20px Line

- `CODE_LINE_HEIGHT_PX = 20` in `packages/docs-viewer/src/components/code/classes.ts` is a layout constant, not a theme token.

  - The zebra gradient period, the gutter row height, and every annotation overlay's top and height are computed from it, so it must never drift per host.

- Soft wrap is off on every surface.

  - The edit surface forces `white-space: pre` on its content node; wrapping would break every line-geometry computation.

### Annotation Pairing

- The annotated read surface keeps a per-line grid, so every annotated line is a click and focus target.

  - Pairing runs on the shared LinkGroup engine — one group per block, keyed by the annotation's `lines` string.

- Hovering or focusing a note or an annotated line lights the pair's full extent: background wash, a 3px pin rail from first through last covered line, pin-color bold numbers.

- Clicking (or Enter/Space) pins the pair — it survives hover-out — and Escape clears it.

- Overlapping annotations resolve each line to the earliest covering note.

  - `annotationLineRuns` and the read surface share the rule, so overlay geometry and click-to-pair can never disagree.

- The edit surface pairs from the notes side only.

  - Clicking a note sticky-toggles its pair and scrolls the range's first line into view; clicks in the code just place the cursor.

### Editor Entry

- Slash menu: **Code Block** (aliases `codeblock`, `code`, `````).

- Input rule (`packages/docs-viewer/src/components/code/input-rules.ts`): the paragraph converts the moment the third backtick lands — no trailing space, no typed language tag.

- The header label is the language picker.

  - Choosing a language writes the block's `language` attr, persisted to `props.language` on save.

  - "auto" clears it and falls back to detection, showing the sniffed language when one resolves.

### Highlighting and JSON Display

- Highlighting (`packages/docs-viewer/src/components/code/highlight.ts`) uses highlight.js core with a curated set of 13 registered grammars — never the all-languages bundle.

  - bash, css, diff, go, javascript, json, markdown, python, rust, sql, typescript, xml, yaml — plus each grammar's aliases (ts, tsx, js, sh, yml, md, py…).

- One resolution serves the header label and the tokens.

  - The declared language when a grammar or alias matches, else a JSON sniff, else escaped plain text with no label — the label can never disagree with tokenization.

- Token colors come from the host's `.hljs-*` rules, mapped to the `--syntax-*` theme vars for light and dark.

- JSON pretty-printing is display-only; the stored text is never mutated.

  - `prettyPrintIfJson` re-renders one-liner JSON as the nested 2-space form when the language is json/jsonc, or is undeclared and the text sniffs as JSON.

  - On the annotated surface it runs before line-splitting, so `lines` ranges address the pretty-printed form — author JSON as pretty multi-line text so ranges are stable against the transform.

## Agent Renderer

On the agent surface (`packages/docs-model/src/components/code/agent-view.ts`) the block renders as a fenced markdown block: the fence tag is `props.language` (a bare fence when unset), the body is the delta text as plain text. Annotations follow the fence, one blockquote line per entry:

```
> **L4-9 (Validation):** Rejects orphan children.
```

- The L-prefixed range is the annotation's `lines` key; the label rides in parentheses and drops cleanly when absent.

- Entries missing a `lines` or `note` string drop from the projection — the same tolerant read as the doc surfaces.

- Line numbers in `lines` are 1-indexed against the block text at the time you write them; re-check them after editing the source.

- The house style for documenting a system: a state-shape carrying both the shape and an example instance, then an interaction-surface for the operations. Code blocks enter as source evidence — annotated listings of the defining source, not state examples.

## Theme

The theme file is `themes/default/components/code.json` in a theme folder (`themes/<id>/`). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY` in `packages/docs-workbench/web/src/theme/theme-folders.ts`. The contract element is Theming.

| Key | CSS variable | Kind | Styles |
| --- | --- | --- | --- |
| bg | --docs-code-block-bg | color | Block background |
| border | --docs-code-block-border | color | Block frame border |
| string | --syntax-string | color | Syntax: string literals |
| number | --syntax-number | color | Syntax: numbers |
| boolean | --syntax-boolean | color | Syntax: booleans |
| null | --syntax-null | color | Syntax: null/nil tokens |
| key | --syntax-key | color | Syntax: object keys / attributes |
| languageFg | --docs-code-lang-fg | color | Language-picker affordance on block hover (edit surface) |
| annotationAccent | --docs-code-annotation-accent | color | Annotation accent: gutter bar, accent numbers, lit tint |
| gutterFg | --docs-code-gutter-fg | color | Gutter numbers and the copy button |
| gutterBg | --docs-code-gutter-bg | color | Sticky gutter background (defaults to a mix matching the block bg) |
| zebra | --docs-code-zebra | color | Even-line stripe color |
| rule | --docs-code-rule | color | Internal hairlines: header rule, column divider, note dividers |
| ruleWidth | --docs-code-rule-width | length 0–4px | Hairline width (step 0.5, default 1px) |
| ruleOpacity | --docs-code-rule-opacity | number 0–1 | Hairline opacity (step 0.05, default 0.5) |
| zebraOpacity | --docs-code-zebra-opacity | number 0–1 | Zebra layer opacity (step 0.05, default 1) |

- The three knobs are the registry's only non-color code tokens.

  - Every internal hairline — header rule, code/notes column divider, note dividers — runs through the one rule token set.

- The default theme sets `ruleOpacity` 0.9 and `zebraOpacity` 1; every other key falls through to the fixed fallbacks in `packages/docs-viewer/src/components/code/classes.ts`.

- The annotated read surface additionally rides the shared linked-panels tokens.

  - `--docs-zebra`, `--docs-link-bg`, and `--docs-link-pin` are registered once under the registry's `linking` entry, not per component.

- The 20px line height is a layout constant, deliberately not a token.

## Agent Adapter

The family uses the default adapter: no agent of its own, and nothing forwards to an external authority — both typed actions carry a local `apply`. The contract element is Agent adapter.

- An agent edit arrives as a `componentAction` op — the seventh op in the vocabulary, alongside `insertBlock`, `updateBlock`, `deleteBlock`, `moveBlock`, `splitBlock`, and `mergeBlocks`.

- The op kernel (`packages/docs-model/src/doc-ops.ts`) resolves the action from the registry, validates its params, runs `apply` against the target block, and executes the returned `{ annotations }` patch through the existing `updateBlock` path.

  - Merge semantics stay single-sourced, and the inverse comes back as the usual `updateBlock` inverse.

- `updateBlock` preserves the block id, so annotation and backlink targets survive every annotation edit.
