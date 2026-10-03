Tokens are the visual contract between palette, theme, and rendered surface. They define how mode-aware colors, shared sharpness, component rules, and fixed geometry reach consumers. This page owns the shared contract. Per-block appearance remains in the Block vocabulary.

## Structure

| Layer | Owns | Example |
| --- | --- | --- |
| Palette | Raw light and dark values | --color-accent-blue |
| Semantic tokens | Surface and component meaning | --docs-editor-accent |
| Consumers | Rendered use without mode branches | var(--docs-editor-accent, #2383e2) |
| Theme and rail sources | Registered replacements for semantic values | Inline rail values outrank theme values |

## The Rule

### Semantic Before Consumption

- Raw colors stay in the palette.

- Semantic variables name the role with the `--docs-<component>-<part>` pattern.

- Consumers read semantic variables only. Light and dark mode never produce a branch at the use site.

- Zebra and rule tokens belong to the component or shared surface whose geometry they control. Similar values do not create shared ownership.

### One Sharpness Scale

The base semantic contract and token registry set `--radius` to 8px and expose a 0–16px range in 1px steps. The stock defaults, which the Global theme starts from, keep 8px. General UI corners derive from this one sharpness scale.

| Role | Derivation |
| --- | --- |
| Small / medium / large | calc(var(--radius) - 4px) / calc(var(--radius) - 2px) / var(--radius) |
| Extra large / double extra large | calc(var(--radius) + 4px) / calc(var(--radius) + 8px) |
| Structured-table handle | max(0px, calc(var(--radius) - 5px)) |
| Block highlight | max(0px, calc(var(--radius) - 2px)) |
| Drop cursor | max(0px, calc(var(--radius) - 6px)) |

- Only semantic shape and geometry are exempt.

  - Pills and circles keep complete rounding because the radius defines their identity.

  - Canvas corners remain shape geometry rather than application sharpness.

> **Named deviation: Classic theme interaction radii** — The `docs-system-classic` repo theme selects a 4px radius and sets the block-highlight and drop-cursor radii to 1px through dedicated rail values. Those two effective radii do not follow their global derivations while the overrides are present. The structured-table handle remains derived and resolves to 0px at 4px. The stock defaults set no such overrides, so at 8px the block highlight resolves to 6px and the drop cursor to 2px.

### Editor Accent

The fixed semantic token `--docs-editor-accent` gives selection outlines, drop indicators, focus rings, and drag furniture a full-strength accent. Background-wash colors are too pale for this job.

| Mode | Value |
| --- | --- |
| Light | rgb(0, 120, 223) |
| Dark | rgb(82, 156, 202) |
| Host-neutral consumer fallback | #2383e2 |

> **Boundary: Editor accent is not a theme key** — `--docs-editor-accent` is a semantic token, not a theme-folder key. The closed theme registry does not include it.

### Fixed Geometry

The code block uses a 20px line height as a surface contract. Numbered rows, zebra periods, gutters, and annotation overlays share that metric, so it is deliberately not a theme knob.

## Why

- **Mode changes stop at the semantic layer**

  - A consumer names what a value means once. Palette and theme changes re-resolve behind that name.

- **Sharpness travels across the surface**

  - Application framing and embedded document objects inherit one visual sharpness instead of drifting component by component.

- **Geometry stays fixed when interaction depends on it**

  - Overlay coordinates remain aligned with the content they explain.
