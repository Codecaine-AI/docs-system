# The data model: doc.json shapes

The docs system has one on-disk content format: `doc.json`. A document is a normalized block tree: a root pointer, a flat id-keyed `blocks` map, and ordered child-id arrays. The vocabulary of valid block shapes stays deliberately small; see the block vocabulary — what each of the 14 types is for.

Agents read through a pure markdown projection and write through the same seven-op kernel the editor uses. That keeps reading greppable, writing enumerable, and file bytes deterministic enough for reviewable diffs.

This page is system-agnostic: it describes shapes and invariants, not transport wiring. The one HTTP-shaped exception is the `GET /api/blocks` discovery payload, because that payload is itself data.

## The document envelope

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
> **L5 (Root pointer):** The document root names a block shell. Rendering and projection skip the root's own paragraph chrome and walk only its children.
> **L6-15 (Normalized tree):** Storage is a flat id-keyed map; ordered children arrays carry tree order. A sibling reorder is localized to the children array under the deterministic serializer.
> **L8,17,24 (Anchor invariant):** The map key and block id match. Comments, patches, and backlinks anchor to ids; updateBlock preserves them, while split and merge mint fresh ids.

## The block

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
> **L3 (Canonical type):** The canonical kind key is type. The legacy flavour key is accepted only on read as an alias, and retired string types coerce to callout while preserving the old name as props.kind.
> **L4-12 (Typed props):** Props are typed per block type: code uses language and annotations, heading uses level, image uses src/alt/caption, and so on.
> **L17 (Ordered children):** children is always present. It stores ordered child ids, even when the block has no children.

```json
[
  { "insert": "Read " },
  { "insert": "doc.json", "attributes": { "code": true } },
  { "insert": " with " },
  { "insert": "stable anchors", "attributes": { "bold": true, "italic": true } },
  { "insert": " and a link", "attributes": { "link": "https://example.com/docs" } },
  { "insert": " to " },
  {
    "insert": "the block vocabulary",
    "attributes": {
      "reference": {
        "kind": "doc",
        "path": "docs/10-system-design/10-block-vocabulary.md",
        "label": "the block vocabulary"
      }
    }
  },
  { "insert": "." }
]
```
> **L3,5 (Marks):** Rich text is delta spans. Marks are literal true flags when present; absent marks are simply absent.
> **L6 (Outbound link):** link is the external URL mark on the span that carries it.
> **L11-15 (Reference chip):** reference carries the shared SpectreRef identity for doc mentions and canvas links alike: kind is doc or source, path is repo-relative, and label is display text.

Validation treats the tree as a real graph, not a bag of blocks: child refs must resolve, a child can have only one parent, the root cannot be a child, cycles are rejected, and every non-root block must be reachable from the root. Serialization is deterministic too: stable key order at every level, blocks emitted in depth-first document order, and the same document becomes identical bytes.

## Seven ops, one write path

Everything that changes a document is one of seven ops, and every successful apply returns exact inverse ops that become undo units. The full mutation concept lives in the mutation model — ops, inverses, undo; this surface is the data shape.

**DocOp kernel**

```
insertBlock(blockId: string, parentId: string, index: number, blockType: DocBlockType, props: object, text?: DeltaSpan[]) -> { doc, inverse: DocOp[] }  # Insert a fresh non-colliding block under parentId at index.
updateBlock(blockId: string, props?: object, text?: DeltaSpan[] | null) -> { doc, inverse: DocOp[] }  # Shallow-merge props and/or replace text while preserving the block id.
deleteBlock(blockId: string, mode?: "subtree" | "reparent") -> { doc, inverse: DocOp[] }  # Delete a block as a subtree, or splice its children into the parent.
moveBlock(blockId: string, toParentId: string, toIndex: number) -> { doc, inverse: DocOp[] }  # Move a block under toParentId at toIndex, checking cycles.
splitBlock(blockId: string, offset: number) -> { doc, inverse: DocOp[] }  # Split a block's delta text at a character offset; the new sibling gets a fresh id.
mergeBlocks(blockIds: string[]) -> { doc, inverse: DocOp[] }  # Merge two or more contiguous siblings in document order into a fresh block.
blockAction(blockId: string, action: string, params: object) -> { doc, inverse: DocOp[] }  # Resolve a named typed action and apply its validated result through updateBlock.
```

