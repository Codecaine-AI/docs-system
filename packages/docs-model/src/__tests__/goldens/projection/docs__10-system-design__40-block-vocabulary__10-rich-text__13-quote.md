The block quote of the block vocabulary: rich text set apart for emphasis or citation. For labeled, toned admonitions use a callout instead. Quote is the plain, unlabeled form.

## Example

> A live quote: prose set apart from the flow, with no label, no tone, and plain delta text.

## State Schema

**QuoteState** — packages/docs-model/src/components/rich-text/state.ts#QuoteState

Carries delta text (`carriesText: true`) with the full mark set.

## Doc Renderer

Slash menu: **Quote**. Input rule: `>` plus a space at the start of a line.

## Agent Renderer

A `>`-prefixed blockquote line (every line of the text gets the prefix).

## Agent Notes

- Generic text ops only

  - No typed actions, no props.

- In the rendered markdown, quote lines share the `> ` prefix with callout and video renders; grep for `> \*\*` to isolate the labeled families from plain quotes.

## Theme

This block's theme file is `components/quote.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The contract is Theming.

| Key | CSS variable | Styles |
| --- | --- | --- |
| fg | --docs-quote-fg | Quote text color |
| border | --docs-quote-border | Left border color |
