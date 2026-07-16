# System UI and the knob map

Not everything is themable, on purpose. The system UI — the workbench's own furniture — stays fixed so every theme still FEELS like the same tool. This page draws that line explicitly, then maps every style-rail knob to what it actually writes.

## Deliberately fixed

| Fixed UI | Value | Where it lives |
| --- | --- | --- |
| Docs sidebar width | 18rem (w-72) | shell/App.tsx |
| Style rail width | 30rem expanded, 3.25rem collapsed | shell/StyleRail.tsx |
| Header row heights | 2.75rem (h-11) | shell components |
| Tree metrics | indent, row padding, chevron sizes | shell/Sidebar.tsx |
| Rail visibility breakpoint | hidden below lg | shell/StyleRail.tsx |

> **DECISION: Moving the line** — Promoting any of these to themable is a deliberate decision: add a tier-2 token + registry entry (see Component themes), never a one-off knob. The default answer is no — a consistent workbench frame is a feature.

## The style-rail knob map

The rail has two tabs — Theme (identity: themes, colors, typography, components, background effect) and Layout (geometry: column, surfaces, editor controls) — each a stack of collapsible sections whose open state persists per user. Every knob writes CSS variables onto the root element (a knob at its default removes the override). The full inventory:

**Theme tab — Themes / Colors**

| Knob | Writes | Notes |
| --- | --- | --- |
| Dark mode | data-theme attr + .dark class | Swaps the tier 1/2 definitions |
| Accent | --accent, --ring, --docs-viewer-link | Palette family swap |
| Background / Sidebar / Text | --background, --sidebar, --foreground families | Explicit color overrides; null follows the theme |
| Themes picker | injects the theme CSS layer | See Global themes |

**Theme tab — Typography**

| Knob | Writes | Notes |
| --- | --- | --- |
| Body / Heading font | --font-tx02 / --font-display + --style-heading-font |  |
| Code font | --docs-font-code | Code blocks, inline chips, kbd |
| Number font | --docs-font-numeric | List markers + ordered counters; Body = inherit |
| Font size / Line height / Letter spacing | --style-font-size / --style-line-height / --style-letter-spacing | Content column only |

**Layout tab — Column / Surfaces**

| Knob | Writes | Notes |
| --- | --- | --- |
| Max width / Margin / Top padding | --style-content-width / --style-content-margin / --style-content-top | The doc content column |
| Radius | --radius | Corner rounding across the UI |
| Border strength | --border, --input, --sidebar-border, --docs-border-default | Alpha/contrast multiplier |
| Background / Sidebar tint | color-mix into --background / --sidebar | Accent-family tinting |
| Scrollbar width / color / opacity | --docs-scrollbar-width / -color / -opacity | WebKit scrollbar styling (Electron); thumb hover goes full-opacity |

**Layout tab — Editor · Theme tab — Background effect**

| Knob | Writes | Notes |
| --- | --- | --- |
| Grain (intensity/density/contrast/blend/softening) | --docs-grain-* | Film-grain overlay |
| Highlight color / Rounding / Padding | --docs-highlight-color / -radius / -padding | Block selection + changed-flash; padding = same-color shadow spread |
| Drag opacity | --docs-drag-opacity | Ghost level of the held block while dragging |
| Drop line color / thickness / opacity / rounding | --docs-dropcursor-color / -width / -opacity / -radius | The line shown while dragging |
| Grip gap / vertical offset / size / fade / color | --docs-grip-gap / -offset-y / -size / -fade / -color | WHERE and HOW the drag grip renders (fade = show/hide + block-to-block timing) |

**Theme tab — Components**

| Knob | Writes | Notes |
| --- | --- | --- |
| One collapsible group per theme surface (inline-code, the 14 block types, shared surfaces) | every CSS variable THEME_TOKEN_REGISTRY maps for the picked key | Same vocabulary as a theme folder's components/*.json; overrides layer over the active theme and flow into Save-as-theme as real component files |
