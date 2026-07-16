# Global themes

A theme is a folder. Global built-ins (Default and Dark — the catalogue stays minimal while the theme identity is still being figured out) are compiled into the workbench; custom themes live in the repo's `themes/<id>/` directory (sibling of `docs/`), served by docs-server (`GET/POST /api/themes`) and listed in the style rail's Themes section.

## The folder format

Each folder holds a `theme.json` manifest and one `components/<surface>.json` token file per visual surface (see Component themes). A manifest's `base` names the theme it layers over, so a custom theme overrides only what differs.

**theme.json fields**

| Field | Type | Meaning |
| --- | --- | --- |
| name | string | Display name in the Themes picker. |
| base | string (theme id) | Theme to layer over; v1 resolves bases against BUILT-INS only. |
| dark | boolean | Mode applied when the theme is selected. |
| fonts | { body?, heading?, code?, number? } | Font stacks (any string) written to the per-surface font tokens. |
| railDefaults | partial rail settings | Knob values applied ONCE on selection (a preset ride-along, not a live link). |

```json
// themes/example/theme.json
{
  "name": "Example (blue code)",
  "base": "default",
  "dark": false,
  "fonts": { "code": "'Berkeley Mono', ui-monospace, monospace" }
}
```

## Selection semantics

Selecting a theme injects its compiled CSS layer (a light block and a dark block of tier-2 variables) and applies its railDefaults and dark flag once. The style rail stays a personal overlay ON TOP: knob changes afterwards are yours alone and always win over theme values. The selection persists per user (`docs-theme-folder-id`) and re-injects on boot without re-applying railDefaults.

## Creating themes

- From the rail: Save current look as theme snapshots your knobs (base = the active theme) into a new `themes/<id>/` folder via `POST /api/themes`.

- By hand or by agent: create the folder directly — ids are lowercase slugs, content is validated tolerantly on load (unknown fields and keys are ignored, never fatal).

- Export/Import theme buttons move just the knob blob (settings JSON + dark flag) between machines — the quick path when a full theme folder is overkill.
