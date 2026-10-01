# stack

Generated from Codecaine Docs sources. Snapshot: `sha256:df48bff505633507af34872daf2950bc392aeeae845c9eb67ff4956ad352fb08`. Refresh the installation to regenerate these files.

Use Stack to show layering and the rule enforced at each line: which layer uses which, and what may never cross. Write the layers as a tree of nodes, mark a node `uses` to draw an arrow to its next sibling, and add a boundary after a node to draw the rule beneath it. Use Canvas instead when the picture needs free placement or arbitrary edges.

Example: Show the package layering: host apps above the docs framework, docs-model nested as the pure layer, and the import rule between each layer.

Canonical document: `10-system-design/40-block-vocabulary/50-flow-and-diagrams/30-stack`.

The stack component owns one block type, `stack`, a boundary stack that shows layering and the rule enforced at each line. Nodes nest top to bottom, a uses arrow points from a node to its next sibling, and a dashed boundary line states what may never cross. The block takes no coordinates. Use canvas when a diagram needs free placement or arbitrary edges.

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
  color?: "gray" | "blue" | "green" | "orange" | "yellow" | "red" | "purple" | "pink"  # Container tint, or the badge color on a leaf. Containers default to gray.
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

The stack has no named actions. An `updateBlock` op replaces `nodes` or `boundaries` whole, and the write is validated against `StackState` and its invariants.

## Doc Renderer

`StackBlock` in `packages/docs-viewer/src/components/stack/StackDocsBlock.tsx` draws the tree in the standard text lane:

- A node with children renders as a tinted container with its name pinned in a header chip. The fill deepens one step per nesting level.

- A leaf renders as a card with its name in code font, an optional badge, and one detail line.

- A uses arrow is a thin stem with an arrowhead. When a boundary follows the same node, the arrow crosses the dashed line.

- `columns: 2` lays a container's children in a two-column grid. Arrows and boundaries inside it span both columns.

## Agent Renderer

The projection is one fenced outline with two spaces of indent per depth:

- A node line reads `name [badge] — detail`, with the badge and detail omitted when absent.

- A uses arrow is a `↓` line after the node and its children, followed by the label when one is set.

- A boundary is a `── rule ──` line at the indent of the node it follows.

## Theme

Every visual value reads a `--docs-stack-*` token with a literal fallback. A node color resolves `--docs-stack-<color>` first, then the palette's `--color-text-<color>`. The boundary line reads `--docs-stack-boundary`, which falls back to the palette red.

## Agent Adapter

Agents create a stack with `insertBlock` and edit it with `updateBlock`. The docs-edit session lists `stack` among its `set_props` types, so a session edits the tree through the same validated props write.

