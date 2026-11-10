# stack

Generated from Docs System sources. Snapshot: `sha256:166e56d1065c0db1ba5dbc6a721f1637ba900d2f518da00df1b2ad89da143c97`. Refresh the installation to regenerate these files.

Use Stack to show layering and the rule enforced at each line: which layer uses which, and what may never cross. Write the layers as a tree of nodes, mark a node `uses` to draw an arrow to its next sibling, and add a boundary after a node to draw the rule beneath it. Draw a uses arrow when a source shows or states that the node imports or calls its next sibling, such as an import line or a call in a function body. A type that a layer only takes as a parameter is not a call. When the sources state a rule but no import or call, such as a path check that a value must pass, draw no arrow and write the rule as a boundary. Give each line between two sibling layers a boundary when the sources hold a rule for it. A boundary states a restriction or a required interface, such as "docs-viewer never imports host-app code" or "data enters only through `DocsClient`". It never describes what a layer outputs. Put each rule beneath the layer whose code enforces it. Name the check, the function that runs it, and what a refused value becomes. Name each exception the source makes, such as the tools that skip the check. A rule never only names a kind of check, such as "Lexical checks". Give each detail a fact that the name, the arrow label and the rule do not state. Write it as segments split by ` · `: the layer's file path first when it has one, then the exports that the layer above calls. A badge is one role word that is not in the name, such as `pure` or `host`. Put a file path in the detail, never in the badge. Wrap each code name in a detail or a rule in backticks, such as `checkDocsPath`, so the stack sets it in the code face. Give a leaf a color only when the page says what the color marks. When a layer also imports or calls a layer further down, say so in its detail and in the prose next to the stack. Keep the layer count in the prose equal to the nodes the stack draws. Use Canvas instead when the picture needs free placement or arbitrary edges.

Example: Show the package layering: host apps above the docs framework, docs-model nested as the pure layer, and the import rule between each layer.

Canonical document: `10-system-design/40-block-vocabulary/50-flow-and-diagrams/30-stack`.

The stack component owns one block type, `stack`, a boundary stack that shows layering and the rule enforced at each line. Nodes nest top to bottom, a uses arrow points from a node to its next sibling, and a dashed boundary line states what may never cross. The block takes no coordinates. When a diagram needs free placement or arbitrary edges, use canvas.

## Example

This stack is the package layering that `import-boundaries.test.ts` enforces at the repository root. Each dashed line is one test in that file.

```
Host apps — outside the framework
  Spectre [host app] — @spectre/* · @/* · apps/{frontend,backend,data-backend,tailer}/
↓
── framework code never imports host-app code ──
Docs framework — host-agnostic
  docs-workbench [host] — docs serve and export · workbench shell
  ↓
  docs-viewer [product] — DocBlockRenderer · TipTap editor
  ↓
  ── docs-model stays pure: no React, no DOM libs ──
  docs-model [pure] — doc.json schema · block vocabulary · Markdown projection
↓
── docs-model imports canvas and sequence only through agent-schema ──
External — external/
  @codecaine-ai/canvas/agent-schema — external/canvas
  @codecaine-ai/sequence/agent-schema — external/sequence
```

## State Schema

All state lives in two props, defined by `StackState` in `packages/docs-model/src/components/stack/state.ts`. The type carries no delta text (`carriesText: false`).

**StackState** — packages/docs-model/src/components/stack/state.ts#StackState

```
nodes: StackNode[]  # Top-level layers, drawn top to bottom.
  name: string  # Unique across the whole stack. Boundaries address nodes by name.
  detail?: string
  badge?: string
  color?: "gray" | "blue" | "green" | "orange" | "yellow" | "red" | "purple" | "pink"  # Container tint, or the role colour on a leaf. Containers default to gray.
  uses?: true | string  # Draws an arrow to the next sibling. A string labels the arrow.
  columns?: 2  # Lays the children side by side.
  children?: StackNode[]  # Makes the node a container.
boundaries?: StackBoundary[]
  after: string  # Name of the node the line sits beneath.
  rule: string
```

Once the schema passes, `stackState.check` enforces three invariants:

- Node names are unique across the whole tree.

- Every boundary names an existing node, and at most one boundary follows each node.

- A `uses` arrow needs a next sibling, so the last sibling cannot carry one.

## Typed Actions

Six actions edit the tree and its boundary lines by node name. Each action is also an MCP tool, such as `docs_stack_add_node`.

- **Node actions**

  - `addNode` inserts a node under a named parent or at the top level.

  - `updateNode` patches a node's own fields.

    - A rename also repoints the boundary whose `after` names the node.

  - `removeNode` deletes the node, its subtree, and every boundary that follows a removed node.

  - `moveNode` moves a node with its subtree, and `parent: null` moves it to the top level.

- **Boundary actions**

  - `setBoundary` draws or replaces the line beneath a node, matched by `after`.

  - `removeBoundary` deletes the line beneath a named node.

- **Invariants hold after every action**

  - Each action rechecks the `stackState` schema and invariants and refuses a result that breaks them.

  - A duplicate name, a `uses` arrow with no next sibling, or a boundary after a missing node is refused.