## Typed actions as data

The 14 block types are owned by seven component bundles under packages/docs-model/src/components/. Each type declares carriesText; five types (paragraph, heading, list-item, quote, and callout) carry text. Component manifests also expose state schemas and named actions, while all types remain available to the seven kernel ops.

```json
{
  "action": "file-tree.addEntry",
  "blockType": "file-tree",
  "description": "Append a path entry to the file tree.",
  "params": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "/-separated path; trailing / marks a directory." },
      "note": { "type": "string" }
    },
    "required": ["path"],
    "additionalProperties": false
  },
  "apply": "(pure function: validates params, returns shallow-merge props patch)"
}
```
> **L2 (Registry key):** The action key is always <blockType>.<verb>, so the component registry can list and resolve actions without inspecting props.
> **L5-12 (Discovery params):** Params is the action's TypeBox schema, served verbatim as JSON Schema and used for runtime validation.
> **L13 (Undo for free):** apply returns a shallow-merge props patch. The kernel executes it through updateBlock, so the same merge semantics and inverse op path apply.

```json
{
  "schemaVersion": 2,
  "ops": [
    { "op": "insertBlock", "description": "Insert a new block under a parent." },
    "... 6 more ops elided"
  ],
  "components": [
    {
      "name": "prose",
      "description": "Text-bearing prose blocks.",
      "types": [{ "type": "paragraph", "carriesText": true, "state": { "type": "object", "properties": {}, "additionalProperties": false } }],
      "actions": []
    },
    {
      "name": "file-tree",
      "description": "Structured file hierarchy blocks.",
      "types": [{ "type": "file-tree", "carriesText": false, "state": { "type": "object" } }],
      "actions": [{
        "action": "file-tree.addEntry",
        "description": "Append a path entry to the file tree.",
        "params": { "type": "object", "properties": { "path": { "type": "string" } }, "required": ["path"], "additionalProperties": false }
      }]
    },
    "... 5 more components elided"
  ]
}
```
> **L1-2 (Discovery v2):** GET /api/blocks serves static metadata derived entirely from component and operation exports.
> **L3-7 (Seven ops):** ops lists the seven kernel operations with their descriptions.
> **L8-29 (Component-owned surface):** Each bundle reports its types, carriesText facts, state schemas, actions, and verbatim JSON Schema params.

## What each shape becomes in markdown

Agents read documents through `projectToMarkdown`. The function is pure and runtime-only: it never writes a markdown mirror to disk. Each block type has a deterministic, greppable form.

**Projection map**

| type | projects as |
| --- | --- |
| paragraph | Plain text line; the root paragraph shell is skipped. |
| heading | # through ###### from props.level, default 2 and clamped 1-6. |
| list-item | - bullet or 1. when props.ordered; 2-space indent per nesting depth. |
| quote | >-prefixed blockquote line(s). |
| code | Fenced block with props.language; annotations render as > **L<lines>[ (<label>)]:** <note> lines. |
| callout | Blockquote label from props.kind or uppercased props.tone, optional title, then body. |
| divider | --- |
| structured-table | Optional bold title plus a markdown pipe table from props.columns and props.rows. |
| file-tree | Optional bold title plus a literal tree fence with dirs-first sort, change markers, and note suffixes. |
| interaction-surface | Optional bold title plus a bare fenced list of signature lines; query/event get bracket prefixes. |
| mermaid | Blockquote labeled Mermaid with optional title and body. |
| canvas | HTML comment: <!-- canvas: <src> [view=...] [title="..."] -->. |
| image | Markdown image ![alt](src) plus optional italic caption. |
| video | Blockquote labeled Video with title, url-or-src target, and optional caption. |

---

Read this alongside the block vocabulary — what each of the 14 types is for, the mutation model — ops, inverses, undo, and the save pipeline — how bytes reach disk.
