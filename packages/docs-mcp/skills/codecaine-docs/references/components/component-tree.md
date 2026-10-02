# component-tree

Generated from Codecaine Docs sources. Snapshot: `sha256:df48bff505633507af34872daf2950bc392aeeae845c9eb67ff4956ad352fb08`. Refresh the installation to regenerate these files.

Use Component Tree to show which component renders which, and the hooks each one calls. Write each node as JSX or a hook call. Use Call Stack for plain function calls.

Example: Show the doc page render tree from DocPage down to the code block, marking the hook this change added.

Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/40-component-tree`.

The component-tree component owns one block type, `component-tree`, a nested render tree that shows which component renders which and the hooks each one calls. Each node is one code row with tree guides, an aligned comment column, a diff gutter and a source chip. Use call stack for plain function calls.

## Example

This tree is the workbench doc page, from `App` in `packages/docs-workbench/web/src/shell/App.tsx` down to the renderer or editor that draws one page. Each source chip points at the line that renders the row inside its parent.

```component-tree
<App>  # tree, hash path, theme state  @packages/docs-workbench/web/src/shell/App.tsx:269
  useCodeTheme()  # reads the active code theme  @packages/docs-workbench/web/src/shell/App.tsx:287
  <DocsClientProvider canvasEmbed={…}>  # injects the embed slots  @packages/docs-workbench/web/src/shell/App.tsx:654
    <Sidebar tree={tree} />  @packages/docs-workbench/web/src/shell/App.tsx:690
    <DocPage path={path}>  # one page, read or edited  @packages/docs-workbench/web/src/shell/App.tsx:698
      useTransientHighlights()  # flashes the saved blocks  @packages/docs-workbench/web/src/pages/DocPage.tsx:349
      ? isStatic
        <DocBlockRenderer document={doc} />  # read-only export  @packages/docs-workbench/web/src/pages/DocPage.tsx:1390
      ? mode === "edit"
        <DocEditor onApplyOps={…} />  @packages/docs-workbench/web/src/pages/DocPage.tsx:1400
    <DocPeekPanel projectId="local" />  # side peek for doc links  @packages/docs-workbench/web/src/shell/App.tsx:721
```

## State Schema

All state lives in one prop, defined by `ComponentTreeState` in `packages/docs-model/src/components/component-tree/state.ts`. The row schema is shared with call stack through `outlineRowSchema` in `shared/outline-rows.ts`. The type carries no delta text (`carriesText: false`).

**ComponentTreeState** — packages/docs-model/src/components/component-tree/state.ts#ComponentTreeState

```
nodes: ComponentTreeRow[]  # Top-level nodes, drawn top to bottom.
  text: string  # The component or hook call, written as code. Nonempty.
  kind?: "component" | "hook" | "branch"  # Defaults to component. A branch is a condition row that may own nodes.
  comment?: string  # Short note in the aligned comment column.
  change?: "added" | "modified" | "removed"  # Diff state: gutter marker and row tint.
  source?: string  # Where the row lives, "path:line".
  nodes?: ComponentTreeRow[]  # Children, drawn one level deeper.
```

## Typed Actions

Five actions edit `nodes` in place instead of replacing the whole tree. Each action is also an MCP tool named from its key, such as `docs_component_tree_insert_row`.

- **Index paths address rows**

  - `path` is an integer array whose last element is the position among the addressed siblings.

  - The earlier elements of `path` walk `nodes` down from the root.

- **Each action has one job**

  - `insertRow` and `removeRow` add or delete a row together with its nested `nodes`.

  - `updateRow` patches the row's own fields, and `null` clears an optional field.

  - `moveRow` resolves `to` after the row is removed from `from`.

  - `setRows` replaces the whole tree.

- **Every result is revalidated**

  - Each action returns the props patch `{ nodes }`, and the whole state is checked against `ComponentTreeState` before it persists.

```
component-tree.insertRow(path: integer[], row: ComponentTreeRow) -> Props patch { nodes }, revalidated against ComponentTreeState  # Insert a node row (with optional nested `nodes`) at an index path: the last element is the insert position among the addressed sibling list, preceding elements walk `nodes` from the root.
  path: integer[]  # Index path. [i] inserts at position i among the roots, [a, ..., i] at position i under the node addressed by the prefix.
component-tree.updateRow(path: integer[], patch: object) -> Props patch { nodes }, revalidated against ComponentTreeState  # Patch the node row at an index path. Omitted fields stay. Null clears an optional field. Nested `nodes` are untouched.
  path: integer[]  # Index path of the node, e.g. [0, 2] for the third child of the first root.
  patch: object  # Partial row. Null clears an optional field.
    text?: string  # Replacement row text, written as code.
    kind?: "component" | "hook" | "branch" | null  # Row kind ("component" | "hook" | "branch"). Null clears it.
    comment?: string | null  # Aligned comment. Null clears it.
    change?: "added" | "modified" | "removed" | null  # Diff state ("added" | "modified" | "removed"). Null clears it.
    source?: string | null  # Source location "path:line". Null clears it.
component-tree.removeRow(path: integer[]) -> Props patch { nodes }, revalidated against ComponentTreeState  # Remove the node row at an index path, together with its nested `nodes`.
  path: integer[]  # Index path of the node to remove, e.g. [0, 2].
component-tree.moveRow(from: integer[], to: integer[]) -> Props patch { nodes }, revalidated against ComponentTreeState  # Move the node row at `from` (with its nested `nodes`) to the insert position `to`. `to` is interpreted against the tree AFTER the row is removed.
  from: integer[]  # Index path of the node to move.
  to: integer[]  # Insertion index path (last element = insert position), resolved after the row is detached.
component-tree.setRows(rows: ComponentTreeRow[]) -> Props patch { nodes }, revalidated against ComponentTreeState  # Bulk replace: swap the entire node tree for the given rows.
  rows: ComponentTreeRow[]  # Complete replacement node tree (nested via `nodes`). An empty array empties the block.
```

## Doc Renderer

`OutlineRows` in `packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx` draws the tree in the wide left lane with the `component` flavor, in a panel that shrinks to its content:

- Each node is one row with box-drawing guides. Its tokens take the code theme's TSX colors, VS Code Dark+ by default.

- A branch row leads with `?` in the control-flow color, and its condition is colored as code.

- Comments line up in one column, and a source shows as a muted file name and line. The full path is its tooltip.

- A changed node gets a `+`, `-` or `~` gutter mark and a row tint.

## Agent Renderer

`projectOutlineRows` writes one ````component-tree` fence with one line per node and two spaces of indent per depth:

- A branch line leads with `? `. A comment trails as `  # comment` and a source as `  @path:line`.

- When any node changed, every line opens with a diff column of `+`, `-`, `~` or a blank. A tree with no changes carries no column.

