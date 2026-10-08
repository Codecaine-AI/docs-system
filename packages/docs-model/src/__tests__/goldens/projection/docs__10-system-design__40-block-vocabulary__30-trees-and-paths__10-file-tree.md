The file-tree component owns one block type, `file-tree`: the vocabulary's annotated path tree. A flat list of path entries in props renders on both surfaces as a `tree`-command drawing. The drawing has per-entry notes and change markers for describing repo slices and refactors.

When creating or revising a worked component example, show the relevant state shape with a concrete instance, the real operation signature, and its returned shape beside example data. Use one consistent scenario across all three. Verify fields and return semantics against source; identify whether the result is a props patch, full state, or response envelope. For void, primitive, or event results, document the actual result or payload instead of inventing an object. Descriptions should add non-obvious information.

Reach for it when the nested structure is files, not steps: repo slices, refactor plans, and layout conventions. A process that flows end to end belongs to process-outline.

To show the files a change touches as editor sidebar rows with a badge per changed file, use file-explorer instead.

## Example

A live instance: a refactor slice of this block's own source folder.

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

**FileTreeState** — packages/docs-model/src/components/file-tree/state.ts#FileTreeState

```
entries: FileTreeEntry[]  # Flat list of path entries. The rendered tree derives from path prefixes.
  path: string  # /-separated, with no leading "./". A trailing "/" marks an explicit directory.
  note?: string  # Short annotation rendered after the path.
  change?: "added" | "removed" | "modified" | "renamed"  # Diff marker for the entry.
  from?: string  # Previous path, used with change: "renamed".
  color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink"  # Group color from the docs color roster. It gives each top-level folder its own color so readers can tell groups apart. Any other value fails validation.
```

```json
{
  "entries": [
    {
      "path": "packages/docs-model/src/components/file-tree/state.ts",
      "note": "entry schema"
    },
    {
      "path": "packages/docs-model/src/components/file-tree/lib.ts",
      "change": "renamed",
      "from": "packages/docs-model/src/components/file-tree/render.ts"
    }
  ]
}
```

Every fact lives in `entries`, an array of path entries validated by the closed `FileTreeState` schema. The type carries no delta text (`carriesText: false`). The contract is State schema.

- Path rules

  - `path` is /-separated. `validateTreePath` in `lib.ts` rejects a leading "./", a leading "/", and empty segments on every action write.

  - Directories need no entries of their own. They are derived from path prefixes, and a derived directory carries no note or change state.

  - An entry authored as a file is promoted to a directory when later entries nest beneath it.

> **Gotcha** — The trailing "/" is the directory marker. An entry without it renders as a file, and files sort after directories, so a bare directory path lands styled and ordered as a file. Author an explicit directory as `path/`.

- Tolerant read

  - `readFileTreeEntries` skips an entry whose `path` is missing or empty. It drops a wrong-typed `note`, `change`, `from`, or `color` value, and nothing is repaired.

  - Actions match the `path` string literally, so keep paths exact.

## Typed Actions

Three actions are the type's whole custom write surface.

- `addEntry`

  - Appends to the end of `entries`. A duplicate path is an error.

  - Params are `path` plus optional `note`, `change`, and `color`. `from` enters only through `updateEntry`.

- `updateEntry`

  - The action patches `note`, `change`, `from`, or `color` in place. `null` clears a field.

  - `newPath` renames without moving, and the entry keeps its array position. A `newPath` that collides with another entry is an error.

- `removeEntry`

  - Deletes by exact path. A missing path is an error, not a no-op.

**file-tree entry actions**

