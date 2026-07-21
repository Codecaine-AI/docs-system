The block quote of the block vocabulary: rich text set apart for emphasis or citation. For labeled, toned admonitions use a callout instead — quote is the plain, unlabeled form.

## State

No props: `QuoteState` is a closed empty object. Carries delta text (`carriesText: true`) with the full mark set.

## Markdown render

A `>`-prefixed blockquote line (every line of the text gets the prefix).

## In the editor

Slash menu: **Quote**. Input rule: `>` plus a space at the start of a line.

## Agent notes

- Generic text ops only

  - No typed actions, no props.

- In the rendered markdown, quote lines share the `> ` prefix with callout, mermaid, and video renders; grep for `> \*\*` to isolate the labeled families from plain quotes.

## Theming

This block's theme file is `components/quote.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| fg | --docs-quote-fg | Quote text color |
| border | --docs-quote-border | Left border color |
