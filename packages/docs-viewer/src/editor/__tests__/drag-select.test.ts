import { afterEach, describe, expect, it } from "bun:test";
import { Editor, type AnyExtension, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { ATOM_BLOCK_NODES, TEXT_BLOCK_NODES } from "../core/schema";
import {
  DocDragSelect,
  dropBlockSliceTr,
  moveRangeTr,
  rangeSelection,
  shouldStartBand,
  topLevelDropPos,
} from "../views/drag-select";
import { dragSelectPluginKey, type DragSelectRange } from "../views/drag-select-state";

/**
 * Notion-style drag select (drag-select.ts): plugin-state lifecycle
 * (set → decorations, edits/Escape clear, Backspace deletes the run) and the
 * range-move transaction behind multi-block grip drops. The rubber-band's
 * geometry (blockRangeForRect) is pointer/layout-driven and stays on Ford's
 * visual pass — happy-dom has no layout, every rect is 0x0.
 */

let editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
});

function createEditor(content: JSONContent[], extra: AnyExtension[] = []): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        paragraph: false,
        trailingNode: false,
        undoRedo: false,
      }),
      ...TEXT_BLOCK_NODES,
      ...ATOM_BLOCK_NODES,
      DocDragSelect,
      ...extra,
    ],
    content: { type: "doc", content },
    injectCSS: false,
  });
  editors.push(editor);
  return editor;
}

function wrapper(text?: string): JSONContent {
  return { type: "docBlockText", content: text ? [{ type: "text", text }] : [] };
}

function paragraph(text: string, blockId: string): JSONContent {
  return { type: "docParagraph", attrs: { blockId }, content: [wrapper(text)] };
}

/** Top-level (pos, nodeSize) pairs in document order. */
function blocks(editor: Editor): Array<{ pos: number; size: number }> {
  const out: Array<{ pos: number; size: number }> = [];
  editor.state.doc.forEach((node, offset) => out.push({ pos: offset, size: node.nodeSize }));
  return out;
}

/** Range covering top-level blocks [startIndex, endIndex] inclusive. */
function rangeOver(editor: Editor, startIndex: number, endIndex: number): DragSelectRange {
  const all = blocks(editor);
  return {
    from: all[startIndex].pos,
    to: all[endIndex].pos + all[endIndex].size,
    dragging: false,
  };
}

function setRange(editor: Editor, range: DragSelectRange | null) {
  editor.view.dispatch(editor.state.tr.setMeta(dragSelectPluginKey, range));
}

function keydown(editor: Editor, key: string): boolean {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  return editor.view.someProp("handleKeyDown", (f) => f(editor.view, event)) ?? false;
}

describe("drag-select plugin state", () => {
  it("decorates every block inside the range and none outside", () => {
    const editor = createEditor([
      paragraph("one", "b1"),
      paragraph("two", "b2"),
      paragraph("three", "b3"),
    ]);
    setRange(editor, rangeOver(editor, 1, 2));

    const children = Array.from(editor.view.dom.children) as HTMLElement[];
    expect(children[0].classList.contains("docs-block-multi-selected")).toBe(false);
    expect(children[1].classList.contains("docs-block-multi-selected")).toBe(true);
    expect(children[2].classList.contains("docs-block-multi-selected")).toBe(true);
  });

  it("any document edit dissolves the selection", () => {
    const editor = createEditor([paragraph("one", "b1"), paragraph("two", "b2")]);
    setRange(editor, rangeOver(editor, 0, 1));
    expect(dragSelectPluginKey.getState(editor.state)).not.toBeNull();

    editor.commands.insertContentAt(2, "x");
    expect(dragSelectPluginKey.getState(editor.state)).toBeNull();
  });

  it("Escape clears the selection without touching the doc", () => {
    const editor = createEditor([paragraph("one", "b1"), paragraph("two", "b2")]);
    setRange(editor, rangeOver(editor, 0, 1));
    const before = editor.state.doc.toString();

    expect(keydown(editor, "Escape")).toBe(true);
    expect(dragSelectPluginKey.getState(editor.state)).toBeNull();
    expect(editor.state.doc.toString()).toBe(before);
    // Without a range the shortcut falls through.
    expect(keydown(editor, "Escape")).toBe(false);
  });

  it("Backspace deletes exactly the selected run", () => {
    const editor = createEditor([
      paragraph("keep-head", "b1"),
      paragraph("gone-1", "b2"),
      paragraph("gone-2", "b3"),
      paragraph("keep-tail", "b4"),
    ]);
    setRange(editor, rangeOver(editor, 1, 2));

    expect(keydown(editor, "Backspace")).toBe(true);
    const texts = blocks(editor).map(({ pos }) => editor.state.doc.nodeAt(pos)?.textContent);
    expect(texts).toEqual(["keep-head", "keep-tail"]);
    expect(dragSelectPluginKey.getState(editor.state)).toBeNull();
  });
});

