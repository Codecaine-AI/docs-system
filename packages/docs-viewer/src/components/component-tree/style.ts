/**
 * Component-tree rules on top of the shared trees row system (tree-rows.tsx).
 * Every selector starts at `.docs-tree[data-tree-kind="component-tree"]`, so
 * call-stack, file-tree, file-explorer and state-shape keep their own look.
 *
 * When the rows do not fit beside their comments (data-notes="below"):
 * - each source chip stays on its row's code line, in one column, whether the
 *   row has a comment or not;
 * - the code stops at the chip column and wraps under itself with a hanging
 *   indent, so a long JSX row never runs into its chip or scrolls sideways;
 * - the comment takes the second line at the child indent.
 */
const TREE = '.docs-tree[data-tree-kind="component-tree"]';
const BELOW = `${TREE} .docs-tree__rows[data-notes="below"]`;

export const COMPONENT_TREE_CSS = `
/* .docs-tree__row > raises these above the shared notes-below rules */
${BELOW} .docs-tree__row > .docs-tree__path { grid-column: path / src; grid-row: 1; }
${BELOW} .docs-tree__row > .docs-tree__src { grid-row: 1; align-self: start; }
${BELOW} .docs-tree__row > .docs-tree__note { grid-column: path / end; }
${BELOW} .docs-tree__code {
  display: inline-block; max-width: 100%; box-sizing: border-box;
  padding-left: 2ch; text-indent: -2ch;
  white-space: pre-wrap; overflow-wrap: break-word;
}
/* a prop never splits across lines (topLevelWords in OutlineRows.tsx) */
${BELOW} .docs-tree__word { white-space: pre; }
`;
