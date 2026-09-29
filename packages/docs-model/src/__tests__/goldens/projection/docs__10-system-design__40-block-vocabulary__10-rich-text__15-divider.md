The horizontal rule of the block vocabulary: a visual section break with no content of its own.

## Example

The rule below is a live divider block.

---

## State Schema

**DividerState** — packages/docs-model/src/components/rich-text/state.ts#DividerState

No text (`carriesText: false`), which makes it the simplest block in the vocabulary.

## Doc Renderer

Slash menu: **Divider** (aliases: hr, separator, `---`). Input rule: typing `---` converts the moment the third hyphen lands, with no trailing space, matching Notion. It is one of the non-editable atom leaf nodes (`ATOM_BLOCK_TYPES` in the viewer's editor schema), so the cursor steps over it, never into it.

## Agent Renderer

A `---` line.

## Agent Notes

- Insert with a plain `insertBlock`; nothing to configure, nothing to act on.

## Theme

This block's theme file is `components/divider.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The contract is Theming.

| Key | CSS variable | Styles |
| --- | --- | --- |
| color | --docs-divider-color | Rule color |
