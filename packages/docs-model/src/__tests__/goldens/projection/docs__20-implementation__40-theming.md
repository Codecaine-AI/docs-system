# Theming: overview

Theming is a first-class feature of the workbench: every visual decision resolves through one canonical token contract, so the whole system — colors, fonts, editor controls — restyles without touching component code. This section lays out the structure: who decides what, where each file lives, and exactly what can and cannot be changed.

## Who decides what

| Layer | Who sets it | Examples | Where |
| --- | --- | --- | --- |
| System UI | The system — deliberately NOT themable | Sidebar width, rail width, header heights | Component code (see System UI) |
| Theme | A selected theme folder (global built-in or repo custom) | Palette, component tokens, font stacks, rail defaults | themes/<id>/ (see Global themes) |
| User overlay | The style rail's knobs, per user, on top of the theme | Accent, fonts, layout metrics, highlight/grip tuning | localStorage blob (see System UI for the knob map) |

> **INFO: Precedence** — Theme files define; the user overlay overrides; the system UI is out of reach of both. A rail knob at its default removes its override, so the theme (and below it, the default token files) stays authoritative.

## The three token tiers

- Palette — `theme/notion-palette.css`. Raw color values as `--color-*` variables, defined twice: a light block and a dark block. The only place raw hex/rgba theme colors are allowed.

- Semantic tokens — `theme/semantic.css`. Per-surface meaning mapped from palette variables, in both theme blocks. Component tokens follow `--docs-<component>-<part>` (for example `--docs-inline-code-fg`). Every new themable property gets a token here — never a literal at a use site.

- Consumption — `index.css` and docs-viewer components reference tier-2 tokens only. docs-viewer's Tailwind classes may carry a neutral literal fallback inside `var()` (the package renders in hosts without this stylesheet); the workbench always defines the token, so fallbacks never win here.

> **INFO: The one rule** — Consumers never branch on light versus dark. A mode flip only swaps the tier 1 and tier 2 definitions; everything downstream re-resolves automatically.

## Where the files live

```
../
└── ../
    └── ../
        └── ../
            └── themes/  # repo custom theme folders (see Global themes)
shell/
└── StyleRail.tsx  # the user overlay: knobs, theme picker, export/import
theme/
├── notion-palette.css  # tier 1 — raw colors, light + dark
├── semantic.css  # tier 2 — the canonical contract (see its header)
└── theme-folders.ts  # theme-folder loader: token registry, base chains, CSS compile
index.css  # tier 3 — app CSS consuming tokens; :root font defaults
```

## In this section

- Global themes — the theme-folder format, built-ins, selection semantics, save-as.

- Component themes — the per-surface token files and the closed registry that validates them.

- Fonts — per-surface font tokens and custom font loading.

- System UI — what is deliberately fixed, and the full map of every style-rail knob.
