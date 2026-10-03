The visual system is a bounded contract for the document surface. Semantic tokens name visual roles, typography assigns faces by reading role, and themes tune those roles without changing fixed system UI structure. Components consume the contract instead of choosing light or dark values for themselves. The implementation mechanics live in Theming: Overview.

## The Visual Contract

- Tokens

  - Palette-to-semantic resolution, the shared sharpness scale, editor accent, and the geometry that remains fixed.

- Typography and Fonts

  - Body, heading, code, and numeric roles, the bundled Inter and IBM Plex Mono faces, and the stock reading metrics.

- Themes

  - The closed customization boundary, sparse theme folders, overlay precedence, the shared Global theme, and the living Default.

- Code Colors From Your Editor

  - The syntax roles that color every code surface from your VS Code or Cursor theme, and the colors of inline code chips.

- Block Widths and Lanes

  - The text, code, and wide lanes, their stock pixel widths, and how blocks and table columns size inside them.

- Text Measurement

  - How layout lints and diagram layouts measure text without rendering, and when their widths are exact.
