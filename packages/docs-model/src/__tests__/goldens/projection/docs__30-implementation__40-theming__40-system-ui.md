The style-rail runtime normalizes persisted settings, translates them to CSS custom properties, and applies them to the document root. It also separates local session state from repository Default persistence and locked-theme inheritance. The control layout is specified by Style Rail; the customization boundary is specified by Visual System.

## Settings Pipeline

`packages/docs-workbench/web/src/shell/StyleRail.tsx` owns the settings type, compiled defaults, tolerant local-storage reader, normalization, variable conversion, and root application.

| Stage | Mechanic |
| --- | --- |
| Load | loadStyleRailSettings parses docs-style-rail-settings.v1. Missing or invalid JSON returns the compiled defaults. |
| Normalize | normalizeSettings fills every settings group, accepts both stored locations for surfaces/contentWidth, clamps scalar ranges, and filters component overrides through the registry. |
| Translate | styleRailVars returns one map of CSS-variable names to serialized strings or null. Registered component values pass through the same map. |
| Apply | applyStyleRailVars sets non-null values on document.documentElement.style and removes properties whose value is null. |
| Persist locally | saveStyleRailSettings writes the normalized object for unlocked serves; storage failure leaves the in-memory settings active. |

> **Implementation invariant: Default means no inline property** — A scalar equal to `DEFAULT_STYLE_RAIL_SETTINGS` normally translates to `null`. Removing the property exposes the active theme or semantic stylesheet instead of copying a competing default into inline style.

## Variable Groups

| Settings group | Variable families |
| --- | --- |
| Accent and colors | --accent, --ring, and root surface/foreground variables. |
| Typography and layout | --font-*, --style-*, --radius, and border variables. |
| Sidebar | --docs-sidebar-* text, font, row, and guide variables. |
| Selection and movement | --docs-highlight-*, --docs-dropcursor-*, --docs-dragselect-*, --docs-list-*, and --docs-grip-*. |
| Secondary surfaces | --docs-scrollbar-*, --docs-peek-*, and --docs-ref-*. |
| Components and grain | Registry-mapped component variables plus --docs-grain-* and softening variables. |

## Persistence Authority

| Runtime | Authority |
| --- | --- |
| Unlocked workbench | Local storage applies immediately. App.tsx also debounces the complete Default state into the repository theme folder. |
| Fresh browser profile | The repository Default railDefaults seed settings before theme-folder autosave is enabled. |
| Theme-locked serve | The repository Default applies unconditionally; rail local storage is ignored, the rail is hidden, and focus re-fetches inherited state. |
| Static export | No theme API exists and no repository writer starts. Bundled data and styles remain read-only. |

`packages/docs-workbench/web/src/shell/App.tsx` gates both local and repository writes on serve configuration. Registered component settings use the sparse path documented in Component themes.
