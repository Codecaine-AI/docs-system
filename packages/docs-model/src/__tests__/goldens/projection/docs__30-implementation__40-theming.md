Implementation of theming: compiling global theme folders and normalized style-rail state into CSS custom properties on the document root. Source: `packages/docs-workbench/web/src/theme` (`notion-palette.css`, `semantic.css`, `theme-folders.ts`), `packages/docs-workbench/web/src/shell` (`StyleRail.tsx`, `App.tsx`), `packages/docs-server/src/themes.ts` (theme-root reads and writes), and `themes/` (the global theme catalogue).

## Governed By

Themes — theme reach, layer precedence, resolution and selection behavior, and the Living Default.

Tokens — the semantic-variable contract every compiled theme value targets.

Typography and Fonts — reading roles and the font stacks a theme may set.

Theming (block design) — the typed component-knob contract and sparse override semantics.

## Decisions

### One CSS mechanism per precedence layer

- Decision: Each design precedence layer is realized as a distinct CSS mechanism — base values as static stylesheets (`notion-palette.css` raw variables mapped by `semantic.css`), the selected theme as one injected style element compiled from the theme folder with a light and a dark block, and style-rail state as inline custom properties on the root element.

- Why: Merging the layers into one computed set at runtime was rejected — letting CSS arbitration (inline over injected over stylesheet) carry the design's precedence order means no application code re-implements it.

- Applies to: `packages/docs-workbench/web/src/theme`, `packages/docs-workbench/web/src/shell/StyleRail.tsx` — including future variable groups and layers.

### Reset by property removal

- Decision: A default or unset rail value translates to `null` in the variable map, and applying `null` removes the inline property; nothing writes a copied default into inline style.

- Why: A second reset path was rejected — removing the property makes the theme layer or base stylesheet below authoritative automatically, so a default value never forks between layers.

- Applies to: `styleRailVars` and `applyStyleRailVars` in `packages/docs-workbench/web/src/shell/StyleRail.tsx` — including future rail settings.

### Closed registry is the single theme vocabulary

- Decision: Theme folders validate through `THEME_TOKEN_REGISTRY`, a closed registry mapping each accepted component file and key to its CSS variables and a typed kind; folder and rail readers drop anything unregistered, and a new theme knob is one registry entry plus its semantic variable and consumer — the generic component pane renders controls from registry metadata.

- Why: Open-ended folder acceptance was rejected — an unregistered key must not reach an arbitrary application property, and typed registry entries give the style rail a correct control for every knob without component-specific code.

- Applies to: `packages/docs-workbench/web/src/theme/theme-folders.ts`, `packages/docs-workbench/web/src/theme/semantic.css`, `packages/docs-workbench/web/src/shell/StyleRail.tsx` — every future theme knob registers here, never through a bypass path.

### Sparse per-surface component files

- Decision: A component theme is one `components/<surface>.json` file per registered surface holding only the keys it overrides; the server replaces a theme's manifest whole but writes component files individually, leaving files omitted from a write on disk.

- Why: One merged theme document was rejected — sparse per-surface files keep a theme readable as its divergences and let a write touch one surface without re-serializing the rest.

- Applies to: `themes/*/components`, `packages/docs-server/src/themes.ts` — including future registered surfaces.

### Font wiring stays in the theming modules

- Decision: Font stacks flow through the same two theming paths as every other value — manifest font strings compile through `FONT_VARS` in `theme-folders.ts` into both mode blocks, and rail font choices map to built-in stack strings in `styleRailVars`; no font-binary or `@font-face` loading path exists, so a stack resolves only against families the browser or host already provides.

- Why: A separate font subsystem was rejected — fonts are theme values, and a dedicated loader would add a second application path beside the layer mechanisms above.

- Applies to: `packages/docs-workbench/web/src/theme/theme-folders.ts`, `packages/docs-workbench/web/src/shell/StyleRail.tsx` — future font features extend these modules.

### One global theme root

- Decision: Every `docs-cli serve` uses this repository's `themes/` directory by default, resolved from the CLI package location. An explicit `--themes-root <path>` flag or `themesRoot` option overrides that root. If neither root is available, resolution falls back to the `themes/` directory beside the docs root. The catalogue contains `default`, the shared look, and `docs-system-classic`, the selectable classic look with its component token files.

- Why: One package-owned root gives every served docs tree the same live theme catalogue without requiring a copied theme folder in each consumer repository.

- Applies to: `docs-cli serve`, `createDocsRoutes`, `runServe`, and `runExport`.

### Living Default file layout

- Decision: The Living Default persists in the global folder `themes/default/` — `theme.json` carries the complete normalized scalar settings under `railDefaults` with an empty `components` member, and `components/*.json` carry the sparse per-surface overrides. Workbench autosave from any unlocked serve is its only writer.

- Why: A browser-local or exported-file home was rejected — a repository folder makes the core look versionable and shareable, and a single writer keeps the manifest and component files from diverging.

- Applies to: `themes/default/`, `packages/docs-workbench/web/src/shell/App.tsx`, `packages/docs-server/src/themes.ts` — future settings groups join `railDefaults`, never a new store.

## In This Section

- Style rail runtime

  - The normalized settings pipeline, root-property application, and persistence authority.
