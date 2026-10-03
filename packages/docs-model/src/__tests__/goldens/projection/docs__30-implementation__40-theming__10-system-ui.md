The style-rail runtime normalizes persisted settings, translates them into CSS custom properties, and applies them to the document root. Source: `packages/docs-workbench/web/src/shell/style-rail-settings.ts`, `packages/docs-workbench/web/src/shell/StyleRail.tsx`, `packages/docs-workbench/web/src/shell/App.tsx`, and `packages/docs-workbench/web/src/data/project-storage.ts`.

## Governed By

Themes: selection, precedence, and persistence-authority behavior for rail settings, the Global theme, and the Default theme.

Tokens: the semantic variable vocabulary the rail may set.

## Decisions

### Two Modules Own the Settings Pipeline

- **Decision**

  - `style-rail-settings.ts` owns the settings type, compiled defaults, normalization, and variable conversion. It reads no DOM and no storage, so docs-publish builds its static theme head from the same code.

  - `StyleRail.tsx` re-exports that module and owns the browser side: the tolerant local-storage reader and root application.

  - Rail settings never gain a third reader or writer module.

- **Why**

  - Scattering settings parsing across shell components was rejected. A single pipeline keeps normalization and defaults consistent, so every consumer sees one complete settings object.

- **Applies to**

  - The rule covers `packages/docs-workbench/web/src/shell/style-rail-settings.ts` and `StyleRail.tsx`. Future settings groups extend these modules rather than adding parallel readers.

### All Rail Variables Flow Through One Translation Map

- **Decision**

  - `styleRailVars` returns the complete map of CSS-variable names to serialized values or null.

  - `applyStyleRailVars` is the only writer of rail properties on the document root. A null entry removes the inline property so the theme layer beneath becomes authoritative.

- **Why**

  - Ad hoc `setProperty` calls were rejected, because one map lists every rail-owned variable in one place.

  - Reset stays one mechanism, property removal, per the layer-precedence decision on Theming: Overview.

- **Applies to**

  - The rule covers `styleRailVars` in `style-rail-settings.ts` and `applyStyleRailVars` in `StyleRail.tsx`. Future rail variables join the map, never bypass it.

### Persistence writes gate in one place

- Decision: `App.tsx` gates local-storage and theme writes on serve configuration. An unlocked serve that answers `globalTheme: true` writes style-rail edits to the Global theme, and one without it writes to the repository Default. A Global theme read that fails with anything other than 404 blocks writes. A `--theme-locked` serve hides the style rail and rejects `POST /api/themes` with HTTP 403. Locked viewers reload the active theme when the window regains focus. No other module persists rail settings. Registered component settings follow the sparse component-file decision on Theming: Overview.

- Why: One gate keeps theme-locked serves and static exports write-free by construction. The read-error guard keeps a transient server failure from overwriting the theme every project shares. Focus refresh gives locked consumer repositories live theme updates without granting write authority.

- Applies to: `packages/docs-workbench/web/src/shell/App.tsx`. Future persistence targets route through the same gate.

### The theme cache follows the theme's scope

- Decision: `themeStorage` stores the rail settings and light or dark mode under origin-wide `docs-global:` keys while the Global theme is active, and under per-project keys otherwise. Rail collapse and the selected rail pane stay in `projectStorage`. A `storage` event on the shared keys updates other open tabs without echoing their save back to the server.

- Why: Per-project copies of a shared theme were rejected. A copy goes stale when another project changes the theme, and reading it on load would override the server copy.

- Applies to: `packages/docs-workbench/web/src/data/project-storage.ts`, `packages/docs-workbench/web/src/shell/StyleRail.tsx`, and `packages/docs-workbench/web/src/shell/App.tsx`. Future theme-scoped cache keys go through `themeStorage`.

### Font Picks Defer to the Theme at Stock

- **Decision**

  - A rail font pick at its stock value writes no inline property. `styleRailVars` maps it to `null`, so `applyStyleRailVars` removes the property and the active theme's `fonts` stack applies.

  - The stock picks are Inter for body and headings and IBM Plex Mono for code, the faces the Default theme and the `:root` defaults in `read-surface.css` also name. A saved pick of Fira Code, the earlier stock code font, reads as IBM Plex Mono.

  - Only a pick that differs from stock, such as Serif, sets font variables like `--font-tx02` and `--docs-font-code` inline.

- **Why**

  - A stock pick that wrote its own stack would hide the theme's fonts. On the Default theme, it would replace the faces the layout lints measure with.

- **Applies to**

  - The rule covers the font roles in `packages/docs-workbench/web/src/shell/style-rail-settings.ts` and every future font role.

## Variable Groups

| Settings group | Variable families |
| --- | --- |
| Accent and colors | `--accent`, `--ring`, and root surface/foreground variables. |
| Typography and layout | `--font-*`, `--style-*`, `--radius`, and border variables. |
| Sidebar | `--docs-sidebar-*` text, font, row, and guide variables. |
| Selection and movement | `--docs-highlight-*`, `--docs-dropcursor-*`, `--docs-dragselect-*`, and `--docs-list-*` variables. |
| Secondary surfaces | `--docs-scrollbar-*`, `--docs-peek-*`, and `--docs-ref-*`. |
| Components and grain | Registry-mapped component variables plus `--docs-grain-*` and softening variables. |
