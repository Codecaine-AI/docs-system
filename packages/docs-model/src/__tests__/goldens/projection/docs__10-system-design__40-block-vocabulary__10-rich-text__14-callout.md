Callout highlights short contextual information, including decisions, risks, warnings, and outcomes. It also provides the vocabulary's safety net: retired or unknown block types become callouts rather than failing validation.

## Examples

The five supported tones are info, decision, risk, warning, and success. Each example shows the read view's tone icon and colored header above a plain body. An optional title replaces the header's tone label. Free-form kind metadata labels the agent projection without adding a chip to the read view.

> **INFO** — Tone only, the agent render labels this `INFO`.

> **DECISION: Keep the original available** — Retain the captured source and review history so the selected design can be compared with its starting point.

> **RISK: Source may have changed** — A source edit made after capture can conflict with the selected revision. Compare the current file before integrating the design.

> **SUCCESS: Golden renders match** — Tone plus `title`, the title joins the label line in the agent render.

> **Boundary under review: Vocabulary growth** — A free-form `kind` wins over the tone label in the agent render; `tone` still drives the color.

## State Schema

**CalloutState** — packages/docs-model/src/components/rich-text/state.ts#CalloutState

```
tone?: "info" | "decision" | "risk" | "warning" | "success"  # Color/intent; the agent render's label falls back to the uppercased tone (default INFO).
kind?: string  # Free-form label chip; wins over tone in the agent render. Coerced legacy types land their old type name here.
title?: string  # Optional bold title after the label.
```

```json
{
  "tone": "warning",
  "kind": "Boundary under review",
  "title": "Vocabulary growth"
}
```

Carries delta text (`carriesText: true`) as the callout body.

### The Coercion Target

> **Decision: Retired types never break a corpus** — After legacy `flavour` aliasing, any block whose type is a string but not one of the canonical block types coerces to a callout, preserving the old type name as `props.kind` (unless the block already carries its own non-empty `kind`); props, text, and children carry over verbatim, and the block canonicalizes to the coerced form on its next save. One render rule covers them all.

## Doc Renderer

Slash menu: **Callout** (aliases: note, info, tip). No input rule, type `/callout` or convert an existing line.

The normal editable view and the read/annotation view share CalloutDocsBlock, including its icon, title, colored textured header, faint edge, and plain body. In the editor, ProseMirror owns the body content while the decorative header stays outside the editable text. Typing, formatting, undo, nested content, and clipboard metadata retain the existing document schema. Both views support info, decision, risk, warning, and success; unknown tones fall back to info.

The approved design uses a tone-colored header with an icon and title above a plain body in every viewing mode. Subtle curved texture fades toward the title, and a faint one-pixel line marks the header's bottom edge when body content follows. A thin matching outer border and rounded corners keep Callout compact. State Shape and Interaction Surface supply the visual references; Callout keeps its short contextual purpose and does not adopt their field layouts. The user's integration approval covers the normal editable view as well as the read/annotation view. Variator retains the original, superseded directions, saved refinements, and integration evidence.

## Agent Renderer

`> **<label>[: <title>]** — body` where the label is `props.kind` when present, otherwise the uppercased `props.tone` (default `INFO`). Always greppable on the leading token, `grep '> \*\*Decision'` finds every decision callout in a corpus. This page's own decision box renders exactly that way.

## Agent Notes

- Keep the body to one or two sentences, the labeled fact itself. Mechanics, rationale, history, and examples go in a heading-led section (`heading` level 2 or 3 plus paragraphs) placed after the callout; a callout that scrolls is a section wearing a border.

- Decision records are two parts: a short dated callout stating the call, then an H3 section holding the reasoning and consequences. The callout stays greppable; the section carries the why.

- Prefer `kind` for semantic labels ("Decision", "Boundary under review") and `tone` for the visual register; the pair is how this corpus encodes decision records.

- No typed actions, patch `tone`/`kind`/`title` via `updateBlock`, edit the body via text ops.

## Theme

This block's theme file is `components/callout.json` in a theme folder (`themes/<id>/`; see Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The contract is Theming.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-viewer-callout-border | Card border |
| fill | --docs-viewer-callout-fill | Card background |
| fg | --docs-callout-fg | Body text color |
