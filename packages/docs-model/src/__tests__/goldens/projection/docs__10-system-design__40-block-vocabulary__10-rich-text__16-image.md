The image block of the block vocabulary: a picture from the bundle's assets, with alt text and an optional caption. Owned by the rich-text component (it lives in the text flow), but carries no text of its own.

## Example

A live block over a real bundle asset — the SVG lives at `assets/images/two-renders.svg` in this doc's bundle.

![A doc.json box with arrows to a doc render and an agent render.](./assets/images/two-renders.svg)
*One doc.json, two renders.*

## State Schema

**ImageState** — packages/docs-model/src/components/rich-text/state.ts#ImageState

```
src: string  # Image source — conventionally a bundle-relative path under assets/images/.
alt?: string  # Alt text; the agent render falls back to caption, then empty.
caption?: string  # Caption under the image; an italic line in the agent render.
```

```json
{
  "src": "./assets/images/two-renders.svg",
  "alt": "A doc.json box with arrows to a doc render and an agent render.",
  "caption": "One doc.json, two renders."
}
```

No text (`carriesText: false`).

## Doc Renderer

Slash menu: **Image** (aliases: picture, photo) — inserts an empty block that renders a missing-`src` placeholder card. A non-editable atom leaf node with no props UI in the editor: set `src`/`alt`/`caption` through agent ops. Asset uploads go through the server's generic `POST /api/assets` route, which stores `image/*` files under the bundle's `assets/images/`.

## Agent Renderer

A standard markdown image, `![alt](src)`, with an `*caption*` italic line beneath when `props.caption` is present.

## Agent Notes

- No typed actions — set `src`/`alt`/`caption` via `updateBlock`.

- Always provide `alt`: the agent surface is text-first, and `![](path)` tells a reading agent nothing.

## Theme

This block's theme file is `components/image.json` in a theme folder (`themes/<id>/`; see Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The contract is Theming.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-image-border | Image border |
| caption | --docs-image-caption-fg | Caption text color |
