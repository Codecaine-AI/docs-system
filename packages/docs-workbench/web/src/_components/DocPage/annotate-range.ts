/**
 * Maps a DOM Range from a Cmd/Ctrl+drag text selection onto a docs
 * `text-range` annotation target: the containing block is the block wrapper
 * (`[data-block-id]`) around the range's START container, and the offsets
 * index the block element's `textContent` — UTF-16 code units, whitespace
 * exactly as rendered, `end` exclusive — matching the convention documented
 * on docs-model's text-range target. A range that extends past the block is
 * CLAMPED to the block's end; `quote === blockEl.textContent.slice(start,
 * end)` always holds for the returned value.
 */

export type BlockTextRange = {
  blockId: string;
  start: number;
  end: number;
  quote: string;
};

/**
 * Text offset of a range boundary `(container, offset)` inside `root`,
 * counted over `root.textContent` in document order. Boundaries outside
 * `root` clamp to the end of `root` (used for drags that run past the
 * block). Implemented as a manual text-node walk — deterministic under
 * happy-dom, which has patchy `Range#toString` layout support.
 */
export function textOffsetInRoot(root: HTMLElement, container: Node, offset: number): number {
  const rootText = root.textContent ?? "";
  if (container !== root && !root.contains(container)) return rootText.length;

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = (node.textContent ?? "").length;

    if (container.nodeType === Node.TEXT_NODE) {
      if (node === container) return total + Math.min(offset, length);
      total += length;
      continue;
    }

    // Element boundary: the boundary sits before childNodes[offset]. Count
    // every text node that precedes the container, or lives inside one of
    // its first `offset` children.
    const position = container.compareDocumentPosition(node);
    if (position & Node.DOCUMENT_POSITION_CONTAINED_BY) {
      let child: Node = node;
      while (child.parentNode && child.parentNode !== container) child = child.parentNode;
      const childIndex = Array.prototype.indexOf.call(container.childNodes, child);
      if (childIndex < 0 || childIndex >= offset) return total;
      total += length;
      continue;
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      total += length;
      continue;
    }
    // The walk has passed the container entirely.
    return total;
  }
  return total;
}

/**
 * The block element containing `node`, or null. Exported for the range
 * handler (start container → owning block).
 */
export function closestBlockElement(node: Node): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : node.parentElement;
  return element?.closest<HTMLElement>("[data-block-id]") ?? null;
}

/**
 * Builds the text-range payload for a DOM Range against its containing
 * block. Returns null when the block cannot be determined or the clamped
 * range is empty.
 */
export function blockTextRangeFromDomRange(range: Range): BlockTextRange | null {
  const blockEl = closestBlockElement(range.startContainer);
  if (!blockEl) return null;
  const blockId = blockEl.getAttribute("data-block-id");
  if (!blockId) return null;

  const text = blockEl.textContent ?? "";
  const start = textOffsetInRoot(blockEl, range.startContainer, range.startOffset);
  // An end container outside the block clamps to the block's end.
  const end = blockEl.contains(range.endContainer)
    ? textOffsetInRoot(blockEl, range.endContainer, range.endOffset)
    : text.length;
  if (end <= start) return null;

  const quote = text.slice(start, end);
  if (quote.length === 0) return null;
  return { blockId, start, end, quote };
}
