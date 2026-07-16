# mermaid

The diagram block of the block vocabulary: Mermaid source with a live render. Unusually for an object block, the diagram source lives in the block's *text*, not in props — so it edits through the same generic text ops as prose.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| title | string | no | Label used in the projection and the rendered header. |
| caption | string | no | Caption the viewer renders under the diagram. |
| diagramType | string | no | Diagram kind hint read by the viewer's render surface. |

Carries delta text (`carriesText: true`): the Mermaid source itself.

## Markdown projection

A labeled blockquote — `> **Mermaid[: <title>]** — <source>` — with the source flattened inline, deliberately *not* a ````mermaid` fence: the projection is a greppable summary line (`grep '> \*\*Mermaid'`), and the live render belongs to the viewer.

## In the editor

A non-editable atom leaf node; `MermaidDocsBlock` live-renders the source and reads `caption` and `diagramType` from props. No slash-menu entry today.

## Agent notes

- Edit the diagram by editing the block's text (the Mermaid source); patch `title`/`caption` via `updateBlock`. No typed actions.

- Because the projection flattens the source onto one line, keep node labels self-explanatory — the projection reader sees the raw Mermaid text.

## Theming

This block's theme file is `components/mermaid.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-mermaid-border | Container border |
| bg | --docs-mermaid-bg | Container background |
