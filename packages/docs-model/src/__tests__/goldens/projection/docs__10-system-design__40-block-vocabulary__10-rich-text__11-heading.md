The section heading of the block vocabulary. Use it to give documents a greppable outline — `docs grep '^## '` finds every second-level section in a corpus.

## State Schema

| prop | type | required | notes |
| --- | --- | --- | --- |
| level | integer 1-6 | no | Heading depth. Absent means level 2 — the renderer, editor, and agent surface all treat a missing level as 2. |

Carries delta text (`carriesText: true`) with the full mark set. The schema is closed: `level` is the only prop.

## Doc Renderer

Slash menu: **Heading 1**-**3** as top-level entries, with levels 4-6 under an **Other Headings** submenu. Input rules convert `#`, `##`, or `###` plus a space at the start of a line (levels 4-6 have no input rule). One round-trip subtlety: the editor keeps a `null` level sentinel for headings whose source props never set `level`, so editing one doesn't grow a spurious `props.level` on save.

## Agent Renderer

`#` through `######` per `props.level`, followed by the inline text. Out-of-range or non-integer levels fall back to 2 rather than failing.

## Agent Notes

- Set the level with a plain `updateBlock` props patch; there are no typed actions.

- Corpus convention: at most one `level: 1` heading per doc. The page title is furniture rendered above the body, so most docs have none; sections use `level: 2`.

## Theme

This block's theme file is `components/heading.json` in a theme folder (`themes/<id>/`; see Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| fg | --docs-heading-fg | Heading text color (all levels) |
