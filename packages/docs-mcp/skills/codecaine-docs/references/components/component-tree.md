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

The component tree has no named actions. An `updateBlock` op replaces `nodes` whole, and the write is validated against `ComponentTreeState`.

## Doc Renderer

`OutlineRows` in `packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx` draws the tree in the wide left layout with the `component` flavor:

- Each node is one row with box-drawing guides. JSX tags, props, strings and `useX(` hook calls get their own token colors.

- A branch row renders its condition in muted ink.

- Comments line up in one column, and a source shows as a chip with the file name and line. The full path is the chip's tooltip.

- A changed node gets a `+`, `-` or `~` gutter mark and a row tint.

## Agent Renderer

`projectOutlineRows` writes one ````component-tree` fence with one line per node and two spaces of indent per depth:

- A branch line leads with `? `. A comment trails as `  # comment` and a source as `  @path:line`.

- When any node changed, every line opens with a diff column of `+`, `-`, `~` or a blank. A tree with no changes carries no column.

