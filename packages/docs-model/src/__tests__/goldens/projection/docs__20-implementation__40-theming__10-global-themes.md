A global theme is loaded from `themes/<id>/`, resolved against a built-in base, and compiled into a CSS layer. The workbench persists the active Default settings back to `themes/default/`. What themes are allowed to change is specified by Themes.

## Structure

Each folder contains a `theme.json` manifest and optional `components/<surface>.json` files. The component payload and closed-key filtering are documented in Component themes.

| Field | Runtime use |
| --- | --- |
| name | Theme label returned by the repository catalogue. |
| base | Built-in theme id resolved before this folder; missing bases stop the chain. |
| dark | Mode applied on explicit selection and fresh-profile hydration. |
| fonts | Optional body, heading, code, and number stacks compiled into font variables. |
| railDefaults | Style-rail settings applied on explicit selection and used to seed a profile with no stored settings. |

```json
{
  "name": "Example",
  "base": "default",
  "dark": false,
  "fonts": {
    "code": "'Berkeley Mono', ui-monospace, monospace"
  }
}
```
> **L1 (themes/example/theme.json):** The directory name is the theme id; the manifest does not repeat it.

## Resolution and Selection

`resolveThemeById` loads a repository folder before the built-in definition with the same id. `resolveThemeChain` flattens built-in bases, then `compileThemeCss` emits light and dark variable blocks. Explicit selection injects that layer, normalizes `railDefaults`, applies the manifest mode, and stores the id under `docs-theme-folder-id`.

## Persistence

- Default autosave

  - An unlocked, non-static workbench writes after 1.5 seconds without another settings change. The manifest receives the complete normalized non-component settings as `railDefaults`; registered component overrides are sent as sparse files.

> **Implementation guard: Fresh profiles hydrate before writing** — `hasStoredStyleRailSettings` distinguishes a fresh profile from a stored one. A fresh profile loads and normalizes the repository Default's `railDefaults` before `settingsSeededRef` enables the autosave effect. Stock settings cannot overwrite the saved folder during boot.

- Repository authority

  - `POST /api/themes` accepts lowercase slug ids and writes folders beside the docs root. Folders created directly use the same tolerant reader, which drops unknown fields and registry keys. Theme-locked serves reject the route with 403; static and locked workbenches never start the writer.

- Local file transfer

  - Export serializes version, dark mode, and the complete settings object to `docs-theme.json`. Import normalizes the settings payload before application and ignores invalid JSON without changing active state; it does not read or write a repository theme folder directly.
