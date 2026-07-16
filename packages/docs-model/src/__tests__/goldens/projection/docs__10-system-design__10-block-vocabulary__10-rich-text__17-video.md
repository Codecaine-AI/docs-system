# video

The video block of the block vocabulary: either a bundle-local file (`src`) or an external URL (`url`). YouTube, Vimeo, and Loom URLs embed through privacy-friendly players. Owned by the rich-text component; carries no text.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| src | string | no | Bundle-local video file, uploaded to the bundle's assets/videos/. |
| url | string | no | External video URL; wins over src when both are present. |
| title | string | no | Display title, also used in the projection label. |
| caption | string | no | Caption appended to the projection line. |

No text (`carriesText: false`). All four props are optional in the schema; a useful block sets at least one of `src`/`url`.

## Markdown projection

A labeled blockquote in the callout family's shape: `> **Video[: <title>]** — <url ?? src>[ — <caption>]` — external `url` wins over the bundle-relative `src`, the same precedence the render surface applies. Chosen over a markdown link because the target may be a bare provider URL; the leading `> **Video` token greps cleanly.

## In the editor

Deliberately **no slash-menu entry** — video blocks appear *from content*: paste or drop a YouTube/Vimeo/Loom URL, or drop a video file, which uploads to the bundle's `assets/videos/` through `POST /api/assets/video`. A non-editable atom leaf node (`VideoDocsBlock`) renders the player.

## Agent notes

- No typed actions — patch props via `updateBlock`; prefer `url` for external content and let `src` carry uploaded files.

- Give every video a `title` — in the projection, that title is most of what a reading agent gets.

## Theming

This block's theme file is `components/video.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-video-border | Frame border |
| caption | --docs-video-caption-fg | Caption text color |
