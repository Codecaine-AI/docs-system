The horizontal rule of the block vocabulary: a visual section break with no content of its own.

## State Schema

No props (closed empty schema) and no text (`carriesText: false`) — the simplest block in the vocabulary.

## Doc Renderer

Slash menu: **Divider** (aliases: hr, separator, `---`). Input rule: typing `---` converts the moment the third hyphen lands — no trailing space, matching Notion. It is one of the non-editable atom leaf nodes (`ATOM_BLOCK_TYPES` in the viewer's editor schema) — the cursor steps over it, never into it.

## Agent Renderer

A `---` line.

## Agent Notes

- Insert with a plain `insertBlock`; nothing to configure, nothing to act on.

## Theme

This block's theme file is `components/divider.json` in a theme folder (`themes/<id>/`; see Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| color | --docs-divider-color | Rule color |
