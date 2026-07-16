# paragraph

The default block of the block vocabulary: rich text prose. Anything that is not structurally something else is a paragraph — leads, explanations, connective tissue between headings and object blocks.

## State

No props: `ParagraphState` is a closed empty object (`additionalProperties: false`), so any prop is a validation error. It carries delta text (`carriesText: true`): an array of spans with optional `bold` / `italic` / `strike` / `code` marks, a `link` URL, or a `reference` chip (a shared SpectreRef pointing at a doc or code location).

## Markdown projection

A plain text line. Marks render as standard markdown syntax (code innermost, then bold/italic/strike, link outermost); `reference` marks render as plain text — label if present, else the reference path — because the projection is a greppable terminal artifact, not a rendered document. Two quirks worth knowing: a paragraph with empty text projects nothing at all, and the document root is itself a paragraph shell whose own line is always skipped — only its children project.

## In the editor

Typing lands in a paragraph by default; the slash menu lists it as **Text**. Markdown-shortcut input rules apply the inline marks as you type (`**bold**`, `*italic*`, `~~strike~~`, ``code``), and `Cmd+K` (or pasting a URL over a selection) applies a link mark.

## Agent notes

- Edit through the generic text ops (`updateBlock`, `splitBlock`, `mergeBlocks`) — a paragraph has no typed actions and no props to patch.

- An empty paragraph is invisible in `docs render` output; don't rely on it as a spacer.

## Theming

This block's theme file is `components/paragraph.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| fg | --docs-paragraph-fg | Paragraph text color |
