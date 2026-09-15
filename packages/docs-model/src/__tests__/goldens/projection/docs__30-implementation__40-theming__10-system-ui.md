The style-rail runtime normalizes persisted settings, translates them into CSS custom properties, and applies them to the document root. Source: `packages/docs-workbench/web/src/shell/StyleRail.tsx` and `packages/docs-workbench/web/src/shell/App.tsx`.

## Governed By

Themes — selection, precedence, and persistence-authority behavior for rail settings and the Default theme.

Tokens — the semantic variable vocabulary the rail may set.

## Decisions

### One module owns the settings pipeline

- Decision: `StyleRail.tsx` owns the settings type, compiled defaults, tolerant local-storage reader, normalization, variable conversion, and root application; rail settings never gain a second reader or writer module.

- Why: Scattering settings parsing across shell components was rejected — a single pipeline keeps normalization and defaults consistent, so every consumer sees one complete settings object.

- Applies to: `packages/docs-workbench/web/src/shell/StyleRail.tsx` — future settings groups extend this module rather than adding parallel readers.

### All rail variables flow through one translation map

- Decision: `styleRailVars` returns the complete map of CSS-variable names to serialized values or null, and `applyStyleRailVars` is the only writer of rail properties on the document root; a null entry removes the inline property so the theme layer beneath becomes authoritative.

- Why: Ad hoc `setProperty` calls were rejected — one map keeps reset single-mechanism (property removal, per the layer-precedence decision on Theming: Overview) and makes the full set of rail-owned variables enumerable in one place.

- Applies to: `packages/docs-workbench/web/src/shell/StyleRail.tsx` — future rail variables join the map, never bypass it.

### Persistence writes gate in one place

- Decision: `App.tsx` gates local-storage and global Default writes on serve configuration. An unlocked serve writes style-rail edits to the shared global theme. A `--theme-locked` serve hides the style rail and rejects `POST /api/themes` with HTTP 403. Locked viewers reload the shared theme when the window regains focus. No other module persists rail settings. Registered component settings follow the sparse component-file decision on Theming: Overview.

- Why: One gate keeps theme-locked serves and static exports write-free by construction. Focus refresh gives locked consumer repositories live theme updates without granting write authority.

- Applies to: `packages/docs-workbench/web/src/shell/App.tsx` — future persistence targets route through the same gate.

## Variable Groups

| Settings group | Variable families |
| --- | --- |
| Accent and colors | `--accent`, `--ring`, and root surface/foreground variables. |
| Typography and layout | `--font-*`, `--style-*`, `--radius`, and border variables. |
| Sidebar | `--docs-sidebar-*` text, font, row, and guide variables. |
| Selection and movement | `--docs-highlight-*`, `--docs-dropcursor-*`, `--docs-dragselect-*`, and `--docs-list-*` variables. |
| Secondary surfaces | `--docs-scrollbar-*`, `--docs-peek-*`, and `--docs-ref-*`. |
| Components and grain | Registry-mapped component variables plus `--docs-grain-*` and softening variables. |
