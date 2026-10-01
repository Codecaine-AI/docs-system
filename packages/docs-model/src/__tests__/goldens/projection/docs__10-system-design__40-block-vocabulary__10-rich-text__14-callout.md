Callout highlights short contextual information, including decisions, risks, warnings, and outcomes. It also provides the vocabulary's safety net: retired or unknown block types become callouts rather than failing validation.

## Examples

The five supported tones are info, decision, risk, warning, and success. Each example shows the tone icon beside an optional title, with a plain body below. The read view prints no type label. Hovering the icon shows the type name, which is `kind` when set and the tone name otherwise.

> **INFO** — Tone only, the agent render labels this `INFO`.

> **DECISION: Keep the original available** — Retain the captured source and review history so the selected design can be compared with its starting point.

> **RISK: Source may have changed** — A source edit made after capture can conflict with the selected revision. Compare the current file before integrating the design.

> **SUCCESS: Golden renders match** — Tone plus `title`, the title joins the label line in the agent render.

> **Boundary under review: Vocabulary growth** — A free-form `kind` wins over the tone name in the agent render and the icon tooltip. `tone` still drives the color.

## Styles

Set `props.variant` to pick one of four styles per block. `eyebrow` is the default, and a missing or unknown value renders as `eyebrow`. Every style keeps the tone color and icon and changes only the frame.

> **INFO: Eyebrow is the default** — A colored left rail and a faint tone tint frame the callout, with the icon beside the title. Pick it for most callouts.

> **DECISION: Hairline separates without a fill** — The icon sits in its own column behind a thin tone-tinted line, with no background. Pick it for dense pages where a quiet divider is enough.

> **WARNING: Rail marks the edge** — The icon sits in its own column left of a thicker, solid tone rail, with no background. Pick it over hairline when the callout needs a stronger edge but should stay unfilled.

> **SUCCESS: Tab opens with a rule** — A thin tone rule runs across the top with the icon notched into it, and a faint tint fills below. Pick it when the callout heads a short run of related content.

## State Schema

**CalloutState** — packages/docs-model/src/components/rich-text/state.ts#CalloutState

```
tone?: "info" | "decision" | "risk" | "warning" | "success"  # Color/intent; the agent render's label falls back to the uppercased tone (default INFO).
kind?: string  # Free-form type name. Wins over tone in the agent render and the icon tooltip. Coerced legacy types land their old type name here.
title?: string  # Optional bold title after the label.
variant?: "eyebrow" | "hairline" | "rail" | "tab"  # Visual style of the frame. A missing or unknown value renders as eyebrow, the default. The agent render ignores it.
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

> **Decision: Retired types never break a corpus** — After legacy `flavour` aliasing, any block whose type is a string but not one of the canonical block types coerces to a callout, preserving the old type name as `props.kind` (unless the block already carries its own non-empty `kind`); props, text, and children carry over verbatim, and the block canonicalizes to the coerced form on its next save. One render rule covers them all.

## Doc Renderer

Slash menu: **Callout** (aliases: note, info, tip). No input rule, type `/callout` or convert an existing line.

The normal editable view and the read/annotation view share CalloutDocsBlock, including its icon, optional title, style frame, and plain body. In the editor, ProseMirror owns the body content while the icon and title stay outside the editable text. Typing, formatting, undo, nested content, and clipboard metadata retain the existing document schema. Both views support info, decision, risk, warning, and success. Unknown tones fall back to info.

Every style is minimal. No style prints a type label or a colored header band. The tone icon carries the type, and hovering it shows the type name in a tooltip. `props.variant` selects the frame per block, as shown under Styles. Rail and line thickness come from theme tokens, so a theme restyles every callout at once. Variator retains the original, superseded directions, saved refinements, and integration evidence.

## Agent Renderer

`> **<label>[: <title>]** — body` where the label is `props.kind` when present, otherwise the uppercased `props.tone` (default `INFO`). Always greppable on the leading token, `grep '> \*\*Decision'` finds every decision callout in a corpus. This page's own decision box renders exactly that way.

## Agent Notes

- Keep the body to one or two sentences, the labeled fact itself. Mechanics, rationale, history, and examples go in a heading-led section (`heading` level 2 or 3 plus paragraphs) placed after the callout; a callout that scrolls is a section wearing a border.

- Decision records are two parts: a short dated callout stating the call, then an H3 section holding the reasoning and consequences. The callout stays greppable; the section carries the why.

- Prefer `kind` for semantic labels ("Decision", "Boundary under review") and `tone` for the visual register; the pair is how this corpus encodes decision records.

- No typed actions exist. Patch `tone`, `kind`, `title`, and `variant` via `updateBlock`, and edit the body via text ops.

## Theme

This block's theme file is `components/callout.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The contract is Theming. In the table, `<tone>` is info, decision, warning, or success, and risk uses the warning palette.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-callout-border | Optional override color for the rail and divider line. Unset, each tone's accent colors them. |
| fg | --docs-callout-fg | Body text color |
| <tone>Accent | --docs-callout-<tone>-accent | Icon, rail, line, and rule color per tone |
| <tone>Tint | --docs-callout-<tone>-tint | Faint tint behind eyebrow and tab callouts. Replaces <tone>HeaderBg. |
| <tone>TitleFg | --docs-callout-<tone>-title-fg | Title text color. Replaces <tone>HeaderFg. |
| railWidth | --docs-callout-rail-width | Eyebrow rail and rail-style thickness, 2px by default |
| hairlineWidth | --docs-callout-hairline-width | Hairline divider and tab rule thickness, 1px by default |
| radius | --docs-callout-radius | Corner radius, following the global radius |
| padX | --docs-callout-pad-x | Horizontal padding |
| padY | --docs-callout-pad-y | Vertical padding of the whole eyebrow and tab frame, 12px by default |
| titleTextSize | --docs-callout-title-text-size | Title font size |
| titleWeight | --docs-callout-title-weight | Title font weight |
| iconSize | --docs-callout-icon-size | Tone icon size |
| bodyTextScale | --docs-callout-body-text-scale | Body size multiplier on the reading size |
| margin | --docs-callout-margin | Space above and below the callout |
