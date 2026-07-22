Each visual surface has its own token file inside a theme folder: `components/<surface>.json`. Every color value is one string (both modes) or a `{ light, dark }` pair. Non-color length and number tokens are always single strings. There is ONE FILE PER BLOCK-VOCABULARY TYPE (each type's own doc under 10-block-vocabulary states its keys) plus four non-block files. The vocabulary is CLOSED: files and keys must appear in `THEME_TOKEN_REGISTRY` (`theme/theme-folders.ts`), which maps each key to the tier-2 CSS variables it writes. Unknown files or keys are ignored, so a hand-edited theme can never break the app.

**The surface vocabulary**

| File | Keys | What it styles |
| --- | --- | --- |
| shell.json | background, sidebar, text, accent, link | Page background, sidebar surface, body text, accent + link colors |
| surfaces.json | border, muted, icon | Borders/inputs, muted fills, muted icon color |
| inline-code.json | fg, bg | The inline code chip (text + fill) |
| editor-controls.json | highlight, dropLine, grip | Block highlight fill, drag drop-line, drag grip color |
| paragraph.json | fg | Paragraph text |
| heading.json | fg | Heading text (all levels) |
| list-item.json | marker | Bullet dot / ordered counter |
| quote.json | fg, border | Quote text + left border |
| code.json | bg, border, string, number, boolean, null, key | Code block surface + syntax colors |
| callout.json | border, fill, fg | Callout card border, fill, body text |
| divider.json | color | Rule color |
| image.json | border, caption | Image border + caption text |
| video.json | border, caption | Video frame border + caption text |
| file-tree.json | border, note | Container border + entry notes |
| structured-table.json | border, headerBg, headerFg, headerRule(+Width/Opacity), rowRule(+Width/Opacity), cellPaddingY/X, fontSize, handleRadius/Offset, selectionPadding | Header + row rules, spacing, text size + editor handle/selection furniture |
| interaction-surface.json | border, bg | Container border + background |
| mermaid.json | border, bg | Container border + background |
| canvas.json | border | Embed container border |

```json
// themes/example/components/inline-code.json
{
  "fg": { "light": "#0b6e99", "dark": "#529cca" },
  "bg": { "light": "rgba(0, 120, 223, 0.12)", "dark": "rgba(82, 156, 202, 0.18)" }
}
```

## Extending the Vocabulary

Adding a themable property is a three-step change: define the token in both blocks of `semantic.css`, consume it via `var(--docs-...)` at the use site, and add the file/key mapping to `THEME_TOKEN_REGISTRY`. Keep this page's table in sync when the registry grows. The editor furniture accent for the structured-table controls is the semantic variable `--docs-editor-accent` (light rgb(0, 120, 223), dark rgb(82, 156, 202)), defined in the workbench semantic layer and consumed with a hex fallback.
