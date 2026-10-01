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

The pseudocode block has no named actions. An `updateBlock` op replaces the text or sets `diff`, and the write is validated against `PseudocodeState`.

## Doc Renderer

The descriptor in `packages/docs-viewer/src/components/pseudocode/descriptor.tsx` draws the code block's header, labeled `pseudo`, over a grid with one row per source line. Each row holds the line number, the code, and the trailing comment, so no line overflows the panel:

- A private highlight.js instance in `highlight.ts` registers only the pseudo grammar, so the code block never resolves `pseudo` as a language.

- `renderPseudoLines` in `pseudo.ts` splits each line into its code and its trailing `//` comment. The comments share one aligned column, and a comment wraps inside the panel instead of scrolling.

- With `diff`, added rows get a green tint and removed rows get a red tint with struck-through code. Without it, a leading `-` stays literal.

- The block sits in the code block's lane. A style-rail width set for `code` also applies to `pseudocode` unless `pseudocode` has its own width, so most comments fit on one line.

## Agent Renderer

The projection is one fence holding the text verbatim. The info string is `pseudocode`, or `pseudocode diff` when `diff` is set.

