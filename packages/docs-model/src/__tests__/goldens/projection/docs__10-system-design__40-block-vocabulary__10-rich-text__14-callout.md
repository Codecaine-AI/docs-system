The labeled admonition of the block vocabulary — decisions, risks, warnings, mental models — and the vocabulary's designated safety net: every retired or unknown block type coerces into a callout rather than failing validation.

## Example

Three live variants: tone only, tone plus `title`, and a free-form `kind` over the tone label.

> **INFO** — Tone only — the agent render labels this `INFO`.

> **SUCCESS: Golden renders match** — Tone plus `title` — the title joins the label line in the agent render.

> **Boundary under review: Vocabulary growth** — A free-form `kind` wins over the tone label in the agent render; `tone` still drives the color.

## State Schema

| prop | type | required | notes |
| --- | --- | --- | --- |
| tone | "info" / "decision" / "risk" / "warning" / "success" | no | Color/intent; the markdown render's label falls back to the uppercased tone (default INFO). |
| kind | string | no | Free-form label chip; wins over tone in the markdown render. Coerced legacy types land their old type name here. |
| title | string | no | Optional bold title after the label. |

Carries delta text (`carriesText: true`) as the callout body.

### The Coercion Target

> **Decision: Retired types never break a corpus** — After legacy `flavour` aliasing, any block whose type is a string but not one of the canonical block types coerces to a callout, preserving the old type name as `props.kind` (unless the block already carries its own non-empty `kind`); props, text, and children carry over verbatim, and the block canonicalizes to the coerced form on its next save. One render rule covers them all.

## Doc Renderer

Slash menu: **Callout** (aliases: note, info, tip). No input rule — type `/callout` or convert an existing line.

## Agent Renderer

`> **<label>[: <title>]** — body` where the label is `props.kind` when present, otherwise the uppercased `props.tone` (default `INFO`). Always greppable on the leading token — `grep '> \*\*Decision'` finds every decision callout in a corpus. This page's own decision box renders exactly that way.

## Agent Notes

- Prefer `kind` for semantic labels ("Decision", "Boundary under review") and `tone` for the visual register; the pair is how this corpus encodes decision records.

- No typed actions — patch `tone`/`kind`/`title` via `updateBlock`, edit the body via text ops.

## Theme

This block's theme file is `components/callout.json` in a theme folder (`themes/<id>/`; see Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-viewer-callout-border | Card border |
| fill | --docs-viewer-callout-fill | Card background |
| fg | --docs-callout-fg | Body text color |
