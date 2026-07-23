The default block of the block vocabulary: rich text prose. Anything that is not structurally something else is a paragraph — leads, explanations, connective tissue between headings and object blocks.

## Example

This paragraph is a live example: it carries **bold**, *italic*, ~~strike~~, and `code` marks, [an outbound link](https://example.com), and a reference chip to Cross-doc linking.

## State Schema

**ParagraphState** — packages/docs-model/src/components/rich-text/state.ts#ParagraphState

Carries delta text (`carriesText: true`): an array of spans with optional `bold` / `italic` / `strike` / `code` marks, a `link` URL, or a reference chip (a shared SpectreRef pointing at a doc or code location).

## Doc Renderer

Typing lands in a paragraph by default; the slash menu lists it as **Text**. Markdown-shortcut input rules auto-convert only `**bold**` and ``code`` as you type — italic and strike deliberately have no typing shortcut, though their `Cmd+I` / `Cmd+Shift+S` keybindings and paste conversion still apply the marks. `Cmd+K` on a non-empty selection opens the link popover; pasting a URL over a selection applies the link mark directly.

## Agent Renderer

A plain text line. Marks render as standard markdown syntax (code innermost, then bold/italic/strike, link outermost); `reference` spans render as plain text — the span's own insert (by the linking standard, the target's name), falling back to the reference path — because the agent surface is a greppable terminal artifact, not a rendered document. Two quirks worth knowing: a paragraph with empty text renders nothing at all, and the document root is itself a paragraph shell whose own line is always skipped — only its children render.

## Agent Notes

- Edit through the generic text ops (`updateBlock`, `splitBlock`, `mergeBlocks`) — a paragraph has no typed actions and no props to patch.

- An empty paragraph is invisible in `docs render` output; don't rely on it as a spacer.

## Theme

This block's theme file is `components/paragraph.json` in a theme folder (`themes/<id>/`; see Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The contract is Theming.

| Key | CSS variable | Styles |
| --- | --- | --- |
| fg | --docs-paragraph-fg | Paragraph text color |
