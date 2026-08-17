A theme may change registered document-surface roles while fixed system UI structure preserves the tool's identity. Theme folders are sparse, closed inputs; the style rail is a higher-precedence user layer over them. Structural decisions about the theming code live in Theming: Overview.

## Structure

```
themes/
├── <id>/  # one theme folder; the folder name is the theme id
│   ├── components/  # sparse registered component values
│   │   └── code.json  # only code values that differ from the base
│   └── theme.json  # manifest: name, optional base and dark mode, font stacks, and rail defaults
└── default/  # the living Default
```

| Manifest field | Meaning |
| --- | --- |
| name | The theme's display label. |
| base | The built-in theme this folder layers over. |
| dark | The light or dark mode the theme declares. |
| fonts | Optional body, heading, code, and numeric stacks. |
| railDefaults | The theme's durable style-rail settings. |

## The Rule

### Closed Reach

- The `THEME_TOKEN_REGISTRY` allow-list bounds every component file and key a theme may reach.

- Component files are sparse; an absent value falls through to the base theme and semantic contract.

- Unknown files, unknown keys, and malformed mode values are ignored rather than applied.

### Resolution and Selection

- A theme resolves over a base chain: the folder's values apply over its named built-in base, and an unknown base ends the chain rather than failing the theme.

- A repository theme shadows a built-in theme with the same id.

- Every theme resolves to a light and a dark value set; a single scalar value applies to both modes.

- Selecting a theme applies its declared mode, adopts its rail defaults as the working settings, and persists as the active selection across sessions.

- Theme settings also travel as an exported file; import validates and normalizes the payload, and an invalid file leaves the active state unchanged.

| Layer | May decide | Precedence |
| --- | --- | --- |
| Semantic contract | Fallback palette, roles, and geometry | Base |
| Theme folder | Registered role values, font stacks, and rail defaults | Over the semantic contract |
| Style rail | User values for exposed controls | Over the selected theme |
| System UI structure | Unregistered widths, row metrics, and framing | Fixed outside theme reach |

### The Living Default

Default is the workbench's living theme. Every rail setting, dark toggle, and component override auto-saves into it shortly after the last change; selecting Default restores the saved look.

- The saved state is complete: every scalar setting carries a saved value, so Default restores the whole look rather than a diff; component values are saved only where they diverge.

- Active rail overrides still win over the saved values.

- The repository copy is the durable authority: browser-local state is a cache and a fallback, and never overrides settings loaded from the repository.

- A fresh browser profile hydrates from the repository Default before autosave engages.

- A theme-locked serve applies the repository Default unconditionally, hides the rail, and rejects theme writes; a static export is read-only.

### The Customization Boundary

Registered colors, typography, global radius, document layout values, and component tokens may follow a theme. System UI structure stays fixed: unregistered widths, row geometry, visibility breakpoints, and interaction framing do not become theme values. The fixed structure keeps every theme recognizable as the same tool.

## Why

- **Hand editing fails safely**

  - A typo or unsupported key cannot escape the closed vocabulary and alter an arbitrary application property.

- **Default is adjustable by eye**

  - Visual feedback and automatic persistence make the repo's core look quick to tune without a manual export step.

- **Customization is bounded**

  - A theme can make the document its own without turning the surrounding workbench into a different product.
