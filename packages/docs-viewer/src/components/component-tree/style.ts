/**
 * Component-tree rules on top of the shared trees row system (tree-rows.tsx).
 * Every selector starts at `.docs-tree[data-tree-kind="component-tree"]`, so
 * call-stack, file-tree, file-explorer and state-shape keep their own look.
 *
 * When the rows do not fit beside their comments (data-notes="below"):
 * - each source chip stays on its row's code line, in one column, whether the
 *   row has a comment or not;
 * - the code stops at the chip column and wraps under itself with a 4ch
 *   hanging indent, deeper than the comment's child indent, so a wrapped prop
 *   never reads as the comment line and never runs into its chip;
 * - the comment takes the second line at the child indent, led by a muted
 *   mono `//`, so it never reads as a child row or a wrapped prop.
 */
const TREE = '.docs-tree[data-tree-kind="component-tree"]';
const BELOW = `${TREE} .docs-tree__rows[data-notes="below"]`;

export const COMPONENT_TREE_CSS = `
/* .docs-tree__row > raises these above the shared notes-below rules */
${BELOW} .docs-tree__row > .docs-tree__path { grid-column: path / src; grid-row: 1; }
${BELOW} .docs-tree__row > .docs-tree__src { grid-row: 1; align-self: start; }
${BELOW} .docs-tree__row > .docs-tree__note {
  grid-column: path / end;
  /* a wrapped comment line lines up with the text after its // */
  padding-left: calc((var(--depth, 0) + 1) * var(--tr-indent) + 3ch); text-indent: -3ch;
}
${BELOW} .docs-tree__code {
  display: inline-block; max-width: 100%; box-sizing: border-box;
  padding-left: 4ch; text-indent: -4ch;
  white-space: pre-wrap; overflow-wrap: break-word;
}
${BELOW} .docs-tree__row > .docs-tree__note::before {
  content: "//"; display: inline-block; width: 3ch; text-indent: 0;
  font-family: var(--tr-mono); color: var(--tr-muted);
}
/* a prop never splits across lines (topLevelWords in OutlineRows.tsx) */
${BELOW} .docs-tree__word { white-space: pre; }
`;
