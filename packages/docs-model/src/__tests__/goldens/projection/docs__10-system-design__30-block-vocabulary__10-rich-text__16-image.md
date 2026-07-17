# image

The image block of the block vocabulary: a picture from the bundle's assets, with alt text and an optional caption. Owned by the rich-text component (it lives in the text flow), but carries no text of its own.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| src | string | yes | Image source — conventionally a bundle-relative path under assets/images/. |
| alt | string | no | Alt text; the markdown render falls back to caption, then empty. |
| caption | string | no | Caption rendered under the image and as an italic line in the markdown render. |

No text (`carriesText: false`). `src` is the only required prop in the schema.

## Markdown render

A standard markdown image, `![alt](src)`, with an `*caption*` italic line beneath when `props.caption` is present.

## In the editor

Slash menu: **Image** (aliases: picture, photo). A non-editable atom leaf node; the image itself is not text-editable, and its props edit through the block's UI or agent ops.

## Agent notes

- No typed actions — set `src`/`alt`/`caption` via `updateBlock`.

- Always provide `alt`: the agent surface is text-first, and `![](path)` tells a reading agent nothing.

## Theming

This block's theme file is `components/image.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-image-border | Image border |
| caption | --docs-image-caption-fg | Caption text color |
