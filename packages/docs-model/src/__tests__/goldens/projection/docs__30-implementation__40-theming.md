The theming implementation compiles repository theme folders and normalized style-rail state into CSS custom properties on `<html>`. It owns loading, validation, precedence, persistence, and font-stack application. The designed token roles and customization boundary live in Visual System.

## Runtime Pipeline

- Base styles

  - `notion-palette.css` defines mode-specific raw variables. `semantic.css` maps them to the semantic variables specified by Tokens.

- Theme-folder layer

  - `theme-folders.ts` filters a folder through the closed registry, resolves its base chain, and compiles light and dark declarations into one injected style element.

- Runtime overlay

  - `normalizeSettings` produces a complete settings object. `styleRailVars` converts it to a CSS-variable map, and `applyStyleRailVars` writes non-null values as inline properties on the root element.

> **Implementation invariant: Null removes the overlay** — A `null` entry from `styleRailVars` removes that inline property. The selected theme layer or base stylesheet becomes authoritative without a second reset path.

## Structure

```
packages/
├── docs-server/
│   └── src/
│       └── themes.ts  # repository-folder reads and writes
└── docs-workbench/
    └── web/
        └── src/
            ├── shell/
            │   ├── App.tsx  # theme selection, boot hydration, DOM application, and Default autosave
            │   └── StyleRail.tsx  # settings normalization and settings-to-variable conversion
            └── theme/
                ├── notion-palette.css  # raw light and dark variables
                ├── semantic.css  # base semantic-variable layer
                └── theme-folders.ts  # registry, tolerant reader, base resolution, and CSS compiler
themes/
└── default/  # durable Default manifest and sparse component overrides
```

## In This Section

- Global themes

  - Folder resolution, selection state, Default autosave, and fresh-profile hydration.

- Component themes

  - The closed registry, tolerant folder validation, CSS compilation, and sparse override files.

- Fonts

  - How manifest and rail font settings reach CSS, plus the current font-file loading boundary.

- Style rail runtime

  - The normalized settings pipeline, root-property application, and persistence authority.
