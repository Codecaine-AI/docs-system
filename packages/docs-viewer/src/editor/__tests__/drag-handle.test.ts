import { afterEach, describe, expect, it } from "bun:test";
import { Editor, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { ATOM_BLOCK_NODES, TEXT_BLOCK_NODES } from "../core/schema";
import { buildDragGhost, topLevelBlockPos } from "../views/drag-handle";

/**
 * Drag-grip position resolution (drag-handle.ts topLevelBlockPos) over the
 * REAL schema, text blocks and atom leaves alike. The bug under test: the
 * previous `posAtDOM(block, 0) - 1` arithmetic assumed border-1 nodes, so
 * every atom block (image, video, canvas, divider, …; border 0) resolved
 * one position early, nodeAt() missed, and the grip never appeared for
 * them — atoms couldn't be grip-selected or dragged at all (Ford, dogfood
 * round 2). The helper must return the block's own position for EVERY
 * top-level child of view.dom.
 */

let editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
});

function createEditor(content: JSONContent[]): Editor {
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

/** Every top-level node's (pos, type name), in document order. */
function topLevelNodes(editor: Editor): Array<{ pos: number; name: string }> {
  const nodes: Array<{ pos: number; name: string }> = [];
  editor.state.doc.forEach((node, offset) => nodes.push({ pos: offset, name: node.type.name }));
  return nodes;
}

describe("topLevelBlockPos", () => {
  it("resolves every top-level block — text and atom alike — to its own position", () => {
    const editor = createEditor([
      paragraph("before", "b1"),
      { type: "docCanvas", attrs: { blockId: "b2", blockProps: { canvasId: "board" } } },
      { type: "docImage", attrs: { blockId: "b3", blockProps: { src: "a.png" } } },
      { type: "docDivider", attrs: { blockId: "b4" } },
      paragraph("after", "b5"),
    ]);

    const expected = topLevelNodes(editor);
    const children = Array.from(editor.view.dom.children) as HTMLElement[];
    expect(children.length).toBe(expected.length);

    for (const [index, child] of children.entries()) {
      const pos = topLevelBlockPos(editor.view, child);
      expect(pos, `child ${index} (${expected[index].name})`).toBe(expected[index].pos);
      expect(editor.state.doc.nodeAt(pos!)?.type.name).toBe(expected[index].name);
    }
  });

  it("builds a body-level full-block drag ghost without the selection class", () => {
    const editor = createEditor([paragraph("hold my beer", "b1")]);
    const block = editor.view.dom.children[0] as HTMLElement;
    block.classList.add("ProseMirror-selectednode");

    const ghost = buildDragGhost(block);
    try {
      expect(ghost.parentElement).toBe(document.body);
      expect(ghost.className).toBe("docs-drag-image");
      // The ENTIRE block rides along (text included), minus the selection
      // class — the floating copy must not inherit the highlight/dim state.
      const clone = ghost.firstElementChild as HTMLElement;
      expect(clone.textContent).toBe("hold my beer");
      expect(clone.classList.contains("ProseMirror-selectednode")).toBe(false);
      // Parked offscreen, not interactive.
      expect(ghost.style.top).toBe("-10000px");
      expect(ghost.style.pointerEvents).toBe("none");
    } finally {
      ghost.remove();
    }
  });

  it("carries the typography context's classes onto the ghost so text sizing matches", () => {
    const context = document.createElement("div");
    context.className = "docs-markdown prose prose-sm text-sm leading-[1.7]";
    const block = document.createElement("div");
    block.textContent = "styled";
    context.appendChild(block);
    document.body.appendChild(context);

    const ghost = buildDragGhost(block);
    try {
      expect(ghost.classList.contains("docs-drag-image")).toBe(true);
      // The wrapper's cascade re-applies inside the ghost — without these
      // classes the floating clone rendered at body-default text size.
      expect(ghost.classList.contains("docs-markdown")).toBe(true);
      expect(ghost.classList.contains("prose-sm")).toBe(true);
    } finally {
      ghost.remove();
      context.remove();
    }
  });

  it("returns a position that supports NodeSelection on an atom block", () => {
    const editor = createEditor([
      paragraph("intro", "b1"),
      { type: "docVideo", attrs: { blockId: "b2", blockProps: { src: "clip.mp4" } } },
    ]);

    const videoElement = Array.from(editor.view.dom.children)[1] as HTMLElement;
    const pos = topLevelBlockPos(editor.view, videoElement);
    expect(pos).not.toBeNull();
    const selection = NodeSelection.create(editor.state.doc, pos!);
    expect(selection.node.type.name).toBe("docVideo");
  });
});
