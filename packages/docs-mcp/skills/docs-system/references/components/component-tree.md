# component-tree

Generated from Docs System sources. Snapshot: `sha256:5661fbb036dd9909949ad219c5c64a78042b1933a3e18da7fb0d17db4949d087`. Refresh the installation to regenerate these files.

Use Component Tree to show which component renders which. Write each row as a rendered JSX element or a branch. Add a hook row only when the page is about that hook, and never for useMemo or useCallback. Name other hooks in prose or pseudocode. Use Call Stack for plain function calls.

Example: Show the doc page render tree from DocPage down to the code block, marking the hook this change added.

Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/40-component-tree`.

The component-tree component owns one block type, `component-tree`, a nested render tree that shows which component renders which. Each node is one code row with tree guides, an aligned comment column, a diff gutter and a source chip. A row is a rendered element or a branch. Add a hook row only when the page is about that hook, and use call stack for plain function calls.

## Example

This tree is the panel that `OutlineRows` in `packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx` draws for a component-tree block. The root's source is its definition, and every other source is the line that renders the row. The tree leaves out the `section`, `figure` and rows `div` wrappers, because no part the reader needs hangs off them.

```component-tree
<OutlineRows id={id} rows={rows} flavor={flavor}>  # one panel of code rows  @packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx:333
  <TreeHead icon={head.icon} title={head.title} />  # family tile and block title  @packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx:355
  ? flat.length === 0
    <div className="docs-tree__empty">  # the (no rows) line  @packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx:366
  ? else
    <div className="docs-tree__row">  # one per row, depth first  @packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx:372
      ? diff  # some row in the block changed
        <TreeMark change={row.change} />  # the +, − or ~ gutter glyph  @packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx:383
      <TreeGuides guides={guides} />  # elbow and pipe guides  @packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx:388
      ? branch
        <BranchMark text={branchText(row.text)} flavor={flavor} />  # the ? before a condition  @packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx:392
      ? row.comment
        <span className="docs-tree__note">  # the comment beside or under the code  @packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx:400
      ? source
        <span className="docs-tree__src">  # the file and line chip  @packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx:402
```

## Write the Rows

Each row copies its render site, so a reader can match the tree to the source files row by row. A tree that rewrites a condition, drops a guard or invents a row misleads that reader.

- **Row Text**

  - Copy each component row from the JSX at its render site, such as `<TreeHead icon={head.icon} title={head.title} />`.

  - Keep at most 3 props on a row, the ones that pass data, children or a render callback to a row in the tree. Drop the other props with no marker, because a bare `…` is not valid JSX.

  - Write a conditional, long or utility-class prop value as `{…}`, such as `className={…}` for `p-3 text-ui-lg`. Keep a class name that names the part, such as `docs-tree__note`.

  - Put a child that a parent renders through a callback prop, such as `renderCanvas={renderCanvas}`, under the component that calls the callback. Keep that prop on the parent row.

  - Draw a child that reaches the tree by 2 paths, such as a provider slot and a render callback, under each parent that creates it. Give each copy the source line of its own path.

- **Branches**

  - Write a branch row's text as the source's own condition, such as `props.selectedId === "theme.presets"`, not a paraphrase.

  - Give each arm of an if/else, a ternary or an early-return chain its own branch row. Write each later test in a chain as `else if` plus its condition, and the last arm as `else`, or as `default` in a switch.

  - Nest an inner condition's branch rows under the outer branch row, as the source nests them. Each row's guards then read from its ancestors.

  - In a chain of 3 or more arms, keep an arm that renders nothing as a branch row with no children and the comment `renders nothing`.

- **Scope**

  - Start the tree at the root the brief names, and stop at the leaves it names.

  - Leave out an intrinsic element such as `div`, `section`, `aside` or `nav`, and move its component children up to its depth. Keep it when the brief names the part it draws, or when children slot into it.

  - Keep one root per tree. Expand a component under every place that renders it, each copy with the props that place passes.

- **Sources and Comments**

  - Give the root row the source of its own definition, such as `OutlineRows.tsx:333` in the example.

  - Give every other row the line in its parent's file that renders it. A row that a `map` callback renders takes the line of its JSX.

  - Write a component comment as what the row draws, such as its regions or controls, never only its position. Leave out a comment that repeats the row's name or props, narrates event handlers, or gives only a package name.

  - Give a branch row a comment only when it adds a fact its condition does not state, such as what the user did to reach that case.

## State Schema

All state lives in one prop, defined by `ComponentTreeState` in `packages/docs-model/src/components/component-tree/state.ts`. The row schema is shared with call stack through `outlineRowSchema` in `shared/outline-rows.ts`. The type carries no delta text (`carriesText: false`).

**ComponentTreeState** — packages/docs-model/src/components/component-tree/state.ts#ComponentTreeState

```
nodes: ComponentTreeRow[]  # Top-level nodes, drawn top to bottom.
  text: string  # The component or hook call, written as code. Nonempty.
  kind?: "component" | "hook" | "branch"  # Defaults to component. A branch is a condition row that may own nodes. Give each arm of an if/else or a ternary its own branch row with the source's own condition, such as descriptor, and write the last arm as else. The reader then sees which nodes render in which case.
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
[action] component-tree.insertRow(path: integer[], row: ComponentTreeRow) -> Props patch { nodes }, revalidated against ComponentTreeState  # Insert a node row (with optional nested `nodes`) at an index path: the last element is the insert position among the addressed sibling list, preceding elements walk `nodes` from the root.
  path: integer[]  # Index path. [i] inserts at position i among the roots, [a, ..., i] at position i under the node addressed by the prefix.
  row: ComponentTreeRow
