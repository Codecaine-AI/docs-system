# pseudocode

Generated from Codecaine Docs sources. Snapshot: `sha256:df48bff505633507af34872daf2950bc392aeeae845c9eb67ff4956ad352fb08`. Refresh the installation to regenerate these files.

Use Pseudocode to explain an algorithm or a change in logic without the noise of real syntax. Set diff to show which lines a change adds or removes. Use Code when the reader needs the actual source.

Example: Sketch how the renderer builds header rows, marking the line this change removes.

Canonical document: `10-system-design/40-block-vocabulary/20-code/20-pseudocode`.

The pseudocode component owns one block type, `pseudocode`, a plain-language code listing that explains an algorithm or a change in logic without real syntax. The viewer highlights control words, calls, and `->` arrows, and it moves each trailing `//` comment into one aligned column. Use the code block when the reader needs the actual source.

## Example

This listing restates `annotationLineRuns` in `packages/docs-viewer/src/components/code/annotations.ts:97`, which groups annotated code lines into overlay runs.

```pseudocode
annotationLineRuns(lineCount, annotations)
  for each annotation in annotations
    for each line in expandLineRange(annotation.lines, lineCount)
      if owner has no line -> owner[line] = index // the earliest note wins
  for each line in 1..lineCount
    if owner has no line
      current = null // a gap ends the run
    else if current.annotationIndex is owner[line]
      current.length += 1
    else
      current = newRun(line, owner[line]) // a new owner starts a run
      push current onto runs
  return runs
```

With `diff: true`, each line's leading `+`, `-`, or space is a diff marker. This diff shows the split that took pseudocode out of `highlightCode` in `packages/docs-viewer/src/components/code/highlight.ts:343`.

```pseudocode diff
 highlightCode(code, language)
   grammar = resolveLanguage(code, language)
   if grammar is null -> return escaped lines
-  if grammar is pseudo -> return highlightPseudoLines(code) // moved to the pseudocode block
   return splitHighlightedHtml(highlightToHtml(code, grammar))
```

## State Schema

The block text is the pseudocode (`carriesText: true`). One optional prop, defined by `PseudocodeState` in `packages/docs-model/src/components/pseudocode/state.ts`, turns on the diff gutter.

**PseudocodeState** — packages/docs-model/src/components/pseudocode/state.ts#PseudocodeState

```
diff?: boolean  # Reads each line's leading +, -, or space as a diff marker.
```

## Typed Actions

Four actions edit the block text one line at a time. Each action is also an MCP tool, such as `docs_pseudocode_insert_line`.

- **Lines come from the block text**

  - The actions split the block text on newlines and address a line by its 0-based index.

  - With `diff` on, the first character of each line is its marker, which is `+`, `-`, or a space.

- **Each action has one job**

  - `insertLine` and `removeLine` add or delete one line.

  - `updateLine` replaces a line's text, its marker, or both, and a `null` marker resets to a space.

  - `setLines` replaces every line and can turn `diff` on or off in the same edit.

- **Actions return text**

  - Each action returns the rewritten block text, which replaces the old text as one undoable edit.

  - A marker on a block without `diff` is an error.

```
pseudocode.insertLine(index: integer, text: string, marker?: "+" | "-" | " ") -> Replacement block text  # Insert one pseudocode line at a 0-based index. An index equal to the line count appends.
  index: integer  # Insert position in [0, line count].
  text: string  # Line text without a diff marker or newlines. Leading spaces indent.
  marker?: "+" | "-" | " "  # Diff marker for diff blocks only. Defaults to a space.
pseudocode.updateLine(index: integer, text?: string, marker?: "+" | "-" | " " | null) -> Replacement block text  # Replace the text, the diff marker, or both on the line at a 0-based index.
  index: integer  # Line index in [0, line count - 1].
  text?: string  # New line text without a diff marker or newlines.
  marker?: "+" | "-" | " " | null  # New diff marker for diff blocks only. Null resets it to a space, an unchanged line.
pseudocode.removeLine(index: integer) -> Replacement block text  # Remove the pseudocode line at a 0-based index.
  index: integer  # Line index in [0, line count - 1].
pseudocode.setLines(lines: { text, marker? }[], diff?: boolean) -> Replacement block text, plus the props patch { diff } when diff is passed  # Bulk replace: swap every pseudocode line, optionally turning the diff gutter on or off.
  lines: { text, marker? }[]  # Complete replacement lines in order. An empty array clears the pseudocode.
  diff?: boolean  # Set the diff gutter on or off in the same edit. Omit to keep it.
```

## Doc Renderer

The descriptor in `packages/docs-viewer/src/components/pseudocode/descriptor.tsx` draws the code block's header, labeled `pseudo`, over a grid with one row per source line. Each row holds the line number, the code, and the trailing comment, so no line overflows the panel:

- A private highlight.js instance in `highlight.ts` registers only the pseudo grammar, so the code block never resolves `pseudo` as a language.

- `renderPseudoLines` in `pseudo.ts` splits each line into its code and its trailing `//` comment. The comments share one aligned column, and a comment wraps inside the panel instead of scrolling.

- With `diff`, added rows get a green tint and removed rows get a red tint with struck-through code. Without it, a leading `-` stays literal.

- The block sits in the code block's lane. A style-rail width set for `code` also applies to `pseudocode` unless `pseudocode` has its own width, so most comments fit on one line.

## Agent Renderer

The projection is one fence holding the text verbatim. The info string is `pseudocode`, or `pseudocode diff` when `diff` is set.

