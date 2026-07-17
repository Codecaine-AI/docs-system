# code

The source-code block of the block vocabulary, and one half of its documentation doctrine: state shown as real, annotated JSON. The source lives in the block's *text*; structured line annotations live in *props*. It is the only type owned by the `code` component.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| language | string | no | Fence language tag, e.g. "json", "ts". |
| annotations | array | no | Array of { lines, label?, note }: lines is a 1-indexed range string ("4", "4-9", "1,4-6"), label an optional short chip, note the annotation body. |

Carries delta text (`carriesText: true`) — but the source edits as flat plain text: the editor node's content is `text*` with marks disabled, so no bold/link/reference spans inside code.

## Markdown render

A fenced code block using `props.language` when present, followed by one blockquote line per annotation, each shaped like:

```
> **L4-9 (Validation):** Rejects orphan children.
```

## Typed actions

Annotations edit only through the two typed actions below; the source text stays on generic text ops. `setAnnotation` upserts keyed by the exact `lines` string; `removeAnnotation` rejects a key that does not exist.

**code — annotation actions**

```
code.setAnnotation(lines: string, note: string, label?: string) -> props patch: { annotations }  # Upsert a line annotation keyed by its exact "lines" string (e.g. "4-9").
code.removeAnnotation(lines: string) -> props patch: { annotations }  # Remove the annotation whose "lines" key matches exactly.
```

## In the editor

Slash menu: **Code Block**. Input rule: three backticks plus an optional language tag. Annotations render as click-pairable side notes next to the fence. One display nicety: an annotation-free block with language `json` pretty-prints at render time — display-only, the stored text is never mutated.

## Agent notes

- Line numbers in `lines` are 1-indexed against the block text at the time you write them; re-check them after editing the source.

- Annotated JSON + an interaction-surface is the house style for documenting a system: the state, then the operations on it.

## Theming

This block's theme file is `components/code.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| bg | --docs-code-block-bg | Block background |
| border | --docs-code-block-border | Block border |
| string | --syntax-string | Syntax: string literals |
| number | --syntax-number | Syntax: numbers |
| boolean | --syntax-boolean | Syntax: booleans |
| null | --syntax-null | Syntax: null/nil tokens |
| key | --syntax-key | Syntax: object keys / attributes |
