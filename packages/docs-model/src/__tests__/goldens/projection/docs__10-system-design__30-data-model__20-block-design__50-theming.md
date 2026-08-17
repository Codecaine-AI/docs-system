Every type ships its style capabilities as theme knobs — never hardcoded looks. This page states the component theme contract.

## Structure

```json
// themes/default/components/structured-table.json
{
  "headerRuleWidth": "1.5px",
  "cellPaddingY": "12px",
  "rowRuleOpacity": "0.8",
  "handleOffset": "16px",
  "selectionPadding": "4px"
}
```
> **L1-7 (Knobs, not CSS):** Each key is a typed knob (color, length, number) the style rail can edit live; the renderer consumes them as tokens.

## The Rule

- **One theme file per type**

  - The component declares its knobs and their defaults; a theme overrides values, never invents knobs.

- **Knobs are typed**

  - Color, length, and number kinds — so the style rail can render the right control for every knob without knowing the component.

- **Overrides are sparse and tolerant**

  - A theme file carries only the knobs it changes; an absent knob falls through to the base theme and the component's declared default.

  - A knob value is a single scalar or a light/dark pair; a scalar applies to both modes.

  - Unknown files, unknown knobs, and malformed values are ignored rather than applied — a value survives only when it parses as its declared kind, and lengths and numbers must fall inside the knob's declared range.

- **Resolution is layered**

  - A repo theme folder overrides the compiled-in defaults; the live theme auto-saves edits back into it.

  - The renderer consumes resolved tokens only — it cannot tell where a value came from.

## Why

- **Looks are state, not code**

  - Restyling a block type is a data change, reviewable and revertible like any other.

- **One rail edits every block**

  - Typed knobs make theming uniform: new block types get rail support the moment they ship a theme file.
