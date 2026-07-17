# callout

The labeled admonition of the block vocabulary — decisions, risks, warnings, mental models — and the vocabulary's designated safety net: every retired or unknown block type coerces into a callout rather than failing validation.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| tone | "info" / "decision" / "risk" / "warning" / "success" | no | Color/intent; the markdown render's label falls back to the uppercased tone (default INFO). |
| kind | string | no | Free-form label chip; wins over tone in the markdown render. Coerced legacy types land their old type name here. |
| title | string | no | Optional bold title after the label. |

Carries delta text (`carriesText: true`) as the callout body.

## Markdown render

`> **<label>[: <title>]** — body` where the label is `props.kind` when present, otherwise the uppercased `props.tone` (default `INFO`). Always greppable on the leading token — `grep '> \*\*Decision'` finds every decision callout in a corpus. This page's own decision box below renders exactly that way.

## The coercion target

> **Decision: Retired types never break a corpus** — After legacy `flavour` aliasing, any block whose type is a string but not one of the 14 canonical types coerces to a callout, preserving the old type name as `props.kind` (unless the block already carries its own non-empty `kind`); props, text, and children carry over verbatim, and the block canonicalizes to the coerced form on its next save. One render rule covers them all.

## In the editor

Slash menu: **Callout** (aliases: note, info, tip). No input rule — type `/callout` or convert an existing line.

## Agent notes

- Prefer `kind` for semantic labels ("Decision", "Boundary under review") and `tone` for the visual register; the pair is how this corpus encodes decision records.

- No typed actions — patch `tone`/`kind`/`title` via `updateBlock`, edit the body via text ops.

## Theming

This block's theme file is `components/callout.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-viewer-callout-border | Card border |
| fill | --docs-viewer-callout-fill | Card background |
| fg | --docs-callout-fg | Body text color |