describe("band range backs a real selection (R2-D15)", () => {
  it("setting a range lands a real selection spanning the banded blocks", () => {
    const editor = createEditor([
      paragraph("one", "b1"),
      paragraph("two", "b2"),
      paragraph("three", "b3"),
    ]);
    const range = rangeOver(editor, 1, 2);
    setRange(editor, range);

    const selection = editor.state.selection;
    expect(selection.empty).toBe(false);
    expect(selection.from).toBeGreaterThanOrEqual(range.from);
    expect(selection.to).toBeLessThanOrEqual(range.to);
    // Anchor inside the FIRST banded block, head inside the LAST — the
    // selection's top-level footprint is exactly the banded run.
    expect(selection.$from.before(1)).toBe(range.from);
    expect(selection.$to.after(1)).toBe(range.to);
  });

  it("the copied slice carries the banded blocks' content (Cmd+C regression)", () => {
    const editor = createEditor([
      paragraph("one", "b1"),
      paragraph("two", "b2"),
      paragraph("three", "b3"),
    ]);
    setRange(editor, rangeOver(editor, 1, 2));

    // Selection.content() is the slice PM's copy serializes to the clipboard.
    const slice = editor.state.selection.content();
    expect(slice.size).toBeGreaterThan(0);
    const text = slice.content.textBetween(0, slice.content.size, "\n");
    expect(text).toContain("two");
    expect(text).toContain("three");
    expect(text).not.toContain("one");
  });

  it("an atom-only range falls back to a NodeSelection on the block", () => {
    const editor = createEditor([
      { type: "docCanvas", attrs: { blockId: "b1", blockProps: { canvasId: "board" } } },
      paragraph("after", "b2"),
    ]);
    setRange(editor, rangeOver(editor, 0, 0));

    const selection = editor.state.selection;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect((selection as NodeSelection).node.type.name).toBe("docCanvas");
    expect(selection.content().size).toBeGreaterThan(0);
  });

  it("Escape collapses the real selection to a caret at the range start", () => {
    const editor = createEditor([
      paragraph("one", "b1"),
      paragraph("two", "b2"),
      paragraph("three", "b3"),
    ]);
    const range = rangeOver(editor, 1, 2);
    setRange(editor, range);
    expect(editor.state.selection.empty).toBe(false);

    expect(keydown(editor, "Escape")).toBe(true);
    expect(dragSelectPluginKey.getState(editor.state)).toBeNull();
    expect(editor.state.selection.empty).toBe(true);
    // Caret sits inside the block the range started on.
    expect(editor.state.selection.$from.before(1)).toBe(range.from);
  });

  it("a multi-block grip drop lands the real selection on the moved run", () => {
    const editor = createEditor([
      paragraph("A", "b1"),
      paragraph("B", "b2"),
      paragraph("C", "b3"),
      paragraph("D", "b4"),
    ]);
    setRange(editor, rangeOver(editor, 1, 2));
    const tr = moveRangeTr(editor.state, rangeOver(editor, 1, 2), editor.state.doc.content.size);
    editor.view.dispatch(tr!);

    const after = dragSelectPluginKey.getState(editor.state)!;
    const selection = editor.state.selection;
    expect(selection.empty).toBe(false);
    expect(selection.$from.before(1)).toBe(after.from);
    expect(selection.$to.after(1)).toBe(after.to);
    const text = selection.content().content.textBetween(0, selection.content().content.size, "\n");
    expect(text).toContain("B");
    expect(text).toContain("C");
  });

  it("rangeSelection prefers TextSelection.between across text blocks", () => {
    const editor = createEditor([paragraph("head", "b1"), paragraph("tail", "b2")]);
    const range = rangeOver(editor, 0, 1);
    const selection = rangeSelection(editor.state.doc, range);
    expect(selection).toBeInstanceOf(TextSelection);
    expect(selection.$from.before(1)).toBe(range.from);
    expect(selection.$to.after(1)).toBe(range.to);
  });
});

