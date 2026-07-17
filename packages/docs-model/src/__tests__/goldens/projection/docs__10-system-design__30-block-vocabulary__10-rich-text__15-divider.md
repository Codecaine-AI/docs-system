The horizontal rule of the block vocabulary: a visual section break with no content of its own.

## State

No props (closed empty schema) and no text (`carriesText: false`) — the simplest block in the vocabulary.

## Markdown render

A `---` line.

## In the editor

Slash menu: **Divider** (aliases: hr, separator). Input rule: `---` plus a space. It is one of the non-editable atom leaf nodes (`ATOM_BLOCK_TYPES` in the viewer's editor schema) — the cursor steps over it, never into it.

## Agent notes

- Insert with a plain `insertBlock`; nothing to configure, nothing to act on.

## Theming

This block's theme file is `components/divider.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| color | --docs-divider-color | Rule color |
