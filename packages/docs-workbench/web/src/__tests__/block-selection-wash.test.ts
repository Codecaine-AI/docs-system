import { describe, expect, it } from "bun:test";

/**
 * The block-selection highlight is a soft blue FILL, which is right for a block
 * you grabbed by its grip and wrong for a block you clicked into to type. Atom
 * node views that edit IN PLACE hit the second case: ProseMirror lands a
 * NodeSelection on the atom the moment the caret goes in, so the fill sits over
 * the whole block for as long as the edit lasts. The process outline was the
 * block that surfaced it (a whole outline turning light blue on every click).
 *
 * The stylesheet is the load-bearing half of that fix — the node view only
 * raises the flag — so it is pinned here rather than in a DOM test that would
 * never load a stylesheet at all.
 */
const CSS = await Bun.file(new URL("../index.css", import.meta.url)).text();

describe("block selection wash", () => {
  it("fills selected blocks with the highlight colour", () => {
    expect(CSS).toContain(".docs-editor-prosemirror .ProseMirror-selectednode,");
    expect(CSS).toMatch(
      /\.docs-editor-prosemirror \.docs-block-multi-selected \{[^}]*background-color: var\(--docs-highlight-color/,
    );
  });

  it("suppresses the fill on a process outline that is being edited in place", () => {
    const rule = CSS.match(
      /\.ProseMirror-selectednode\[data-process-outline-editing="true"\],([^{]*)\{([^}]*)\}/,
    );
    expect(rule).toBeTruthy();
    expect(rule![2]).toContain("background-color: transparent");
    expect(rule![2]).toContain("box-shadow: none");
  });

  /**
   * The selector that actually fires. A React node view is TWO elements —
   * tiptap's `.react-renderer` wrapper, and the component's own
   * `NodeViewWrapper` inside it — and ProseMirror marks the outer one while
   * the node view flags the inner one. The original rule matched the flag's
   * own element only, so it never matched at all and the outline washed blue
   * on every click.
   */
  it("matches the element ProseMirror actually marks — the react-renderer wrapper", () => {
    expect(CSS).toContain(
      '.ProseMirror-selectednode:has(> [data-process-outline-editing="true"])',
    );
  });
});
