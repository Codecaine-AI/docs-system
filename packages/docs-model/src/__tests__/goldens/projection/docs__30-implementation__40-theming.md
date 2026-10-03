Theming compiles theme folders and normalized style-rail state into CSS custom properties on the document root. The code lives in `packages/docs-workbench/web/src/theme` (`notion-palette.css`, `semantic.css`, `theme-folders.ts`, `read-surface.css`) and `packages/docs-workbench/web/src/shell` (`style-rail-settings.ts`, `StyleRail.tsx`, `App.tsx`). `packages/docs-server/src/themes.ts` reads and writes theme roots, `themes/` holds the package-owned theme catalogue, and `<stateDirectory>/themes/global/` holds the shared Global theme.

## Governed By

Themes: theme reach, layer precedence, resolution and selection behavior, the Global theme, and the Living Default.

Tokens: the semantic-variable contract every compiled theme value targets.

Typography and Fonts: reading roles and the font stacks a theme may set.

Theming (block design): the typed component-knob contract and sparse override semantics.

## Decisions

### One CSS mechanism per precedence layer

- Decision: Each design precedence layer is realized as a distinct CSS mechanism. Base values are static stylesheets (`notion-palette.css` raw variables mapped by `semantic.css`), the selected theme is one injected style element compiled from the theme folder with a light and a dark block, and style-rail state is inline custom properties on the root element.

- Why: Merging the layers into one computed set at runtime was rejected. CSS arbitration (inline over injected over stylesheet) carries the design's precedence order, so no application code re-implements it.

- Applies to: `packages/docs-workbench/web/src/theme` and `packages/docs-workbench/web/src/shell/StyleRail.tsx`, including future variable groups and layers.

### Reset by property removal

- Decision: A default or unset rail value translates to `null` in the variable map, and applying `null` removes the inline property. Nothing writes a copied default into inline style.

- Why: A second reset path was rejected. Removing the property makes the theme layer or base stylesheet below authoritative automatically, so a default value never forks between layers.

- **Applies to**

  - The rule covers `styleRailVars` in `style-rail-settings.ts` and `applyStyleRailVars` in `StyleRail.tsx`, including future rail settings.

### Closed registry is the single theme vocabulary

- Decision: Theme folders validate through `THEME_TOKEN_REGISTRY`, a closed registry mapping each accepted component file and key to its CSS variables and a typed kind. Folder and rail readers drop anything unregistered, and a new theme knob is one registry entry plus its semantic variable and consumer. The generic component pane renders controls from registry metadata.

- Why: Open-ended folder acceptance was rejected. An unregistered key must not reach an arbitrary application property, and typed registry entries give the style rail a correct control for every knob without component-specific code.

- Applies to: `packages/docs-workbench/web/src/theme/theme-folders.ts`, `packages/docs-workbench/web/src/theme/semantic.css`, and `packages/docs-workbench/web/src/shell/StyleRail.tsx`. Every future theme knob registers here, never through a bypass path.

### Sparse per-surface component files

- Decision: A component theme is one `components/<surface>.json` file per registered surface holding only the keys it overrides. The server replaces a theme's manifest whole but writes component files individually, leaving files omitted from a write on disk.

- Why: One merged theme document was rejected. Sparse per-surface files keep a theme readable as its divergences and let a write touch one surface without re-serializing the rest.

- Applies to: `themes/*/components`, the Global theme's `components/` folder, and `packages/docs-server/src/themes.ts`, including future registered surfaces.

### Font Wiring Stays in the Theming Modules

- **Decision**

  - Font stacks flow through the same two theming paths as every other value. Manifest `fonts` strings compile through `FONT_VARS` in `theme-folders.ts` into both mode blocks, and rail font choices map to built-in stacks in `styleRailVars`.

  - The Default theme's `fonts` block in `themes/default/theme.json` sets body and headings to `Inter, ui-sans-serif, system-ui, sans-serif` and code to `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`. The rail's stock picks and the `:root` defaults name the same two stacks.

  - A rail pick that differs from stock wins over the theme's `fonts` block, and the theme's block wins over the `:root` defaults in `read-surface.css`.

  - `main.tsx` imports the `fonts.css` of `@codecaine-ai/text-measure`, and `docs-fonts.ts` loads its faces at startup without blocking the first render.

  - docs-publish ships a copy of `fonts.css` and the font files in its build output for published pages.

- **Why**

  - A separate font subsystem was rejected, because fonts are theme values. The font loader adds faces and switches text measurement to them, but it never picks a stack.

  - The Default theme names the faces the layout lints measure with, so lint widths match the page at stock settings.

  - A theme without a `fonts` block, such as `docs-system-classic` or a Global theme that never set one, paints the bundled faces through the `:root` defaults. Layout findings are approximate only where a theme or rail pick names another face.

- **Applies to**

  - The rule covers `theme-folders.ts`, `read-surface.css`, `style-rail-settings.ts`, `docs-fonts.ts`, and `themes/default/theme.json`. Future font features extend these modules.

### One package-owned theme root

