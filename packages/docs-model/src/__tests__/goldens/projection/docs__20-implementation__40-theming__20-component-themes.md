A component theme file is a sparse map at `components/<surface>.json`. `THEME_TOKEN_REGISTRY` is the closed runtime vocabulary that maps each accepted file and key to one or more CSS variables. The variables and their visual meanings are specified by Tokens.

## Registry and Validation

| Stage | Mechanic |
| --- | --- |
| Registry | Each file/key entry declares CSS vars and a color, length, or number kind. Length and number entries also carry min, max, step, and default metadata. |
| Folder read | readThemeDefinition drops unknown files and keys. A registered value survives only as a non-empty string or a { light, dark } string pair. |
| Rail read | normalizeComponentOverrides keeps registered pairs only. Colors must be six-digit hex; lengths and numbers must parse inside their registry range. |
| Compilation | compileThemeCss writes every mapped variable into light and dark blocks. A scalar value is copied to both modes. |
| Runtime overlay | styleRailVars maps sparse rail overrides through the same registry. A default-valued length or number becomes null and removes the inline property. |

```json
{
  "fg": { "light": "#0b6e99", "dark": "#529cca" },
  "bg": { "light": "#e7f3f8", "dark": "#173d4d" }
}
```
> **L1-4 (themes/example/components/inline-code.json):** Only the registered keys this theme overrides are present.

## Persistence Layers

`themes/default/theme.json` stores the complete normalized scalar settings under `railDefaults`, with an empty `components` member. Each `themes/default/components/*.json` file stores only the registered keys overridden for that surface. The server replaces the manifest and writes each component file supplied by the request; component files omitted from a request remain on disk.

## Extending the Registry

A new theme knob requires the semantic variable in both mode blocks of `semantic.css`, a consumer that reads it through `var(--docs-…)`, and a typed entry in `THEME_TOKEN_REGISTRY`. The generic component pane reads registry metadata, so registered length and number entries receive sliders without a component-specific control. Per-block visual behavior remains in the Block vocabulary.
