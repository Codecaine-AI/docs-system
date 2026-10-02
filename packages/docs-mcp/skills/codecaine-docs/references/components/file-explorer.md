# file-explorer

Generated from Codecaine Docs sources. Snapshot: `sha256:df48bff505633507af34872daf2950bc392aeeae845c9eb67ff4956ad352fb08`. Refresh the installation to regenerate these files.

Use File Explorer to show the files a change touches the way an editor sidebar shows them, with a badge per changed file. Use File Tree for a plain tree listing of a layout.

Example: Show the files the file-tree refactor added, modified and renamed, with a note on the two that matter.

Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/20-file-explorer`.

The file-explorer component owns one block type, `file-explorer`, which draws flat path entries as IDE-style sidebar rows with collapsible folders and a badge per changed file. Use it to show the files a change touches. File Tree draws the same entry shape as a plain-text `tree` listing.

## Example

This block lists five files in `packages/docs-model/src/components/file-tree/`. Click a folder row to collapse it.

**File-tree refactor slice**

```
  packages/
  └── docs-model/
      └── src/
          └── components/
              └── file-tree/
                  ├── actions/
+                 │   └── update-entry.ts
~                 ├── agent-view.ts  # tree drawing
>                 ├── packages/docs-model/src/components/file-tree/render.ts -> lib.ts
                  ├── manifest.ts
                  └── state.ts  # entry schema + tolerant read
```

## State Schema

`FileExplorerState` reuses the file tree's entry schema and adds two optional props. The type carries no delta text (`carriesText: false`).

**FileExplorerState** — packages/docs-model/src/components/file-explorer/state.ts#FileExplorerState

```
entries: FileTreeEntry[]  # Flat path entries. Folders derive from path prefixes.
  path: string  # /-separated, no leading "./". A trailing "/" marks a directory.
  note?: string  # One muted line after the name.
  change?: "added" | "removed" | "modified" | "renamed"  # Colors the name and adds an A, D, M, or R badge.
  from?: string  # Previous path when renamed.
title?: string  # Header title. No header renders without it.
maxRows?: integer (>= 1)  # Rows shown before folding (default 8).
```

## Typed Actions

Three actions edit `entries`, keyed by exact path as in File Tree. Each action is also an MCP tool, such as `docs_file_explorer_add_entry`.

- **addEntry**

  - It appends an entry with an optional note and change marker.

  - A path that already exists is an error.

- **updateEntry**

  - It patches `note`, `change`, or `from` in place, and `null` clears a field.

  - `newPath` renames the entry and keeps its position.

- **removeEntry**

  - It deletes by exact path, and a missing path is an error.

```
file-explorer.addEntry(path: string, note?: string, change?: "added" | "removed" | "modified" | "renamed") -> Props patch { entries }, revalidated against FileExplorerState  # Append a path entry (optional note and change marker) to the file explorer.
  path: string  # /-separated path, no leading "./". A trailing "/" marks an explicit directory.
  note?: string  # Short annotation rendered after the path.
  change?: "added" | "removed" | "modified" | "renamed"  # Change marker for the entry.
file-explorer.updateEntry(path: string, note?: string | null, change?: "added" | "removed" | "modified" | "renamed" | null, from?: string | null, newPath?: string) -> Props patch { entries }, revalidated against FileExplorerState  # Patch an entry's note, change, or from, or rename it in place with newPath.
  path: string  # Exact path of the entry to patch.
  note?: string | null  # New note. Pass null to clear.
  change?: "added" | "removed" | "modified" | "renamed" | null  # New change marker. Pass null to clear.
  from?: string | null  # Previous path for a renamed entry. Pass null to clear.
  newPath?: string  # Rename the entry to this path, kept in place.
file-explorer.removeEntry(path: string) -> Props patch { entries }, revalidated against FileExplorerState  # Remove the entry with the given path from the file explorer.
  path: string  # Exact path of the entry to remove.
```

Each action returns the props patch `{ entries }`, revalidated against `FileExplorerState`. An `updateBlock` op still sets `title` and `maxRows`.

## Doc Renderer

`FileExplorer` in `packages/docs-viewer/src/components/file-explorer/FileExplorer.tsx` draws one row per file or folder, with folders sorted first.

- A folder with one child folder and no note or change merges into one row, such as `packages/docs-model/src/components/file-tree`.

- A renamed entry shows its old name struck through, then an arrow, then the new name.

- The header strip renders only when `title` is set, and it shows only the title.

- Past `maxRows` visible rows, the list folds behind a **Show all N rows** toggle.

- Colors read the file tree's `--docs-file-tree-*` tokens, each with a literal fallback.

## Agent Renderer

`fileExplorerAgentView` returns the same fenced `tree` drawing that `projectFileTree` produces for a file tree. When `title` is set, the title leads the drawing in bold.