```
[action] stack.addNode(node: StackNode, parent?: string, index?: integer) -> Props patch with the changed nodes, boundaries, or both  # Insert a node with any children at the top level or under the named parent. Index defaults to the end. Names must stay unique across the stack.
  node: StackNode
  parent?: string  # Name of the parent node. Omit to insert at the top level.
  index?: integer  # Insert position among the parent's children. Default end.
[action] stack.updateNode(name: string, patch: object) -> Props patch with the changed nodes, boundaries, or both  # Patch the named node's own fields and leave its children alone. patch.name renames it and repoints any boundary after it.
  name: string  # Name of the node to patch.
  patch: object  # Partial node. Null clears detail, badge, color, uses, or columns.
    name?: string  # New name. Must stay unique.
    detail?: string | null  # One line under the name. Null clears.
    badge?: string | null  # Short tag beside the name. Null clears.
    color?: "gray" | "blue" | "green" | "orange" | "yellow" | "red" | "purple" | "pink" | null  # Container tint or leaf badge color. Null clears.
    uses?: true | string | null  # true draws an unlabeled arrow to the next sibling, a string labels it, null removes it.
    columns?: 2 | null  # 2 lays children in two columns. Null clears.
[action] stack.removeNode(name: string) -> Props patch with the changed nodes, boundaries, or both  # Remove the named node with its whole subtree, and every boundary that follows a removed node.
  name: string  # Name of the node to remove.
[action] stack.moveNode(name: string, parent?: string | null, index?: integer) -> Props patch with the changed nodes, boundaries, or both  # Move the named node with its subtree under another parent or to the top level, at an index resolved after the node is detached. Boundaries move with it.
  name: string  # Name of the node to move.
  parent?: string | null  # New parent's name. Null moves to the top level. Omit to stay under the current parent.
  index?: integer  # Insert position among the destination's children after detaching. Default end.
[action] stack.setBoundary(after: string, rule: string) -> Props patch with the changed nodes, boundaries, or both  # Draw or replace the dashed boundary line beneath the named node, labeled with the rule enforced there. Upserts by `after`.
  after: string  # Name of the node the line sits beneath.
  rule: string  # The rule enforced at this line.
[action] stack.removeBoundary(after: string) -> Props patch with the changed nodes, boundaries, or both  # Remove the boundary line beneath the named node.
  after: string  # Name of the node whose boundary line to remove.
```

## Doc Renderer

`StackBlock` in `packages/docs-viewer/src/components/stack/StackDocsBlock.tsx` draws the tree in the wide lane and shrinks it to its content:

- A node with children renders as a section with a tinted fill, a 1px frame in its layer colour, and a title chip pinned top-left in uppercase code font. Its detail shows only as the header's hover title.

- A leaf renders as a card with its name, then its detail. A name that is prose, such as "Docs server route", draws in the sans face, and any other name draws in code font.

  - A card's role draws a 3px left edge in the node colour, or else the layer colour. The role also shows as a small code-font word in the case it was written, at the right of the name row and as the card's hover title.

  - A detail that is not a path joins its segments with commas in the body face. In a path detail, each bare path segment gets its own muted code-font line, and the other segments join with commas on one line below.

  - A backtick span in a detail or a rule, such as ``checkDocsPath``, draws in code font without its backticks.

- A uses arrow is a 1.5px stem with an arrowhead. A string `uses` value labels the arrow with a code-font tag beside the stem.

  - A boundary draws a 1.5px dashed line across the stack, with the rule sentence beneath it in the body face. Next to a crossing arrow, the line and the rule start just right of the arrow, so the two never overlap.

- `columns: 2` lays a container's children in a two-column grid. Arrows and boundaries inside it span both columns.

The `layout.stack-detail-fit` warning flags a leaf detail line that needs a second line at stock theme settings. A body-face line wraps at 60ch of 13.5px Inter, 506.25px, and each path line wraps at 60ch of 13px IBM Plex Mono, 468px. Inside two-column containers a card can be narrower than that cap, and then the card's width counts. Like every layout rule in Authoring Lints, the warning never blocks a save.

## Agent Renderer

The projection is one fenced outline with two spaces of indent per depth:

- A node line reads `name [badge] — detail`, with the badge and detail omitted when absent.

- A uses arrow is a `↓` line after the node and its children, followed by the label when one is set.

- A boundary is a `── rule ──` line at the indent of the node it follows.

## Theme

Every visual value reads a `--docs-stack-*` token, then a role token, then a light literal. A node colour maps onto the category roster: blue reads `--docs-cat-1`, green `--docs-cat-3`, yellow and orange `--docs-cat-4`, purple `--docs-cat-5`, pink and red `--docs-cat-6`, and gray `--docs-muted`. A section fill mixes its colour into the page at 7%, 10.5%, and 14% by nesting level, or at 10%, 15%, and 20% in dark mode. The boundary line and the arrows read `--docs-stack-boundary` and `--docs-stack-arrow`, which both fall back to `--docs-muted`.

## Agent Adapter

Agents create a stack with `insertBlock` and edit it through the six actions as `componentAction` ops. The docs-edit session also lists stack among its `set_props` types, so a session can replace the tree through the same validated props write.

