# Rich text: delta spans & reference chips

Where a block carries text, that text is an array of Delta JSON spans: each span is a string `insert` plus an optional `attributes` object. There is no other inline model — no HTML, no nested marks tree. A span either has an attribute or it does not.

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
        "path": "10-system-design/40-block-vocabulary",
        "label": "the block vocabulary"
      }
    }
  },
  { "insert": "." }
]
```
> **L3,5 (Marks):** Rich text is delta spans. Marks are literal true flags when present; absent marks are simply absent.
> **L6 (Outbound link):** link is the external URL mark on the span that carries it.
> **L11-15 (Reference chip):** reference carries the shared SpectreRef identity for doc mentions and canvas links alike: kind is doc or source, path is corpus-relative, and label is display text.

## The four marks

The boolean marks are `bold`, `italic`, `strike`, and `code`. Each must be the literal `true` when present — `false` is a validation error, not a no-op. An attributes object that ends up empty after validation is dropped entirely, so there is exactly one canonical encoding of unmarked text.

## Links and reference chips

`link` is a non-empty string URL for outbound destinations — external sites, mailto, anything the repo does not own. Internal identity is different: pointing at a doc or a source file uses the `reference` attribute, which renders as a chip in the viewer and feeds the backlink index.

## SpectreRef — the shared reference identity

```json
{
  "kind": "source",
  "path": "packages/docs-model/src/doc-schema.ts",
  "symbol": "validateDocDocument",
  "line": 194,
  "label": "the validator"
}
```
> **L2 (Two kinds):** kind is "doc" for pages in the docs tree and "source" for code files.
> **L3 (Repo-relative):** path is always repo-relative — no registry ids, no absolute paths in v1.
> **L4-6 (Optional precision):** symbol, line, and section narrow the target; label is the display text the chip shows.

> **One link model** — SpectreRef is the single reference identity shared by doc.json delta `reference` spans and canvas `links[].target`. It lives in docs-model as the neutral home; the canvas project imports the type and aliases its on-disk link target to it. docs-model itself never imports from the canvas — the dependency points one way.

## Which types carry text

Whether a type carries delta text is a per-type fact declared as `carriesText` in the component state definitions. Seven of the 14 types carry text — but text means prose only for the five rich-text flow types. For `code` and `mermaid`, the delta text is the source payload and marks are meaningless. The structured types keep everything in `props` and carry no text at all.

**Text carriers**

| carriesText | types | what text means |
| --- | --- | --- |
| true | paragraph, heading, list-item, quote, callout | Prose: marks, links, and reference chips all apply. |
| true | code, mermaid | Source payload: the fenced code body or diagram source; spans are plain inserts. |
| false | divider, image, video, structured-table, file-tree, interaction-surface, canvas | No text key; all state lives in typed props. |

## Markdown bridges

Outbound, `delta-markdown.ts` renders spans to inline markdown for the agent surface. Reference marks render as plain text (label, falling back to the reference path) rather than link syntax — the rendered markdown is a greppable terminal artifact, and a bare bracket-and-paren pair would be noise for `docs grep`.

Inbound, `markdown-to-delta.ts` tokenizes a line of inline markdown back into spans, covering exactly the inline vocabulary above. Link classification is deliberate: an href resolving under `docs/` becomes a `kind: "doc"` reference, a source-code-looking path becomes `kind: "source"`, and everything else stays a plain `link` mark.

---

The block that holds these spans is described in the document & block tree; which types may carry them is a fact owned by per-type block state; how spans render to greppable markdown is covered in canonical bytes.