describe("shouldStartBand", () => {
  it("bands on editor background, not on text or node views", () => {
    const editor = createEditor([
      paragraph("words", "b1"),
      { type: "docCanvas", attrs: { blockId: "b2", blockProps: { canvasId: "board" } } },
    ]);
    // The editor root itself (gaps/padding) is band territory…
    expect(shouldStartBand(editor.view, editor.view.dom)).toBe(true);
    // …the block element beside its text is too…
    const block = editor.view.dom.children[0] as HTMLElement;
    expect(shouldStartBand(editor.view, block)).toBe(true);
    // …but the text span itself is native text selection.
    const span = block.querySelector('span[data-doc-node="docBlockText"]') as HTMLElement;
    expect(shouldStartBand(editor.view, span)).toBe(false);
  });

  it("never bands on editable page furniture outside the editor (rename title)", () => {
    const editor = createEditor([paragraph("words", "b1")]);
    const title = document.createElement("h1");
    title.className = "docs-page-title";
    title.setAttribute("contenteditable", "true");
    title.textContent = "Interaction Surfaces";
    document.body.appendChild(title);
    try {
      expect(shouldStartBand(editor.view, title)).toBe(false);
      // Plain non-editable furniture outside the editor still bands
      // (page margins live outside view.dom too).
      const margin = document.createElement("div");
      document.body.appendChild(margin);
      try {
        expect(shouldStartBand(editor.view, margin)).toBe(true);
      } finally {
        margin.remove();
      }
    } finally {
      title.remove();
    }
  });

  it("never bands on controls or the drag grip", () => {
    const editor = createEditor([paragraph("words", "b1")]);
    const grip = document.createElement("div");
    grip.setAttribute("data-docs-drag-handle", "true");
    document.body.appendChild(grip);
    try {
      expect(shouldStartBand(editor.view, grip)).toBe(false);
    } finally {
      grip.remove();
    }
  });
});

