The file-tree component owns one block type, `file-tree`: the vocabulary's annotated path tree. A flat list of path entries in props renders — on both surfaces — as a `tree`-command drawing, with per-entry notes and change markers for describing repo slices and refactors. State and actions live in `packages/docs-model/src/components/file-tree/`; the doc render lives in `packages/docs-viewer/src/components/file-tree/`.

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
entries: FileTreeEntry[]  # Flat list of path entries; the rendered tree derives from path prefixes.
  path: string  # /-separated, no leading "./"; a trailing "/" marks an explicit directory.
  note?: string  # Short annotation rendered after the path.
  change?: "added" | "removed" | "modified" | "renamed"  # Diff marker for the entry.
  from?: string  # Previous path, used with change: "renamed".
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

All state is one props key: `entries`, an array of path entries validated by the closed `FileTreeState` schema. The type carries no delta text (`carriesText: false`) and no title prop — every fact lives in `entries`. The contract is State schema.

- Path rules

  - `path` is /-separated; `validateTreePath` in `lib.ts` rejects a leading "./", a leading "/", and empty segments on every action write.

  - Directories need no entries of their own — they are derived from path prefixes, and a derived directory carries no note or change state.

  - An entry authored as a file is promoted to a directory when later entries nest beneath it.

> **Gotcha** — The trailing "/" is the directory marker. An entry without it renders as a file — and files sort after directories — so a bare directory path lands styled and ordered as a file. Author an explicit directory as `path/`.

- Tolerant read

  - `readFileTreeEntries` skips an entry whose `path` is missing or empty and drops wrong-typed `note`/`change`/`from` values; nothing is repaired.

  - Actions match the `path` string literally — keep paths exact.

## Typed Actions

Three actions — one file each under `actions/` — are the type's whole custom write surface. `addEntry` is the Structure excerpt on Typed actions.

- `addEntry`

  - Appends to the end of `entries`; a duplicate path is an error.

  - Params are `path` plus optional `note` and `change` — `from` enters only through `updateEntry`.

- `updateEntry`

  - Patches `note`/`change`/`from` in place; `null` clears a field.

  - `newPath` renames without moving — the entry keeps its array position; a `newPath` that collides with another entry is an error.

- `removeEntry`

  - Deletes by exact path; a missing path is an error, not a no-op.

**file-tree — entry actions**

```
file-tree.addEntry(path: string, note?: string, change?: string) -> props patch: { entries }  # Append a path entry (optional note and change marker) to the file tree.
file-tree.removeEntry(path: string) -> props patch: { entries }  # Remove the entry with the given path from the file tree.
file-tree.updateEntry(path: string, note?: string | null, change?: string | null, from?: string | null, newPath?: string) -> props patch: { entries }  # Patch an entry's note/change/from, or rename it via newPath (in place).
```

Every `apply` is pure — entries in, a props patch `{ entries }` out — and the patch revalidates against `FileTreeState` before anything persists.

## Doc Renderer

`FileTreeDocsBlock` (`FileTreeDocsBlock.tsx`) draws the block on the doc surface — reader and editor alike — as a bordered monospace panel: a `.` root line, then one row per node with `tree`-style guides (`├──`, `└──`, `│`). An empty `entries` array renders a `(no entries)` placeholder. The contract is Doc renderer.

- Ordering

  - Directories sort first at every level, then names in ascending codepoint order; directory names render with a trailing "/".

  - The order matches the agent render exactly — the two surfaces agree by design.

- Change markers

  - A change tints the row and puts its marker in the gutter: `+` added (emerald), `-` removed (rose, name struck through), `~` modified (amber), `>` renamed (sky).

  - A renamed row draws the old `from` path struck through, then `→`, then the new name.

- Notes

  - `note` renders as a muted `# note` comment after the name, truncated at 48ch with the full text on hover.

- In the editor

  - `file-tree` is an atom leaf node (`ATOM_BLOCK_TYPES` in `schema.ts`): read-only, rendered by the same `FileTreeDocsBlock` through the shared atom node view.

  - No slash-menu entry — file trees enter through agent ops or existing content.

## Agent Renderer

`projectFileTree` in `agent-view.ts` renders the same tree as literal text inside a bare fence — the greppable form an agent reads. The Example block above projects to:

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

- Ordering and guides match the doc render; top-level nodes render flat, with no `.` root line.

- Notes append as `  # note`; directory names keep the trailing "/".

- Change markers prefix the line: `+` added, `-` removed, `~` modified, `>` renamed.

- The render is pure and pinned byte-for-byte by goldens; the obligations are Agent renderer.

## Theme

This block's theme file is `components/file-tree.json` in a theme folder (`themes/<id>/`; the system is Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY` in `theme-folders.ts`. The contract is Theming.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-file-tree-border | Container border |
| note | --docs-file-tree-note-fg | Per-entry note text color |

The registry carries exactly these two keys for `file-tree`, both colors. The diff row tints and guide colors are fixed styles, not tokens.

## Agent Adapter

The family uses the default adapter: no agent of its own, no forwarding to an external authority. All three actions declare `apply`, so agent edits ride the generic op stream as `componentAction` ops — `{ type: "componentAction", blockId, action: "file-tree.addEntry", params }` — which resolve the action from the registry, validate params, and land as an `updateBlock` props patch with the usual inverse. The contract is Agent adapter.
