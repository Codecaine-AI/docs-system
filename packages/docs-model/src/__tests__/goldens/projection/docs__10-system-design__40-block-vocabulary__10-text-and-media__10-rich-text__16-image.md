The image block shows one picture from the bundle's assets in a framed panel, with alt text and an optional caption. It is part of the block vocabulary. The rich-text component owns it because it sits in the text flow, but it carries no text of its own.

## Example

A live block over a real bundle asset. The SVG lives at `assets/images/two-renders.svg` in this doc's bundle.

![A doc.json box with arrows to a doc render and an agent render.](./assets/images/two-renders.svg)
*One doc.json, two renders.*

## State Schema

**ImageState** — packages/docs-model/src/components/rich-text/state.ts#ImageState

```
src: string  # Image source: conventionally a bundle-relative path under assets/images/.
alt?: string  # Alt text. Both renders fall back to caption, then empty.
caption?: string  # Names the image. The doc render uses it as the viewer title and does not draw it. The agent render prints it as an italic line.
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

The doc renderer draws the block as one framed panel with a light-gray head row above the image. The block shows no title, caption, or file name.

- **Panel Frame**

  - One hairline border frames the panel, and the image itself has no border.

  - The `border`, `borderWidth`, and `radius` theme keys style the frame.

- **Head Row**

  - The head row holds the 16px image icon tile on the left and an icon-only **Expand** ghost button on the right.

  - The **Expand** button opens the full-screen viewer, where a drag pans and the wheel zooms.

- **Image Body**

  - An SVG source sits inside 12px of padding, because a vector brings its own frame.

  - A raster image fills the panel body. A click on the image also opens the full-screen viewer.

- **Caption**

  - The caption is not drawn on the page. It is the alt fallback, the viewer title, and the accessible name of the **Expand** button.

  - Without a caption, the viewer title falls back to the alt text, then `Image`.

The slash menu lists **Image** (aliases: picture, photo). Inserts an empty block that renders a missing-`src` placeholder card. A non-editable atom leaf node with no props UI in the editor: set `src`/`alt`/`caption` through agent ops. Asset uploads go through the server's generic `POST /api/assets` route, which stores `image/*` files under the bundle's `assets/images/`.

## Agent Renderer

A standard markdown image, `![alt](src)`, with an `*caption*` italic line beneath when `props.caption` is present.

## Agent Notes

- No typed actions. Set `src`/`alt`/`caption` via `updateBlock`.

- Always provide `alt`. The agent surface is text-first, and `![](path)` tells a reading agent nothing.

## Theme

This block's theme file is `components/image.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The contract is Theming.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-image-border | Panel border color |
| borderWidth | --docs-image-border-width | Panel border width |
| radius | --docs-image-radius | Panel corner radius |
| margin | --docs-image-margin | Space above and below the block |

For related processing stages or result sets, use Image Grid to keep the images together with individual headings. Keep standalone illustrations as image blocks.