describe("moveRangeTr", () => {
  it("moves the range's blocks to the drop position and keeps them selected", () => {
    const editor = createEditor([
      paragraph("A", "b1"),
      paragraph("B", "b2"),
      paragraph("C", "b3"),
      paragraph("D", "b4"),
    ]);
    const range = rangeOver(editor, 1, 2);

    const tr = moveRangeTr(editor.state, range, editor.state.doc.content.size);
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);

    const texts = blocks(editor).map(({ pos }) => editor.state.doc.nodeAt(pos)?.textContent);
    expect(texts).toEqual(["A", "D", "B", "C"]);
    // The moved run stays multi-selected (Notion keeps the selection).
    const after = dragSelectPluginKey.getState(editor.state);
    expect(after).not.toBeNull();
    expect(after!.dragging).toBe(false);
    const selected = Array.from(editor.view.dom.children).filter((child) =>
      (child as HTMLElement).classList.contains("docs-block-multi-selected"),
    );
    expect(selected.map((el) => el.textContent)).toEqual(["B", "C"]);
  });

  it("moves a range upward across earlier blocks", () => {
    const editor = createEditor([
      paragraph("A", "b1"),
      paragraph("B", "b2"),
      paragraph("C", "b3"),
    ]);
    const range = rangeOver(editor, 2, 2);

    const tr = moveRangeTr(editor.state, range, 0);
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);

    const texts = blocks(editor).map(({ pos }) => editor.state.doc.nodeAt(pos)?.textContent);
    expect(texts).toEqual(["C", "A", "B"]);
  });

  it("returns null for a drop inside the dragged range", () => {
    const editor = createEditor([
      paragraph("A", "b1"),
      paragraph("B", "b2"),
      paragraph("C", "b3"),
    ]);
    const range = rangeOver(editor, 0, 1);
    expect(moveRangeTr(editor.state, range, range.from + 1)).toBeNull();
  });

  it("a drop position inside another block's text lands top-level, never nested", () => {
    const editor = createEditor([
      paragraph("A", "b1"),
      paragraph("BB", "b2"),
      paragraph("C", "b3"),
    ]);
    const range = rangeOver(editor, 2, 2);
    const all = blocks(editor);
    // Deep inside block A's text — the "Solution staircase" shape.
    const tr = moveRangeTr(editor.state, range, all[0].pos + 2);
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);

    const after = blocks(editor).map(({ pos }) => {
      const node = editor.state.doc.nodeAt(pos)!;
      // childCount 1 = just the docBlockText wrapper; >1 would mean a
      // nested block rode into the child slot.
      return { text: node.textContent, children: node.childCount };
    });
    expect(after.map((b) => b.text)).toEqual(["C", "A", "BB"]);
    expect(after.every((b) => b.children === 1)).toBe(true);
  });
});

describe("topLevelDropPos", () => {
  it("snaps an in-block position to the nearer top-level edge", () => {
    const editor = createEditor([paragraph("aaaaaaaaaa", "b1"), paragraph("z", "b2")]);
    const all = blocks(editor);
    const start = all[0].pos;
    const end = all[0].pos + all[0].size;
    expect(topLevelDropPos(editor.state.doc, start + 2)).toBe(start);
    expect(topLevelDropPos(editor.state.doc, end - 2)).toBe(end);
    // Already top-level positions pass through unchanged.
    expect(topLevelDropPos(editor.state.doc, end)).toBe(end);
  });
});

describe("dropBlockSliceTr", () => {
  it("reorders a grip-dragged block top-level even when dropped onto a heading's text", () => {
    const editor = createEditor([
      {
        type: "docHeading",
        attrs: { blockId: "h1", level: 2 },
        content: [wrapper("The Solution")],
      },
      paragraph("body", "b2"),
      paragraph("dragged", "b3"),
    ]);
    const all = blocks(editor);
    // The grip's dragstart: NodeSelection on the dragged block, closed slice.
    const selection = NodeSelection.create(editor.state.doc, all[2].pos);
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    const slice = selection.content();

    // Drop deep inside the heading's text — must NOT nest under it.
    const tr = dropBlockSliceTr(editor.state, slice, all[0].pos + 3, true);
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);

    const after = blocks(editor).map(({ pos }) => {
      const node = editor.state.doc.nodeAt(pos)!;
      return { text: node.textContent, children: node.childCount };
    });
    expect(after.map((b) => b.text)).toEqual(["dragged", "The Solution", "body"]);
    expect(after.every((b) => b.children === 1)).toBe(true);
    // The dropped block stays node-selected (highlight lands with the drop).
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).node.textContent).toBe("dragged");
  });

  it("is a no-op when dropping a block onto itself", () => {
    const editor = createEditor([paragraph("A", "b1"), paragraph("B", "b2")]);
    const all = blocks(editor);
    const selection = NodeSelection.create(editor.state.doc, all[1].pos);
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    expect(dropBlockSliceTr(editor.state, selection.content(), all[1].pos + 1, true)).toBeNull();
  });
});