```
file-tree.addEntry(path: string, note?: string, change?: string, color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink") -> FileTreePatch  # Append a path entry (optional note, change marker, and color) to the file tree.
  Returns FileTreePatch:
    entries: FileTreeEntry[]  # Flat list of path entries; the rendered tree derives from path prefixes.
      path: string  # /-separated, no leading "./"; a trailing "/" marks an explicit directory.
      note?: string  # Short annotation rendered after the path.
      change?: "added" | "removed" | "modified" | "renamed"  # Diff marker for the entry.
      from?: string  # Previous path, used with change: "renamed".
      color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink"  # Group color for the entry.
file-tree.removeEntry(path: string) -> FileTreePatch  # Remove the entry with the given path from the file tree.
  Returns FileTreePatch:
    entries: FileTreeEntry[]  # Flat list of path entries; the rendered tree derives from path prefixes.
      path: string  # /-separated, no leading "./"; a trailing "/" marks an explicit directory.
      note?: string  # Short annotation rendered after the path.
      change?: "added" | "removed" | "modified" | "renamed"  # Diff marker for the entry.
      from?: string  # Previous path, used with change: "renamed".
      color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink"  # Group color for the entry.
file-tree.updateEntry(path: string, note?: string | null, change?: string | null, from?: string | null, color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink" | null, newPath?: string) -> FileTreePatch  # Patch an entry's note/change/from/color, or rename it via newPath (in place).
  Returns FileTreePatch:
    entries: FileTreeEntry[]  # Flat list of path entries; the rendered tree derives from path prefixes.
      path: string  # /-separated, no leading "./"; a trailing "/" marks an explicit directory.
      note?: string  # Short annotation rendered after the path.
      change?: "added" | "removed" | "modified" | "renamed"  # Diff marker for the entry.
      from?: string  # Previous path, used with change: "renamed".
      color?: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "violet" | "pink"  # Group color for the entry.
```

Every `apply` is pure: entries go in, a props patch `{ entries }` comes out, and the patch revalidates against `FileTreeState` before anything persists.

## Doc Renderer

`FileTreeDocsBlock` draws the block on the doc surface, in reader and editor alike, as a bordered monospace panel. The panel has a `.` root line, then one row per node with `tree`-style guides (`├──`, `└──`, `│`). An empty `entries` array renders a `(no entries)` placeholder. The contract is Doc renderer.

- Ordering

  - Directories sort first at every level, then names in ascending codepoint order. Directory names render with a trailing "/".

  - The order matches the agent render exactly, so the two surfaces agree by design.

- Change markers

  - A change tints the row and puts its marker in the gutter: `+` added (emerald), `-` removed (rose, name struck through), `~` modified (amber), `>` renamed (sky).

  - A renamed row draws the old `from` path struck through, then `→`, then the new name.

- Group colors

  - A directory entry's `color` covers that row and every row beneath it. A descendant's own `color` overrides the inherited one for its subtree.

  - A file entry's `color` covers only that row.

  - The colored folder's name takes the color's ink at a heavier weight.

  - Every row in the group gets colored guide lines, and no row has a background tint at rest.

  - When the pointer is over a row, every row in that row's innermost group gets the color's soft wash. On a row with a change marker, the change tint wins over the group wash.

- Notes

  - `note` renders in one aligned, muted sans column after the names. Each note wraps inside a 60ch cap of its 13.5px face, 506.25px in Inter including its 24px left padding, and is never truncated.

- In the editor

  - `file-tree` is an atom leaf node (`ATOM_BLOCK_TYPES`). It is read-only, rendered by the same `FileTreeDocsBlock` through the shared atom node view.

  - There is no slash-menu entry. File trees enter through agent ops or existing content.

## Agent Renderer

`projectFileTree` renders the same tree as literal text inside a bare fence, the greppable form an agent reads. The Example block above projects to:

```text
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
> **L9 (Renamed):** A renamed entry draws the full old path, an ASCII ->, then the new leaf name — the whole diff story on one line.
> **L10-11 (Marker padding):** Entries in this tree carry markers, so unmarked lines pad with two spaces and the guides stay aligned.

- Ordering and guides match the doc render. Top-level nodes render flat, with no `.` root line.

- Notes append as `  # note`. Directory names keep the trailing "/".

- Change markers prefix the line: `+` added, `-` removed, `~` modified, `>` renamed.

- The projection omits `color`, which is visual only.

- The render is pure and pinned byte-for-byte by goldens. The obligations are Agent renderer.

## Theme

This block's theme file is `components/file-tree.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY` in `theme-folders.ts`. The contract is Theming.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-file-tree-border | Container border |
| note | --docs-file-tree-note-fg | Per-entry note text color |

The registry carries exactly these two keys for `file-tree`, both colors. The diff row tints and guide colors are fixed styles, not tokens.

## Agent Adapter

The family uses the default adapter: no agent of its own, no forwarding to an external authority. All three actions declare `apply`, so agent edits ride the generic op stream as `componentAction` ops (`{ type: "componentAction", blockId, action: "file-tree.addEntry", params }`), which resolve the action from the registry, validate params, and land as an `updateBlock` props patch with the usual inverse. The contract is Agent adapter.
