"use client";

/**
 * Caret plumbing for the outline's step-line islands. Each island is a plain
 * contenteditable span holding ONE text node, so every offset here is a plain
 * character offset into that text — the same unit the pure planners speak.
 * All three functions are best-effort: a headless DOM without a real Selection
 * implementation degrades to "caret at the end", never throws.
 */

/** Character offset of the collapsed caret inside `element`, or end-of-text when it can't be read. */
export function readCaretOffset(element: HTMLElement): number {
  const fallback = element.textContent?.length ?? 0;
  const selection = element.ownerDocument.defaultView?.getSelection?.();
  if (!selection || selection.rangeCount === 0) return fallback;
  try {
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer)) return fallback;
    const probe = element.ownerDocument.createRange();
    probe.selectNodeContents(element);
    probe.setEnd(range.startContainer, range.startOffset);
    return probe.toString().length;
  } catch {
    return fallback;
  }
}

/** True when the user has a real (non-collapsed) selection inside `element` — Backspace then deletes it, not the step. */
export function hasRangeSelection(element: HTMLElement): boolean {
  const selection = element.ownerDocument.defaultView?.getSelection?.();
  if (!selection || selection.rangeCount === 0) return false;
  try {
    const range = selection.getRangeAt(0);
    return !range.collapsed && element.contains(range.startContainer);
  } catch {
    return false;
  }
}

/** Drops the caret at `offset` (or the end) inside `element`. */
export function setCaretOffset(element: HTMLElement, offset: number | "end"): void {
  const view = element.ownerDocument.defaultView;
  const selection = view?.getSelection?.();
  if (!selection) return;
  try {
    const range = element.ownerDocument.createRange();
    const textNode = element.firstChild;
    if (textNode && textNode.nodeType === 3) {
      const length = textNode.textContent?.length ?? 0;
      const at = offset === "end" ? length : Math.max(0, Math.min(offset, length));
      range.setStart(textNode, at);
    } else {
      range.selectNodeContents(element);
    }
    range.collapse(offset === "end" && !(element.firstChild?.nodeType === 3) ? false : true);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Caret placement is best-effort; focus alone is enough.
  }
}

/**
 * Character offset inside `element` for a pointer position — how a click on a
 * CHIPPED (not yet focused) line finds the character the user aimed at. The
 * offset is in RENDERED text, which the caller maps back onto the raw text
 * with `plainOffsetToRawOffset`.
 */
export function offsetFromPoint(element: HTMLElement, x: number, y: number): number | null {
  const doc = element.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  try {
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position && element.contains(position.offsetNode)) {
      return measure(element, position.offsetNode, position.offset);
    }
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range && element.contains(range.startContainer)) {
      return measure(element, range.startContainer, range.startOffset);
    }
  } catch {
    // Fall through to "no opinion" — the caller lands the caret at the end.
  }
  return null;
}

function measure(element: HTMLElement, container: Node, offset: number): number | null {
  try {
    const probe = element.ownerDocument.createRange();
    probe.selectNodeContents(element);
    probe.setEnd(container, offset);
    return probe.toString().length;
  } catch {
    return null;
  }
}