- Decision: Every `docs-cli serve` uses this repository's `themes/` directory by default, resolved from the CLI package location. An explicit `--themes-root <path>` flag or `themesRoot` option overrides that root. If neither root is available, resolution falls back to the `themes/` directory beside the docs root. The catalogue contains `default`, the Living Default, and `docs-system-classic`, the selectable classic look with its component token files. While a host serves the Global theme, the client loads no theme from this root.

- Why: One package-owned root gives every served docs tree the same live theme catalogue without requiring a copied theme folder in each consumer repository.

- Applies to: `docs-cli serve`, `createDocsRoutes`, `runServe`, and `runExport`.

### Living Default file layout

- Decision: The Living Default persists in the package-owned folder `themes/default/`.

  - `theme.json` carries the complete normalized scalar settings under `railDefaults` with an empty `components` member, and `components/*.json` carry the sparse per-surface overrides.

  - Workbench autosave from an unlocked serve without a Global theme is its only writer.

  - `theme.json` also carries the `fonts` block, which autosave keeps because `themeWritePayload` in `App.tsx` copies the active manifest.

- Why: A browser-local or exported-file home was rejected. A repository folder makes the core look versionable and shareable, and a single writer keeps the manifest and component files from diverging.

- Applies to: `themes/default/`, `packages/docs-workbench/web/src/shell/App.tsx`, and `packages/docs-server/src/themes.ts`. Future settings groups join `railDefaults`, never a new store.

### The Global theme lives in the service state directory

- Decision: The reserved theme id `global` resolves to `<stateDirectory>/themes/global/`, by default `~/.local/state/codecaine-docs/themes/global/`. `themesRootForId` sends that id to the global root and every other id to the repository root. The route factory never reads the environment. Each host resolves the root and passes it as `globalThemesRoot`, and a host without one serves repository themes only.

- Why: A theme copy in each repository was rejected. The owner wants one reading look across all projects. Per-repository themes drifted apart and hid changes made in other projects. A host option instead of an environment read keeps route tests and hosts without the docs service on repository themes.

- Applies to: `packages/docs-server/src/themes.ts`, `packages/docs-server/src/routes.ts`, and every host that constructs `createDocsRoutes`. Future hosts pass the same root.

## Global Theme Wiring

Each host resolves the global root, and the client switches to the Global theme when `GET /api/serve-config` answers `globalTheme: true`. These files carry the wiring.

```
packages/
├── docs-mcp/
│   └── src/
│       ├── background/
│       │   └── supervisor.ts  # sets CODECAINE_DOCS_GLOBAL_THEMES for the managed runtime
│       ├── daemon.ts  # passes the same root from the daemon
│       ├── managed-runtime.ts  # reads the variable, falls back to dirname(registry)/themes, and answers globalTheme: true
│       └── service.ts  # passes globalThemesRoot to every project's routes
├── docs-server/
│   └── src/
│       ├── routes.ts  # theme routes that list global first and route the reserved id
│       └── themes.ts  # reserved id, root resolution, themesRootForId, and atomic theme writes
└── docs-workbench/
    ├── src/
    │   ├── export.ts  # static export snapshots global, then repository default, unless themeId is explicit
    │   ├── run-serve.ts  # standalone serve resolves the root when the state directory exists
    │   └── server.ts  # reports globalTheme in GET /api/serve-config
    └── web/
        └── src/
            ├── data/
            │   ├── api.ts  # getServeConfig reads globalTheme and defaults it to false
            │   └── project-storage.ts  # themeStorage routes the theme cache to docs-global: keys
            └── shell/
                └── App.tsx  # loads and saves global, guards writes on read errors, and follows storage events
```

| Endpoint | Global theme behavior |
| --- | --- |
| `GET /api/themes` | Lists `{ id: "global", name: "Global", global: true }` first, then repository themes. A repository folder named `global` is skipped. |
| `GET /api/themes/global` | Returns `{ theme }` from the global root, or 404 until the theme exists. |
| `POST /api/themes` with `id: "global"` | Writes the global folder with atomic file writes and returns 201. A theme-locked serve returns 403, and a host without a global root returns 400. |
| `GET /api/serve-config` | Returns `globalTheme: true` when the host has a global root. The client then loads and saves only `global`. |

- **Managed Host**

  - The supervisor sets `CODECAINE_DOCS_GLOBAL_THEMES` to `<stateDirectory>/themes`.

  - The managed runtime falls back to `dirname(registry)/themes` when an older supervisor omits the variable.

- **Standalone Serve and Export**

  - `docs-cli serve` and `docs-cli export` call `resolveGlobalThemesRoot`.

  - `resolveGlobalThemesRoot` uses `CODECAINE_DOCS_GLOBAL_THEMES` first, then `<stateDirectory>/themes` when the state directory exists.

  - `CODECAINE_DOCS_STATE_DIR` overrides the default state directory.

- **PDF Export**

  - PDF and ZIP exports render the client's HTML, so they use whichever theme the client shows.

  - Print CSS in `pdf-document.tsx` still sets text in Inter and code in IBM Plex Mono, whatever fonts the theme names.

## In This Section

- Style rail runtime

  - The normalized settings pipeline, root-property application, and persistence authority.
