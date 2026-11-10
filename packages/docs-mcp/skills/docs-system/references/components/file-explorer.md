# file-explorer

Generated from Docs System sources. Snapshot: `sha256:166e56d1065c0db1ba5dbc6a721f1637ba900d2f518da00df1b2ad89da143c97`. Refresh the installation to regenerate these files.

Use File Explorer to show the files a change touches the way an editor sidebar shows them, with a +, −, ~ or > gutter glyph per changed file. Use File Tree for a plain tree listing of a layout.

Example: Show the files the file-tree refactor added, modified and renamed, with a note on the two that matter.

Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/20-file-explorer`.

The file-explorer component owns one block type, `file-explorer`, which draws flat path entries as IDE-style sidebar rows. Folders collapse, and each changed file gets a gutter glyph, with a key under the rows that names each glyph. Use it to show the files a change touches. File Tree draws the same entry shape as a plain-text `tree` listing.

## Example

This block lists five files in `packages/docs-model/src/components/file-tree/`. Click a folder row to collapse it.

**File-tree refactor slice**

```
  packages/docs-model/src/components/file-tree/
  ├── actions/
+ │   └── update-entry.ts
~ ├── agent-view.ts  # Draws the fenced tree for agents
> ├── packages/docs-model/src/components/file-tree/render.ts -> lib.ts
  ├── manifest.ts
  └── state.ts  # Entry schema and tolerant read
```

## Write the Entries

An explorer reads well when its rows match the change the page describes and each note adds a fact the row cannot show.

- **Rows**

  - List each file the change touches.

  - Add an unchanged file only when the prose names it, and give it a note that says why it is there.

  - Say in the lead that the explorer leaves the other files of the folder out.

  - Mark the changed files in a folder, not the folder alone, because a folder row with no files under it shows no changed file.

- **Change and Color**

  - Set `change` only for a real change in the change the page describes.

  - A stage, an owner, or a key file is never a change, so a page about a folder with no change sets no `change`.

  - Set `color` only on a group that the prose names, and say in the prose what each color marks. Color is a second cue, so when the brief asks for the group, such as the stage that writes a file, also name it in each note.

  - Give two groups hues far apart, such as blue and pink, and never green, red, or yellow, because they read as change colors.

- **Title and Fold**

  - Name what the files are in `title`, such as "Files the change-set build touched".

  - Never repeat the root folder path in `title`, because the first row shows it.

  - Leave `maxRows` unset, and split an explorer of more than 24 rows into one block per package.

- **Notes**

  - Give a note one fact about what the file does, in about 10 words, so it fits on one line. Where a build or an installer copies the file is not what it does.

  - Never restate the file name, the path, or the change in a note, and never point to another row with "same" or "above".

  - Never open a note with `+`, because `+` is the added glyph. Write "Adds 5 routes", not "+5 routes".

  - Give every new file a note when some new files have notes.

  - Put each identifier in a note in backticks, such as ``patchIds``, so it renders in the code face.

## State Schema

`FileExplorerState` reuses the file tree's entry schema and adds two optional props. The type carries no delta text (`carriesText: false`).

**FileExplorerState** — packages/docs-model/src/components/file-explorer/state.ts#FileExplorerState

```
entries: FileTreeEntry[]  # Flat path entries. Folders derive from path prefixes.
  path: string  # /-separated, no leading "./". A trailing "/" marks a directory.
  note?: string  # One fact about the file's role, in about 10 words. Never restates the name, path, or change.
  change?: "added" | "removed" | "modified" | "renamed"  # A real change in the change the page shows. Adds a +, −, ~, or > gutter glyph, a row tint, and a key entry.
  from?: string  # Previous path when renamed.
  color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink"  # Group color from the docs color roster. It draws a strip down the rows of its subtree and tints their icons. Any other value fails validation.
title?: string  # Header title: what the files are, never the root folder path. No header renders without it.
maxRows?: integer (>= 1)  # Rows shown before folding (default 24). A fold never hides fewer than 4 rows.
```

## Typed Actions

Three actions edit `entries`, keyed by exact path as in File Tree. Each action is also an MCP tool, such as `docs_file_explorer_add_entry`.

- **addEntry**

  - It appends an entry with an optional note, change marker, and color.

  - A path that already exists is an error.

- **updateEntry**

  - It patches `note`, `change`, `from`, or `color` in place, and `null` clears a field.

  - `newPath` renames the entry and keeps its position.

- **removeEntry**

  - It deletes by exact path. A missing path is an error.

```
[action] file-explorer.addEntry(path: string, note?: string, change?: "added" | "removed" | "modified" | "renamed", color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink") -> Props patch { entries }, revalidated against FileExplorerState  # Append a path entry (optional note, change marker, and color) to the file explorer.
  path: string  # /-separated path, no leading "./". A trailing "/" marks an explicit directory.
  note?: string  # One fact about the file's role, in about 10 words. Never restate the name, path, or change.
  change?: "added" | "removed" | "modified" | "renamed"  # A real change in the change the page shows. Never a stage, an owner, or a key file.
  color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink"  # Group color. A directory's color carries to its whole subtree.
[action] file-explorer.updateEntry(path: string, note?: string | null, change?: "added" | "removed" | "modified" | "renamed" | null, from?: string | null, color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink" | null, newPath?: string) -> Props patch { entries }, revalidated against FileExplorerState  # Patch an entry's note, change, from, or color, or rename it in place with newPath.
  path: string  # Exact path of the entry to patch.
  note?: string | null  # New note. Pass null to clear.
  change?: "added" | "removed" | "modified" | "renamed" | null  # New change marker. Pass null to clear.
  from?: string | null  # Previous path for a renamed entry. Pass null to clear.
  color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink" | null  # New group color. Pass null to clear.
  newPath?: string  # Rename the entry to this path, kept in place.
[action] file-explorer.removeEntry(path: string) -> Props patch { entries }, revalidated against FileExplorerState  # Remove the entry with the given path from the file explorer.
  path: string  # Exact path of the entry to remove.
```

Each action returns the props patch `{ entries }`, revalidated against `FileExplorerState`. An `updateBlock` op still sets `title` and `maxRows`.

## Doc Renderer

`FileExplorer` in `packages/docs-viewer/src/components/file-explorer/FileExplorer.tsx` draws one row per file or folder, with folders sorted first.

- A folder with one child folder and no note or change merges into one row, such as `packages/docs-model/src/components/file-tree`.

- A renamed entry shows its old name struck through, then an arrow, then the new name.

- The header strip renders only when `title` is set. It shows only the title.

- Past `maxRows` rows, 24 by default, the list folds behind a **Show N more rows** toggle. It never folds to hide fewer than 4 rows.

- Colors read the file tree's `--docs-file-tree-*` tokens, each with a literal fallback.

A directory entry's `color` runs as a strip down the left edge of that row and of every row beneath it, and tints and fills their icons. The names keep their ink. A descendant's own `color` overrides the inherited one for its subtree, and a file entry's `color` covers only that row.

A changed row shows its gutter glyph, a soft row tint, and its change color on the name and icon. A folder with no change of its own shows `added` or `removed` when every file under it has that change. A key under the rows lists each change the block holds, as its glyph and its word.

A note wraps in one aligned column, and each backticked span in it renders in the code face. An empty folder shows a closed twisty, because the block lists none of its files.

## Agent Renderer

`fileExplorerAgentView` returns the same fenced `tree` drawing that `projectFileTree` produces for a file tree. When `title` is set, the title leads the drawing in bold. The drawing omits `color`, which is visual only.

