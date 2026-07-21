import { afterEach, describe, expect, it } from "bun:test";
import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextSelection } from "@tiptap/pm/state";
import { ATOM_BLOCK_NODES, TEXT_BLOCK_NODES } from "../core/schema";
import { DocReference } from "../menus/reference-node";
import { DocBlockPaste } from "../input/block-paste";
import { DocDragSelect, rangeSelection } from "../views/drag-select";
import { dragSelectPluginKey } from "../views/drag-select-state";

/**
 * Editor→editor block copy/paste (R2-D16): a band selection over a run of
 * blocks (R2-D15's rangeSelection) is copied through prosemirror-view's REAL
 * clipboard machinery (`view.serializeForClipboard` → HTML string →
 * `view.pasteHTML` on a fresh editor instance — the same code path a paste
 * into another doc page takes) and every block must come back intact: block
 * COUNT (no merging), heading LEVEL, callout type/props/child, list ordered
 * flag.
 *
 * This exercises what clipboard-roundtrip.test.ts cannot: `generateJSON`
 * closes the parse (a full doc), while the real paste path uses
 * `parseSlice` + the `data-pm-slice` open-depth wrapper and then FITS the
 * slice into the target selection. The fit is where Ford's repro died —
 * every text block's `block*` child slot let `replaceSelection` nest the
 * pasted run inside the caret paragraph and merge the heading's text into
 * it (one block, layout gone). Guards: drag-select's `transformCopied`
 * (band copy = closed whole-block slice) + block-paste.ts's top-level
 * insertion.
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
      DocReference,
      DocDragSelect,
      DocBlockPaste,
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

/** The five-block source doc from the R2-D16 repro: heading, two paragraphs, an ordered list item, a callout with props and a child paragraph. */
const CALLOUT_PROPS = { tone: "warning", title: "Heads up" };
const SOURCE_BLOCKS: JSONContent[] = [
  {
    type: "docHeading",
    attrs: { blockId: "h1", blockProps: {}, level: 1 },
    content: [wrapper("Title")],
  },
  { type: "docParagraph", attrs: { blockId: "p1", blockProps: {} }, content: [wrapper("First paragraph")] },
  { type: "docParagraph", attrs: { blockId: "p2", blockProps: {} }, content: [wrapper("Second paragraph")] },
  {
    type: "docListItem",
    attrs: { blockId: "li1", blockProps: {}, ordered: true },
    content: [wrapper("Item one")],
  },
  {
    type: "docCallout",
    attrs: { blockId: "c1", blockProps: CALLOUT_PROPS },
    content: [
      wrapper("Callout body"),
      {
        type: "docParagraph",
        attrs: { blockId: "cc1", blockProps: {} },
        content: [wrapper("Callout child")],
      },
    ],
  },
];

const SOURCE_TYPES = ["docHeading", "docParagraph", "docParagraph", "docListItem", "docCallout"];

/** Band-selects the whole doc exactly like the rubber band does (range meta → backing rangeSelection) and serializes the copy slice exactly as Cmd+C would. */
function copyBand(source: Editor, from = 0, to = source.state.doc.content.size): string {
  source.view.dispatch(
    source.state.tr.setMeta(dragSelectPluginKey, { from, to, dragging: false }),
  );
  const { dom } = source.view.serializeForClipboard(source.state.selection.content());
  return dom.innerHTML;
}

function topTypes(editor: Editor): string[] {
  const types: string[] = [];
  editor.state.doc.forEach((node) => types.push(node.type.name));
  return types;
}

/** Fresh single-paragraph target doc with the caret placed at `pos` (default: inside the empty paragraph). */
function createTarget(text?: string, pos = 2): Editor {
  const target = createEditor([
    { type: "docParagraph", attrs: { blockId: "t1", blockProps: {} }, content: [wrapper(text)] },
  ]);
  target.view.dispatch(
    target.state.tr.setSelection(TextSelection.create(target.state.doc, pos)),
  );
  return target;
}

