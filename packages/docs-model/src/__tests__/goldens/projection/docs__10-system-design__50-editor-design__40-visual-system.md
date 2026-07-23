The visual system is a bounded contract for the document surface: semantic tokens name visual roles, typography assigns faces by reading role, and themes tune those roles without altering fixed system UI structure. Components consume the contract instead of choosing light or dark values for themselves. The implementation mechanics live in Theming: Overview.

## The Visual Contract

- Tokens

  - Palette-to-semantic resolution, the shared sharpness scale, editor accent, and the geometry that remains fixed.

- Typography and Fonts

  - Body, heading, code, and numeric roles; the living Default metrics; and the boundary around custom font files.

- Themes

  - The closed customization boundary, sparse theme folders, overlay precedence, and the living Default.
