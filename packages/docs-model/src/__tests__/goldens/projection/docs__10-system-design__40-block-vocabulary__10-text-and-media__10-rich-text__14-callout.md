Callout highlights short contextual information, including decisions, risks, warnings, and outcomes. It also provides the vocabulary's safety net: retired or unknown block types become callouts rather than failing validation.

## Examples

The five supported tones are info, decision, risk, warning, and success. Each example opens with the tone icon and the printed label, then a dot and the optional title, with the body below. The label is the kind when set and the tone name otherwise.

> **INFO** — Tone only, the agent render labels this `INFO`.

> **DECISION: Keep the original available** — Keep the captured source and review history so the selected design can be compared with its starting point.

> **RISK: Source may have changed** — A source edit made after capture can conflict with the selected revision. Compare the current file before integrating the design.

> **SUCCESS: Golden renders match** — Tone plus `title`, the title joins the label line in the agent render.

> **Boundary under review: Vocabulary growth** — A free-form kind replaces the tone name in the printed label and in the agent render. The tone still sets the color.

## Styles

`props.variant` accepts eyebrow, hairline, rail, and tab, and a missing or unknown value reads as eyebrow. All four variants render the same rail note, so the examples below look alike. A theme can add a fill or a frame to every variant with the tint and hairline knobs.

> **INFO: Eyebrow is the default** — The default variant renders the shared rail note: a 3px tone rail, the icon and label line, and the body.

> **DECISION: Hairline renders the same note** — The variant is stored and stamped as `data-callout-variant`, but it does not change the layout.

> **WARNING: Rail renders the same note** — The tone, not the variant, sets the color of the rail, the icon, and the label.

> **SUCCESS: Tab renders the same note** — Set the tint and hairline knobs in the theme to add a fill or a frame to every callout.

## State Schema

**CalloutState** — packages/docs-model/src/components/rich-text/state.ts#CalloutState

```
tone?: "info" | "decision" | "risk" | "warning" | "success"  # Sets the color of the rail, icon, and label. Without a kind, the printed label is the tone name, and the agent render falls back to the uppercased tone (default INFO).
kind?: string  # Free-form type name. Replaces the tone name in the printed label and the agent render. Coerced legacy types land their old type name here.
title?: string  # Optional bold title after the label.
variant?: "eyebrow" | "hairline" | "rail" | "tab"  # Stored and stamped as data-callout-variant. Every variant renders the same note. A missing or unknown value reads as eyebrow, and the agent render ignores it.
```

```json
{
  "tone": "warning",
  "kind": "Boundary under review",
  "title": "Vocabulary growth",
  "variant": "hairline"
}
```

Carries delta text (`carriesText: true`) as the callout body.

### The Coercion Target

> **Decision: Retired types never break a corpus** — After legacy `flavour` aliasing, any block whose type is a string but not one of the canonical block types coerces to a callout, preserving the old type name as `props.kind` (unless the block already carries its own non-empty `kind`). Props, text, and children carry over verbatim, and the block canonicalizes to the coerced form on its next save. One render rule covers them all.

## Doc Renderer

The slash menu lists **Callout** (aliases: note, info, tip). No input rule, type `/callout` or convert an existing line.

The editable view and the read view share `CalloutDocsBlock`, including the rail, the icon, the printed label, the optional title, and the body. In the editor, ProseMirror owns the body while the head row stays outside the editable text. Typing, formatting, undo, nested content, and clipboard metadata keep the existing document schema. Both views support info, decision, risk, warning, and success, and unknown tones fall back to info.

Every callout is one rail note: a 3px left rail in the tone color, with no fill and no frame by default.

- The first line opens with the tone icon and the printed label in the tone color, at body size and weight 600.

- A `·` separator and the title in ink at the same weight follow the label.

- The body sits below.

- The icon has no tooltip, and the label is always printed.

## Agent Renderer

`> **<label>[: <title>]** — body` where the label is `props.kind` when present, otherwise the uppercased `props.tone` (default `INFO`). Always greppable on the leading token, `grep '> \*\*Decision'` finds every decision callout in a corpus. This page's own decision box renders exactly that way.

## Agent Notes

- Keep the body to one or two sentences, the labeled fact itself. Mechanics, rationale, history, and examples go in a heading-led section (`heading` level 2 or 3 plus paragraphs) placed after the callout; a callout that scrolls is a section wearing a border.

- Decision records are two parts: a short dated callout stating the call, then an H3 section holding the reasoning and consequences.

  - The callout stays greppable.

  - The section carries the why.

- Prefer `kind` for semantic labels ("Decision", "Boundary under review") and `tone` for the visual register. The pair is how this corpus encodes decision records.

- No typed actions exist. Patch `tone`, `kind`, `title`, and `variant` via `updateBlock`, and edit the body via text ops.

## Theme

This block's theme file is `components/callout.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The contract is Theming. In the table, `<tone>` is info, decision, warning, risk, or success, and each accent defaults to its `--docs-tone-*` role. The warning tone reads `--palette-amber`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-callout-border | Frame color, drawn only when hairlineWidth is above 0px |
| fg | --docs-callout-fg | Body text color |
| <tone>Accent | --docs-callout-<tone>-accent | Rail, icon, and label color per tone |
| <tone>Tint | --docs-callout-<tone>-tint | Fill behind the note, transparent by default |
| <tone>TitleFg | --docs-callout-<tone>-title-fg | Title color, the ink by default |
| railWidth | --docs-callout-rail-width | Left rail thickness, 3px by default |
| hairlineWidth | --docs-callout-hairline-width | Frame thickness, 0px by default |
| radius | --docs-callout-radius | Corner radius, following the global radius |
| padX | --docs-callout-pad-x | Horizontal padding, 14px by default |
| padY | --docs-callout-pad-y | Vertical padding, 2px by default |
| titleTextSize | --docs-callout-title-text-size | Size of the label and title line, the body size by default |
| titleWeight | --docs-callout-title-weight | Title weight, 600 by default |
| iconSize | --docs-callout-icon-size | Tone icon size, 16px by default |
| bodyTextScale | --docs-callout-body-text-scale | Body size multiplier on the reading size |
| margin | --docs-callout-margin | Space above and below the callout, 20px by default |
