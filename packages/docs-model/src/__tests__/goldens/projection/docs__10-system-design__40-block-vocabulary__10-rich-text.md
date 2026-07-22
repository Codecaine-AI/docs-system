The rich-text component owns the eight text-and-media block types that make up ordinary document flow. They share one implementation home (`packages/docs-viewer/src/components/rich-text/`, one file per type), the delta-span text model, and the markdown-shortcut input rules — which is why they live grouped here, one doc per type.

- paragraph

  - The default flow block.

- heading

  - Section structure, levels 1-6.

- list-item

  - Bullets and numbered lists, nesting via children.

- quote

  - Plain unlabeled block quote.

- callout

  - Toned, labeled admonition card.

- divider

  - Horizontal rule.

- image

  - Bundle-asset image with caption.

- video

  - File or provider-URL embed with caption.

## Example

The blocks below are live instances of the family's core types, rendered the same way as any corpus content.

### A level-3 Heading

A paragraph carries **bold**, *italic*, ~~strike~~, and `code` marks, [an outbound link](https://example.com), and a reference chip to the block vocabulary.

- A list item; nesting runs through child list-item blocks.

  - A nested list item.

> A quote sets prose off from the surrounding flow in plain delta text.

> **Example** — A callout carries a kind chip, a tone, and rich text.

---

## State Schema

The family's internal state is rich text itself: an array of Delta JSON spans in the block's text field — each span a string insert plus an optional attributes object. There is no other inline model — no HTML, no nested marks tree. A span either has an attribute or it does not.

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
        "path": "10-system-design/40-block-vocabulary"
      }
    }
  },
  { "insert": "." }
]
```
> **L3,5 (Marks):** Rich text is delta spans. Marks are literal true flags when present; absent marks are simply absent.
> **L6 (Outbound link):** link is the external URL mark on the span that carries it.
> **L11-14 (Reference chip):** reference carries the shared SpectreRef identity for doc mentions and canvas links alike: kind is doc or source, path is corpus-relative. The span's insert is the display text.

### The Four Marks

- The boolean marks are `bold`, `italic`, `strike`, and `code`.

- A mark is the literal `true` when present; `false` is a validation error, not a no-op.

- An attributes object left empty after validation is dropped — unmarked text has exactly one encoding.

### Links and Reference Chips

`link` is a non-empty string URL for outbound destinations — external sites, mailto, anything the repo does not own. Internal identity is different: pointing at a doc or a source file uses the `reference` attribute, which renders as a chip in the viewer and feeds the backlink index.

### SpectreRef — the Shared Reference Identity

```json
{
  "kind": "source",
  "path": "packages/docs-model/src/doc-schema.ts",
  "symbol": "validateDocDocument",
  "line": 194
}
```
> **L2 (Two kinds):** kind is "doc" for pages in the docs tree and "source" for code files.
> **L3 (Repo-relative):** path is always repo-relative — no registry ids, no absolute paths in v1.
> **L4-6 (Optional precision):** symbol, line, and section narrow the target.

> **One link model** — SpectreRef is the single reference identity shared by doc.json delta `reference` spans and canvas `links[].target`. It lives in docs-model as the neutral home; the canvas project imports the type and aliases its on-disk link target to it. docs-model itself never imports from the canvas — the dependency points one way.

The object carries no display text. A reference span's insert is the display — for a doc reference, the target's name. When and how to link is cross-doc linking's subject.

### Which Types Carry Text

Whether a type carries delta text is a per-type fact, declared as `carriesText` in the component state definitions. Text means prose only for the rich-text flow types; for `code` the delta text is the source payload, and marks are not meaningful there.

**Text carriers**

| carriesText | types | what text means |
| --- | --- | --- |
| true | paragraph, heading, list-item, quote, callout | Prose: marks, links, and reference chips all apply. |
| true | code | Source payload: the fenced code body; spans are plain inserts. |
| false | divider, image, video, structured-table, file-tree, state-shape, interaction-surface, sequence, canvas | No text key; all state lives in typed props. |

## Typed Actions

The rich-text types expose no typed actions — they edit through the generic op kernel (block ops plus delta text edits), not `componentAction` verbs.

## Doc Renderer

On the doc surface — reader and editor alike — each type renders through its own file in `packages/docs-viewer/src/components/rich-text/`.

## Agent Renderer

Outbound, spans render to inline markdown for the agent surface. A reference renders as its span text — the target's name — falling back to the reference path; no link syntax, because the render is a greppable terminal artifact.

Inbound, `markdown-to-delta.ts` tokenizes a line of inline markdown back into spans, covering exactly the inline vocabulary above. Link classification is deliberate: an href resolving under `docs/` becomes a `kind: "doc"` reference, a source-code-looking path becomes `kind: "source"`, and everything else stays a plain `link` mark.

Per-type agent guidance lives on each type page.

## Theme

Each type has its own theme file — see the Theme section on every type page, and Theming for the system.

## Agent Adapter

The family uses the default adapter: no agent of its own. Edits arrive as generic ops over blocks and delta text; nothing forwards to an external authority. The contract is Agent adapter.
