The annotated path tree of the block vocabulary: a flat list of path entries in props that renders — on both surfaces — as a `tree`-command drawing, with notes and per-entry change markers for describing repo slices and refactors.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| title | string | no | Optional bold caption above the tree. |
| entries | array | yes | Array of { path, note?, change?, from? } — see below. |

**One entry**

| prop | type | required | notes |
| --- | --- | --- | --- |
| path | string | yes | /-separated, no leading "./"; a trailing "/" marks an explicit directory. |
| note | string | no | Short annotation rendered after the path. |
| change | "added" / "removed" / "modified" / "renamed" | no | Diff marker for the entry. |
| from | string | no | Previous path, used with change: "renamed". |

No text (`carriesText: false`). Directories don't need their own entries — they are derived from path prefixes.

## Markdown render

An optional `**<title>**` bold line, then a literal tree rendering inside a bare fence: `├──`/`└──`/`│` guides, directories first then alphabetical (deterministic codepoint order), notes appended as `# note`. Change markers prefix the line — `+` added, `-` removed, `~` modified, `>` renamed (rendered as `{from} -> {name}`) — and when any entry carries a marker, unmarked lines are padded with two spaces so the guides stay aligned.

## Typed actions

Ordering is stable by design: `addEntry` appends (and rejects a duplicate path), `updateEntry` patches or renames in place (`newPath` keeps position; `null` clears `note`/`change`/`from`), `removeEntry` deletes by exact path.

**file-tree — entry actions**

```
file-tree.addEntry(path: string, note?: string, change?: string) -> props patch: { entries }  # Append a path entry (optional note and change marker) to the file tree.
file-tree.removeEntry(path: string) -> props patch: { entries }  # Remove the entry with the given path from the file tree.
file-tree.updateEntry(path: string, note?: string | null, change?: string | null, from?: string | null, newPath?: string) -> props patch: { entries }  # Patch an entry's note/change/from, or rename it via newPath (in place).
```

## In the editor

A non-editable atom leaf node rendered by `FileTreeDocsBlock`. No slash-menu entry today — file trees enter through agent ops or existing content.

## Agent notes

- Malformed entries are skipped on read, not repaired — keep paths exact (`removeEntry`/`updateEntry` match the `path` string literally).

- The rename marker is the whole diff story: set `change: "renamed"` plus `from` and the markdown render draws `old -> new` on one line.

## Theming

This block's theme file is `components/file-tree.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-file-tree-border | Container border |
| note | --docs-file-tree-note-fg | Per-entry note text color |
