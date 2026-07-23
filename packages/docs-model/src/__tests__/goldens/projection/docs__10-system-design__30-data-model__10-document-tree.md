A `doc.json` document is a normalized block tree: a root pointer, a flat id-keyed `blocks` map, and ordered child-id arrays. There is no nesting in the JSON itself — tree order lives entirely in the `children` arrays. The vocabulary of valid block shapes stays deliberately small; see the block vocabulary.

## The Document Envelope

```json
{
  "schemaVersion": 1,
  "id": "example-data-shape",
  "title": "Tiny doc",
  "root": "b-example-root",
  "blocks": {
    "b-example-root": {
      "id": "b-example-root",
      "type": "paragraph",
      "props": {},
      "children": [
        "b-example-title",
        "b-example-body"
      ]
    },
    "b-example-title": {
      "id": "b-example-title",
      "type": "heading",
      "props": { "level": 1 },
      "text": [{ "insert": "Tiny doc" }],
      "children": []
    },
    "b-example-body": {
      "id": "b-example-body",
      "type": "paragraph",
      "props": {},
      "text": [{ "insert": "A normalized block tree." }],
      "children": []
    }
  }
}
```
> **L5 (Root pointer):** The document root names a block shell. Both the viewer and the markdown render skip the root's own paragraph wrapper and walk only its children.
> **L6-15 (Normalized tree):** Storage is a flat id-keyed map; ordered children arrays carry tree order. A sibling reorder is localized to the children array under the deterministic serializer.
> **L8,17,24 (Anchor invariant):** The map key and block id match. Comments, patches, and backlinks anchor to ids; updateBlock preserves them, while split and merge mint fresh ids.

## The Block

```json
{
  "id": "b-example-code-7",
  "type": "code",
  "props": {
    "language": "ts",
    "annotations": [
      {
        "lines": "3-5",
        "label": "Invariant",
        "note": "Validation keeps shape errors explicit."
      }
    ]
  },
  "text": [
    { "insert": "export const stable = true;\n" }
  ],
  "children": []
}
```
> **L3 (Canonical type):** The canonical kind key is type — one of the 14 canonical block types. Legacy aliases and retired types are handled on read; see below.
> **L4-12 (Typed props):** Props are typed per block type: code uses language and annotations, heading uses level, image uses src/alt/caption, and so on. The per-type schemas are the block-state page.
> **L14-16 (Optional text):** text is present only on types that carry delta rich text; the span shape is the rich-text page.
> **L17 (Ordered children):** children is always present. It stores ordered child ids, even when the block has no children.

The kind key is `type`; the retired `flavour` key is rejected with a typed validation issue. An unknown type name coerces to a callout with the name kept in `props.kind` — a retired type never fails validation.

## Ids Are Anchors

Document ids, block ids, and child references are all stable ASCII ids matching `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$`. Every block's `id` must equal its key in the `blocks` map — the id is stored twice on purpose, so a block stays self-describing when it travels without its map.

> **Anchor contract** — Annotations, patches, and backlinks anchor to block ids, so id stability is a behavioral contract: `updateBlock` and `moveBlock` preserve ids, while `splitBlock` and `mergeBlocks` mint fresh ids for the blocks they create. Anything that anchors to a split or merged block must expect the anchor to dangle.

## Graph Invariants

`validateDocDocument` treats the tree as a real graph, not a bag of blocks. It is pure and never throws — failures come back as a typed issue list with JSONPath-style paths. Beyond per-block shape checks, five structural invariants hold:

- **No orphan references**

  - Every id in a `children` array must resolve to a block in the map.

- **Single parent**

  - A block may be referenced as a child by at most one parent; shared children are rejected.

- **Root is nobody's child**

  - The root block must exist in `blocks` and cannot appear in any children array.

- **No cycles**

  - The walk from root must never revisit a block.

- **Everything reachable**

  - Every non-root block must be reachable from the root exactly once; detached subtrees are rejected.

## Nesting

Any block may parent any block — the invariants constrain the graph, not the pairing. Convention keeps the tree flat:

- List-items nest: a list-item's children render as indented sub-bullets.

- Callouts group: a callout may hold the blocks that support it.

- Everything else stays flat. The editor lands block drops and block-run pastes at top level, never inside a neighbor — depth is authored deliberately, not created by accident.

## Seven Ops, One Write Path

Everything that changes a document is one of seven ops, and every successful apply returns exact inverse ops that become undo units. The full mutation concept lives in the mutation model; this surface is the data shape.

**DocOp kernel**

```
insertBlock(blockId: string, parentId: string, index: number, blockType: DocBlockType, props: object, text?: DeltaSpan[]) -> { doc, inverse: DocOp[] }  # Insert a fresh non-colliding block under parentId at index.
  blockId: string  # Stable id for the new block.
  parentId: string  # Existing parent block id.
  index: number  # Position within the parent's children.
  blockType: DocBlockType  # One of the 14 canonical block types.
  props: object  # Initial typed props.
  text?: DeltaSpan[]  # Optional initial rich text.
updateBlock(blockId: string, props?: object, text?: DeltaSpan[] | null) -> { doc, inverse: DocOp[] }  # Shallow-merge props and/or replace text while preserving the block id.
  blockId: string  # Target block id.
  props?: object  # Patch; a key set to undefined removes that prop.
  text?: DeltaSpan[] | null  # Replacement text; null clears text.
deleteBlock(blockId: string, mode?: "subtree" | "reparent") -> { doc, inverse: DocOp[] }  # Delete a block as a subtree, or splice its children into the parent.
  blockId: string  # Target block id.
  mode?: "subtree" | "reparent"  # subtree is the default; reparent splices children into the former slot.
moveBlock(blockId: string, toParentId: string, toIndex: number) -> { doc, inverse: DocOp[] }  # Move a block under toParentId at toIndex, checking cycles.
  blockId: string  # Block being moved.
  toParentId: string  # Destination parent id.
  toIndex: number  # Destination child index after detach.
splitBlock(blockId: string, offset: number) -> { doc, inverse: DocOp[] }  # Split a block's delta text at a character offset; the new sibling gets a fresh id.
  blockId: string  # Text block to split.
  offset: number  # Character offset in [0, textLength].
mergeBlocks(blockIds: string[]) -> { doc, inverse: DocOp[] }  # Merge two or more contiguous siblings in document order into a fresh block.
  blockIds: string[]  # The contiguous sibling ids to merge.
componentAction(blockId: string, action: string, params: object) -> { doc, inverse: DocOp[] }  # Resolve a named typed action and apply its validated result through updateBlock.
  blockId: string  # Target block id.
  action: string  # Registry key in the form <blockType>.<verb>.
  params: object  # Action-specific params validated by the action.
```
