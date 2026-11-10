# pseudocode

Generated from Docs System sources. Snapshot: `sha256:166e56d1065c0db1ba5dbc6a721f1637ba900d2f518da00df1b2ad89da143c97`. Refresh the installation to regenerate these files.

Use Pseudocode to explain an algorithm or a change in logic without the noise of real syntax. Write each step in plain words, such as equals, is empty, and, or, and "add 1 to", never ===, &&, ??, ?., += or an object literal. Start each step with its control word, such as if, skip, return or leave, or with an action verb the viewer colors: set, add, append, insert, remove, delete, replace, move, push, pop, sort, split, join, mark, record, read, write, parse, build, create, update, call, check or make. Keep a line to about 70 characters. Keep the source's function and field names and its order of branches, loops, calls, and returns. Give each trailing // comment a reason in about 40 characters. Set diff to show which lines a change adds or removes. Use Code when the reader needs the actual source.

Example: Sketch how the renderer builds header rows, marking the line this change removes.

Canonical document: `10-system-design/40-block-vocabulary/20-code/20-pseudocode`.

The pseudocode component owns one block type, `pseudocode`, a plain-language code listing that explains an algorithm or a change in logic without real syntax. The viewer highlights control words, the action verb that starts a step, calls, and `->` arrows, and it moves each trailing `//` comment into one aligned column. When the reader needs the actual source, use the code block.

## Write Pseudocode

A pseudocode block restates one function or algorithm as plain steps, one step per line with 2 spaces of indent for each level of nesting. A reader can follow it without knowing the source language. The `pseudocode.code-syntax` lint flags the operators that the first group bans.

- **Write each step in plain words**

  - Keep the source's branches, loops, calls, and returns in order, with every condition each one tests, such as a check that ignores quoted words.

  - Write `equals` to compare two values, `is` for a state such as `is empty`, and `and`, `or`, and `add 1 to` in place of `===`, `&&`, `||`, and `+=`.

  - Say each fallback that an input can reach in words, such as "add 1 to the count for the name, which starts at 0". Leave out only a fallback that no input reaches, such as a default start for a regex match.

  - Name the list, map, or field that a step changes, such as "append the code span to spans". Describe an object, an index such as `match[1]`, a regex, or a range in words, such as "the text from cursor up to index, not including index".

  - Show a try and its catch as two steps, such as "try to parse the line as JSON" and "if the parse fails -> skip the line".

- **Give each line one reading**

  - Open each block with the header line of its function at indent 0, such as `parseTranscript(jsonl)`, and give each function its own block. The viewer sets the header line in a heavier weight.

  - Name a loop variable so its line reads as English, such as "for each candidate after the verb", not "for each word after word".

  - Start a control step with its control word, such as "skip the candidate" or "return path", so the viewer colors it. Say what a stop ends, such as "leave the loop", never a bare "stop".

  - Put a word that a step tests in quotes, such as `if between opens with "and" or "or"`, so it never reads as part of the sentence. Repeat the noun in place of "it", and name both ends of "between".

  - Keep a step to about 70 characters by splitting a long condition into a named step, such as "set quoted to whether the word is inside quotes". Never continue one step on the next line, because an indented line reads as a nested step.

- **Write each kind of step the same way**

  - Write a value step as a sentence, such as "set parent to the path without its last part", not with `=`.

  - Give every branch in a block the same form. Put a one-step branch on one line with an arrow, such as `if parent is empty -> leave the loop`, and indent the steps of a longer branch below its `if`.

  - Name each returned field by the name the source returns, such as "return toolCallsByName, costUsd, durationMs and numTurns", one field per name.

  - Start an action step with a verb that the viewer colors: set, add, append, insert, remove, delete, replace, move, push, pop, sort, split, join, mark, record, read, write, parse, build, create, update, call, check, or make. The viewer colors the verb at the line start, after an arrow, or after then or else, as in `if path ends with "/" -> remove the last slash`.

- **Give each comment a reason**

  - A trailing `//` comment gives a reason, a rule, or a consequence, such as `// the earliest note wins`.

  - A comment never restates its line, and it never names only a file or a function.

  - Keep a comment to about 40 characters, so it fits in the comment column beside its line. Put a longer explanation in the text after the block.

## Example

This listing restates `annotationLineRuns` in `packages/docs-viewer/src/components/code/annotations.ts:97`, which groups annotated code lines into overlay runs.

```pseudocode
annotationLineRuns(lineCount, annotations)
  for each annotation in annotations, with its index
    for each line in expandLineRange(annotation.lines, lineCount)
      if line has no owner -> make index the owner of line // the earliest note wins
  for each line from 1 to lineCount
    if line has no owner
      set current to none // a gap ends the run
    else if current exists and current.annotationIndex is the owner of line
      add 1 to current.length
    else
      set current to a new run at line for its owner // a new owner starts a run
      append current to runs
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
[action] pseudocode.insertLine(index: integer, text: string, marker?: "+" | "-" | " ") -> Replacement block text  # Insert one pseudocode line at a 0-based index. An index equal to the line count appends.
  index: integer  # Insert position in [0, line count].
  text: string  # Line text without a diff marker or newlines. Leading spaces indent.
  marker?: "+" | "-" | " "  # Diff marker for diff blocks only. Defaults to a space.
[action] pseudocode.updateLine(index: integer, text?: string, marker?: "+" | "-" | " " | null) -> Replacement block text  # Replace the text, the diff marker, or both on the line at a 0-based index.
  index: integer  # Line index in [0, line count - 1].
  text?: string  # New line text without a diff marker or newlines.
  marker?: "+" | "-" | " " | null  # New diff marker for diff blocks only. Null resets it to a space, an unchanged line.
[action] pseudocode.removeLine(index: integer) -> Replacement block text  # Remove the pseudocode line at a 0-based index.
  index: integer  # Line index in [0, line count - 1].
[action] pseudocode.setLines(lines: { text, marker? }[], diff?: boolean) -> Replacement block text, plus the props patch { diff } when diff is passed  # Bulk replace: swap every pseudocode line, optionally turning the diff gutter on or off.
  lines: { text, marker? }[]  # Complete replacement lines in order. An empty array clears the pseudocode.
  diff?: boolean  # Set the diff gutter on or off in the same edit. Omit to keep it.
```

## Doc Renderer

The descriptor in `packages/docs-viewer/src/components/pseudocode/descriptor.tsx` draws the code block's header, labeled `pseudo`, over a grid with one row per source line. Each row holds the line number, the code, and the trailing comment, so no line overflows the panel:

- A private highlight.js instance in `highlight.ts` registers only the pseudo grammar, so the code block never resolves `pseudo` as a language.

- `highlight.ts` colors a control word or an action verb only where the word starts a step. A verb also needs a word after it, so `set = 1`, `setParent(path)`, and "the set of names" stay plain.

- `renderPseudoLines` in `pseudo.ts` splits each line into its code and its trailing `//` comment, and the comments share one aligned column. When a comment would wrap in that column, every comment moves under its line and hangs 2 characters past the line's indent.

- With `diff`, added rows get a green tint and removed rows get a red tint with struck-through code. Without it, a leading `-` stays literal.

- The block sits in the code block's lane. A style-rail width set for `code` also applies to `pseudocode` unless `pseudocode` has its own width, so most comments fit on one line.

## Agent Renderer

The projection is one fence holding the text verbatim. The info string is `pseudocode`, or `pseudocode diff` when `diff` is set.

