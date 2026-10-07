/** Static author label — the standalone app has no identity concept. */
export const ANNOTATION_AUTHOR = "you";

/**
 * Annotate-mode cursor affordance: blocks read as pick targets. Text stays
 * natively selectable — the Cmd/Ctrl+drag range flow reads the DOM selection
 * on release.
 */
export const ANNOTATE_CURSOR_CSS = `
  [data-annotation-targeting="true"] [data-block-id] {
    cursor: crosshair;
    -webkit-user-select: text;
    user-select: text;
  }
`;

