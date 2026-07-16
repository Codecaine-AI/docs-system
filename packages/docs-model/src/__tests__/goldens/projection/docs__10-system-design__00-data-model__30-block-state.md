# Per-type block state

A block's `props` object is not free-form: every one of the 14 types has a closed TypeBox state schema. Those schemas, the `carriesText` facts, and the named actions are owned by seven component bundles under `packages/docs-model/src/components/` — a boot-time check asserts the bundles partition the 14 types exactly, and the viewer mirrors the same seven folders 1:1.

## Seven component bundles

A bundle is a manifest (name, owned types, agent-facing description), a state definition per owned type, an action list, and an `agentView` projection function. The bundle name doubles as the folder name, the discovery key, and the viewer mirror key.

**Component bundles**

| component | owned types | what this editing world is |
| --- | --- | --- |
| rich-text | paragraph, heading, list-item, quote, callout, divider, image, video | The rich-text flow: typing, marks, links, lists, inline embeds. |
| code | code | Source code: language-tagged source text with structured line annotations. |
| mermaid | mermaid | Mermaid diagram: diagram source with live render. |
| file-tree | file-tree | Annotated path tree: entries with notes and change markers. |
| structured-table | structured-table | Structured table: a columns × rows grid. |
| interaction-surface | interaction-surface | Operation list describing how a system can be changed or queried. |
| canvas | canvas | Spatial canvas. The block holds a reference; the canvas lives in its own system. |

## State schemas

A state definition pairs a TypeBox object schema for `props` with the `carriesText` fact. The same schema object serves three consumers: runtime validation of action params and writes, verbatim JSON Schema in the discovery payload, and the editor's structured forms.

**State schema summary**

| type | text | state props |
| --- | --- | --- |
| paragraph | yes | (none) |
| heading | yes | level?: integer 1-6 |
| list-item | yes | ordered?: boolean |
| quote | yes | (none) |
| callout | yes | tone?: info | decision | risk | warning | success; kind?: string; title?: string |
| divider | no | (none) |
| image | no | src: string; alt?: string; caption?: string |
| video | no | src?: string; url?: string; title?: string; caption?: string |
| code | yes | language?: string; annotations?: { lines, label?, note }[] |
| mermaid | yes | title?: string; caption?: string; diagramType?: string |
| file-tree | no | title?: string; entries: { path, note?, change?, from? }[] |
| structured-table | no | title?: string; columns: string[]; rows: string[][]; density?: compact | normal | relaxed |
| interaction-surface | no | title?: string; operations: { name, description?, params?, returns?, kind? }[] |
| canvas | no | canvasId?: string; src?: string; view?: string; title?: string |

> **Closed schemas** — Every state schema sets `additionalProperties: false`. Unknown props are schema violations, not tolerated extras — growth happens by changing the schema, never by smuggling keys. Readers stay tolerant separately: the structured components ship tolerant read helpers that skip malformed entries instead of throwing.

## Typed actions as data

Structured blocks expose named actions so agents can say what they mean — add a row, update an entry — instead of hand-editing props. An action is registry data: a `<blockType>.<verb>` key, a description, a TypeBox params schema, and a pure `apply` function that returns a shallow-merge props patch. The kernel executes the patch through `updateBlock`, so actions inherit the same merge semantics and inverse-op undo path as every other write.

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

**Action inventory**

| component | actions |
| --- | --- |
| rich-text | (none — the flow edits through the kernel ops directly) |
| code | code.setAnnotation, code.removeAnnotation |
| mermaid | (none) |
| file-tree | file-tree.addEntry, file-tree.updateEntry, file-tree.removeEntry |
| structured-table | structured-table.addRow, structured-table.addColumn, structured-table.updateCell, structured-table.removeRow, structured-table.removeColumn |
| interaction-surface | interaction-surface.addOperation, interaction-surface.updateOperation, interaction-surface.removeOperation |
| canvas | canvas.* — lifted from the canvas agent schema, forwarded not applied |

> **Forwarded actions** — An action either applies locally or declares `forward: { authority: "canvas" }`. The canvas bundle lifts the canvas agent-patch operations as `canvas.<type>` actions whose param schemas stay owned by the canvas package; the docs side routes them to the canvas authority instead of touching block props.

## The discovery payload

`GET /api/blocks` serves static metadata derived entirely from the component and operation exports — nothing hand-maintained. This is the one HTTP-shaped thing on these pages, and only because the payload is itself data: the seven ops with descriptions, then each bundle's types, `carriesText` facts, state schemas, and actions with verbatim JSON Schema params.

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

---

The tree these blocks live in is the document & block tree; the delta text some of them carry is rich text; what each type is for — as writing, not schema — is the block vocabulary.