[action] component-tree.updateRow(path: integer[], patch: object) -> Props patch { nodes }, revalidated against ComponentTreeState  # Patch the node row at an index path. Omitted fields stay. Null clears an optional field. Nested `nodes` are untouched.
  path: integer[]  # Index path of the node, e.g. [0, 2] for the third child of the first root.
  patch: object  # Partial row. Null clears an optional field.
    text?: string  # Replacement row text, written as code.
    kind?: "component" | "hook" | "branch" | null  # Row kind ("component" | "hook" | "branch"). Null clears it.
    comment?: string | null  # Aligned comment. Null clears it.
    change?: "added" | "modified" | "removed" | null  # Diff state ("added" | "modified" | "removed"). Null clears it.
    source?: string | null  # Source location "path:line". Null clears it.
[action] component-tree.removeRow(path: integer[]) -> Props patch { nodes }, revalidated against ComponentTreeState  # Remove the node row at an index path, together with its nested `nodes`.
  path: integer[]  # Index path of the node to remove, e.g. [0, 2].
[action] component-tree.moveRow(from: integer[], to: integer[]) -> Props patch { nodes }, revalidated against ComponentTreeState  # Move the node row at `from` (with its nested `nodes`) to the insert position `to`. `to` is interpreted against the tree AFTER the row is removed.
  from: integer[]  # Index path of the node to move.
  to: integer[]  # Insertion index path (last element = insert position), resolved after the row is detached.
[action] component-tree.setRows(rows: ComponentTreeRow[]) -> Props patch { nodes }, revalidated against ComponentTreeState  # Bulk replace: swap the entire node tree for the given rows.
  rows: ComponentTreeRow[]  # Complete replacement node tree (nested via `nodes`). An empty array empties the block.
```

## Doc Renderer

`OutlineRows` in `packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx` draws the tree in the wide left lane with the `component` flavor, in a panel that shrinks to its content:

- Each node is one row with box-drawing guides. Its tokens take the code theme's TSX colors, VS Code Dark+ by default.

- A branch row leads with `?` in the control-flow color, and its condition is colored as code.

- Comments line up in one column. A source chip shows the shortest path tail that tells the block's files apart, such as `AppShell/index.tsx:73`, and the full path is its tooltip.

- A changed node gets a `+`, `-` or `~` gutter mark and a row tint.

- When the code leaves the comments too little room, each comment moves under its row and the chip stays on the code line. A long row wraps between props, under its own first line.

## Agent Renderer

`projectOutlineRows` writes one ````component-tree` fence with one line per node and two spaces of indent per depth:

- A branch line leads with `? `. A comment trails as `  # comment` and a source as `  @path:line`.

- When any node changed, every line opens with a diff column of `+`, `-`, `~` or a blank. A tree with no changes carries no column.

