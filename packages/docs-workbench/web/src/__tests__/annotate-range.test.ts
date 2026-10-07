import { describe, expect, it } from "bun:test";

import {
  blockTextRangeFromDomRange,
  textOffsetInRoot,
} from "../_components/DocPage/annotate-range";

/**
 * Locks the text-range offset convention: offsets index the block element's
 * `textContent` (UTF-16 code units, whitespace as rendered, end exclusive)
 * and `quote === textContent.slice(start, end)`.
 */

function blockEl(html: string, blockId = "b1"): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = `<div data-block-id="${blockId}">${html}</div>`;
  document.body.appendChild(host);
  return host.querySelector<HTMLElement>("[data-block-id]")!;
}

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  return nodes;
}

describe("annotate-range", () => {
  it("maps a range within a single text node", () => {
    const block = blockEl("Hello world");
    const [text] = textNodes(block);
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 11);

    expect(blockTextRangeFromDomRange(range)).toEqual({
      blockId: "b1",
      start: 6,
      end: 11,
      quote: "world",
    });
  });

  it("maps a range spanning styled inline spans against the block's textContent", () => {
    const block = blockEl("Hello <strong>brave</strong> world");
    const nodes = textNodes(block); // "Hello ", "brave", " world"
    const range = document.createRange();
    range.setStart(nodes[0], 3); // "lo "
    range.setEnd(nodes[2], 3); // " wo"

    const mapped = blockTextRangeFromDomRange(range);
    expect(mapped).toEqual({ blockId: "b1", start: 3, end: 14, quote: "lo brave wo" });
    // The convention: quote is exactly the slice of the rendered textContent.
    expect((block.textContent ?? "").slice(mapped!.start, mapped!.end)).toBe(mapped!.quote);
  });

  it("clamps a range whose end escapes the block to the block's end", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<div data-block-id="b1">First block</div><div data-block-id="b2">Second</div>';
    document.body.appendChild(host);
    const first = host.querySelector<HTMLElement>('[data-block-id="b1"]')!;
    const second = host.querySelector<HTMLElement>('[data-block-id="b2"]')!;
    const range = document.createRange();
    range.setStart(first.firstChild!, 6);
    range.setEnd(second.firstChild!, 3);

    expect(blockTextRangeFromDomRange(range)).toEqual({
      blockId: "b1",
      start: 6,
      end: 11,
      quote: "block",
    });
  });

  it("returns null for a range outside any block or with an empty clamped span", () => {
    const host = document.createElement("div");
    host.innerHTML = "<p>no block here</p>";
    document.body.appendChild(host);
    const outside = document.createRange();
    outside.setStart(host.querySelector("p")!.firstChild!, 0);
    outside.setEnd(host.querySelector("p")!.firstChild!, 4);
    expect(blockTextRangeFromDomRange(outside)).toBeNull();

    const block = blockEl("abc");
    const [text] = textNodes(block);
    const empty = document.createRange();
    empty.setStart(text, 2);
    empty.setEnd(text, 2);
    expect(blockTextRangeFromDomRange(empty)).toBeNull();
  });

  it("resolves element-container boundaries to text offsets", () => {
    const block = blockEl("Hello <strong>brave</strong> world");
    // Boundary before child index 1 (<strong>) === offset 6; before index 2
    // (the " world" text node) === offset 11.
    expect(textOffsetInRoot(block, block, 1)).toBe(6);
    expect(textOffsetInRoot(block, block, 2)).toBe(11);
    expect(textOffsetInRoot(block, block, 3)).toBe(17);
  });
});
