A theme may change registered document-surface roles while fixed system UI structure preserves the tool's identity. Theme folders are sparse, closed inputs; the style rail is a higher-precedence user layer over them. Loading, validation, compilation, and persistence mechanics live in Theming: Overview.

## Structure

```
themes/
├── <id>/  # one theme folder
│   ├── components/  # sparse registered component values
│   │   └── code.json  # only code values that differ from the base
│   └── theme.json  # manifest: name, optional base and dark mode, font stacks, and rail defaults
└── default/  # the living Default written by the workbench
```

## The Rule

### Closed Reach

- The `THEME_TOKEN_REGISTRY` allow-list bounds every component file and key a theme may reach.

- Component files are sparse; an absent value falls through to the base theme and semantic contract.

- Unknown files, unknown keys, and malformed mode values are ignored rather than applied.

| Layer | May decide | Precedence |
| --- | --- | --- |
| Semantic contract | Fallback palette, roles, and geometry | Base |
| Theme folder | Registered role values, font stacks, and rail defaults | Over the semantic contract |
| Style rail | User values for exposed controls | Over the selected theme |
| System UI structure | Unregistered widths, row metrics, and framing | Fixed outside theme reach |

### The Living Default

Default is the workbench's living repo theme. Every rail setting, dark toggle, and component override auto-saves into `themes/default/`. Selecting Default restores the saved look.

- The manifest carries complete scalar rail defaults.

- Component files carry only token divergences; active rail overrides still win over those files.

### The Customization Boundary

Registered colors, typography, global radius, document layout values, and component tokens may follow a theme. System UI structure stays fixed: unregistered widths, row geometry, visibility breakpoints, and interaction framing do not become theme values. The fixed structure keeps every theme recognizable as the same tool.

## Why

- **Hand editing fails safely**

  - A typo or unsupported key cannot escape the closed vocabulary and alter an arbitrary application property.

- **Default is adjustable by eye**

  - Visual feedback and automatic persistence make the repo's core look quick to tune without a manual export step.

- **Customization is bounded**

  - A theme can make the document its own without turning the surrounding workbench into a different product.