describe("editor→editor block paste (R2-D16)", () => {
  it("band copy serializes closed whole blocks: data-pm-slice 0 0, h1/p markup, no raw level/ordered attr leaks", () => {
    const html = copyBand(createEditor(SOURCE_BLOCKS));
    expect(html).toContain('data-pm-slice="0 0 []"');
    // Round-trippable, externally sane markup: heading as a real h1,
    // paragraphs as p, list items as li with the marker-contract attr.
    expect(html).toMatch(/<h1[^>]*>/);
    expect(html).toMatch(/<p[^>]*>/);
    expect(html).toContain('data-doc-ordered="true"');
    // The heading level and ordered flag are encoded by tag name and
    // data-doc-ordered — the raw attrs previously leaked by TipTap's default
    // attribute rendering parsed back as STRINGS ("1", "true").
    expect(html).not.toContain('level="');
    expect(html).not.toContain('ordered="true" ordered');
    expect(html).not.toMatch(/<h1[^>]* ordered=/);
    expect(html).not.toMatch(/\slevel="1"/);
  });

  it("pastes into another doc's empty paragraph without merging: count, types, order — and the empty block is replaced", () => {
    const html = copyBand(createEditor(SOURCE_BLOCKS));
    const target = createTarget();
    expect(target.view.pasteHTML(html)).toBe(true);
    expect(topTypes(target)).toEqual(SOURCE_TYPES);
  });

  it("preserves heading level, list ordered flag, callout props + child through the paste", () => {
    const html = copyBand(createEditor(SOURCE_BLOCKS));
    const target = createTarget();
    expect(target.view.pasteHTML(html)).toBe(true);

    const doc = target.state.doc;
    const heading = doc.child(0);
    expect(heading.type.name).toBe("docHeading");
    expect(heading.attrs.level).toBe(1);
    expect(heading.textContent).toBe("Title");

    expect(doc.child(1).textContent).toBe("First paragraph");
    expect(doc.child(2).textContent).toBe("Second paragraph");

    const listItem = doc.child(3);
    expect(listItem.type.name).toBe("docListItem");
    expect(listItem.attrs.ordered).toBe(true);
    expect(listItem.textContent).toBe("Item one");

    const callout = doc.child(4);
    expect(callout.type.name).toBe("docCallout");
    expect(callout.attrs.blockProps).toEqual(CALLOUT_PROPS);
    expect(callout.child(0).type.name).toBe("docBlockText");
    expect(callout.child(0).textContent).toBe("Callout body");
    const child = callout.child(1);
    expect(child.type.name).toBe("docParagraph");
    expect(child.textContent).toBe("Callout child");
  });

  it("a single banded block keeps its type: an H1 pastes back as an H1, not text", () => {
    const source = createEditor(SOURCE_BLOCKS);
    const heading = source.state.doc.child(0);
    const html = copyBand(source, 0, heading.nodeSize);
    expect(html).toContain('data-pm-slice="0 0 []"');

    const target = createTarget();
    expect(target.view.pasteHTML(html)).toBe(true);
    expect(topTypes(target)).toEqual(["docHeading"]);
    expect(target.state.doc.child(0).attrs.level).toBe(1);
    expect(target.state.doc.child(0).textContent).toBe("Title");
  });

  it("pasting mid-paragraph splits the paragraph around the run instead of nesting into it", () => {
    const html = copyBand(createEditor(SOURCE_BLOCKS));
    // Caret between "before" and "|after": 1 (para) + 1 (wrapper) + 6.
    const target = createTarget("before|after", 8);
    expect(target.view.pasteHTML(html)).toBe(true);

    expect(topTypes(target)).toEqual(["docParagraph", ...SOURCE_TYPES, "docParagraph"]);
    expect(target.state.doc.child(0).textContent).toBe("before");
    expect(target.state.doc.child(6).textContent).toBe("|after");
    // Nothing nested into the split halves' `block*` slots.
    expect(target.state.doc.child(0).childCount).toBe(1);
    expect(target.state.doc.child(6).childCount).toBe(1);
  });

  it("pasting at a block's start/end lands the run before/after it without splitting", () => {
    const html = copyBand(createEditor([SOURCE_BLOCKS[1]]));

    const atStart = createTarget("keep", 2);
    expect(atStart.view.pasteHTML(html)).toBe(true);
    expect(topTypes(atStart)).toEqual(["docParagraph", "docParagraph"]);
    expect(atStart.state.doc.child(0).textContent).toBe("First paragraph");
    expect(atStart.state.doc.child(1).textContent).toBe("keep");

    const atEnd = createTarget("keep", 6);
    expect(atEnd.view.pasteHTML(html)).toBe(true);
    expect(topTypes(atEnd)).toEqual(["docParagraph", "docParagraph"]);
    expect(atEnd.state.doc.child(0).textContent).toBe("keep");
    expect(atEnd.state.doc.child(1).textContent).toBe("First paragraph");
  });

  it("external multi-block HTML (no data-pm-slice) pastes as separate blocks with heading levels from tag names", () => {
    const target = createTarget();
    expect(
      target.view.pasteHTML("<h2>Outside title</h2><p>Outside para one</p><p>Outside para two</p>"),
    ).toBe(true);
    expect(topTypes(target)).toEqual(["docHeading", "docParagraph", "docParagraph"]);
    expect(target.state.doc.child(0).attrs.level).toBe(2);
    expect(target.state.doc.child(0).textContent).toBe("Outside title");
  });

  it("external single-paragraph and plain-inline pastes keep PM's default merge into the caret block", () => {
    const single = createTarget("before|after", 8);
    expect(single.view.pasteHTML("<p>inserted</p>")).toBe(true);
    expect(topTypes(single)).toEqual(["docParagraph"]);
    expect(single.state.doc.child(0).textContent).toBe("beforeinserted|after");

    const inline = createTarget("before|after", 8);
    expect(inline.view.pasteHTML("<span>inserted</span>")).toBe(true);
    expect(topTypes(inline)).toEqual(["docParagraph"]);
    expect(inline.state.doc.child(0).textContent).toBe("beforeinserted|after");
  });

  it("external <ol>/<ul> list items carry the ordered flag from the list ancestor", () => {
    const target = createTarget();
    expect(
      target.view.pasteHTML("<ol><li>one</li><li>two</li></ol>"),
    ).toBe(true);
    const types = topTypes(target);
    expect(types).toEqual(["docListItem", "docListItem"]);
    expect(target.state.doc.child(0).attrs.ordered).toBe(true);
    expect(target.state.doc.child(1).attrs.ordered).toBe(true);

    const bullets = createTarget();
    expect(bullets.view.pasteHTML("<ul><li>one</li><li>two</li></ul>")).toBe(true);
    expect(bullets.state.doc.child(0).attrs.ordered).toBe(null);
  });
});
