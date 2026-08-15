A global theme is loaded from `themes/<id>/`, resolved against a built-in base, and compiled into a CSS layer. The workbench persists style-rail settings back to the active theme folder, making its `railDefaults` the durable authority. What themes are allowed to change is specified by Themes.

## Structure

Each folder contains a `theme.json` manifest and optional `components/<surface>.json` files. The component payload and closed-key filtering are documented in Component themes.

| Field | Runtime use |
| --- | --- |
| name | Theme label returned by the repository catalogue. |
| base | Built-in theme id resolved before this folder; missing bases stop the chain. |
| dark | Mode applied when the folder becomes active. |
| fonts | Optional body, heading, code, and number stacks compiled into font variables. |
| railDefaults | Durable style-rail settings loaded from and written back to the active theme folder. |

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

- Active-theme autosave

  - An unlocked, non-static workbench writes after 1.5 seconds without another settings change. The active theme manifest receives the complete normalized non-component settings as `railDefaults`, including `annotate` settings and per-block lane settings in `blockLayout`; registered component overrides are sent as sparse files.

> **Implementation guard: Repository railDefaults are authoritative** — The active theme folder's `railDefaults` is the durable authority. `localStorage` is only a cache and a fallback when repository settings are absent; it never overrides settings loaded from the folder.

- Repository authority

  - `POST /api/themes` accepts lowercase slug ids and writes folders beside the docs root. Folders created directly use the same tolerant reader, which drops unknown fields and registry keys. A host started with `--theme-locked` hides the style rail, never starts the writer, and rejects this route with 403. Static workbenches also never start the writer.

- Local file transfer

  - Export serializes version, dark mode, and the complete settings object to `docs-theme.json`. Import normalizes the settings payload before application and ignores invalid JSON without changing active state; it does not read or write a repository theme folder directly.
