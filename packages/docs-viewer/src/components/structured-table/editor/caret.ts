/**
 * Best-effort caret placement at the end of a contenteditable island's text.
 * Shared by TableGrid's programmatic cell focus (Tab/Enter navigation) and
 * EditableCell's external-value sync for a focused-but-clean cell (structural
 * moves, undo/redo) — after the DOM text is replaced under an active caret,
 * the caret must land somewhere sane, and end-of-text is it.
 */
export function placeCaretAtEnd(element: HTMLElement) {
  const view = element.ownerDocument.defaultView;
  const selection = view?.getSelection?.();
  if (!selection) return;
  try {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Caret placement is best-effort; focus alone is enough.
  }
}

/**
 * Select the full contents of a contenteditable island, replacing the current
 * selection. EditableCell's Mod-A interception: the island's stopPropagation
 * only keeps ProseMirror's keymap out — the browser's NATIVE select-all still
 * targets the outer editing host and would grab the entire document — so the
 * cell prevents the default and scopes the selection to itself instead.
 */
export function selectAllContents(element: HTMLElement) {
  const selection = element.ownerDocument.defaultView?.getSelection?.();
  if (!selection) return;
  try {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Selection scoping is best-effort.
  }
}
