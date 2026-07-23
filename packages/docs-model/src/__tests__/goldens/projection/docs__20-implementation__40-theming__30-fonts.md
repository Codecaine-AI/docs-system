Font settings enter the runtime through a theme manifest or normalized style-rail state and leave as four CSS custom properties. This page covers parsing and application. The reading roles and current default values are specified by Typography and Fonts.

## Application

`packages/docs-workbench/web/src/theme/theme-folders.ts` accepts non-empty `body`, `heading`, `code`, and `number` manifest strings and compiles them into both mode blocks through `FONT_VARS`. `packages/docs-workbench/web/src/shell/StyleRail.tsx` maps its font enums to built-in stack strings in `styleRailVars`. A rail value equal to its compiled default returns `null`, removing the inline property and exposing the theme value.

> **Current boundary: No font-file loader** — The workbench has no `@font-face` registry or font-binary loading path. A manifest stack resolves only when the browser or host already provides the named family.
