import { afterEach, describe, expect, it } from "bun:test";
import { Editor, type AnyExtension, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { TEXT_BLOCK_NODES } from "../core/schema";
import { DocKeymap } from "../input/keymap";
import { DocPlaceholder } from "../decorations/placeholder";
import { SlashMenu, slashMenuPluginKey } from "../menus/SlashMenu";

/**
 * Notion-feel keyboard behavior (keymap.ts) + empty-block placeholder hints
 * (placeholder.ts), exercised against the REAL schema — the full
 * `"docBlockText block*"` content shape from schema.ts, unlike
 * input-rules.test.ts which flattens content for its own purposes. That
 * matters here: the whole bug under test is PM's default splitBlock
 * descending into the `block*` child slot, which only exists in the real
 * shape.
 *
 * Keys are driven through the view's `handleKeyDown` prop chain (the same
 * pipeline a real keydown takes through every keymap plugin, ours first,
 * TipTap's core Keymap after) — happy-dom has no native contenteditable
 * key simulation, matching the transaction-seam convention established in
 * DocEditor.test.tsx / input-rules.test.ts.
 */

let editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
});

function createEditor(content: JSONContent[], extraExtensions: AnyExtension[] = []): Editor {
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
      // Mirrors DocEditor's real order: menu extensions BEFORE the keymap
      // (TipTap hoists addKeyboardShortcuts keymaps ahead of plain plugins
      // regardless, which is exactly what the integration suite pins).
      ...extraExtensions,
      DocKeymap,
      DocPlaceholder,
    ],
    content: { type: "doc", content },
    injectCSS: false,
  });
  editors.push(editor);
  return editor;
}

// ---- content builders (real schema shape: wrapper always content[0]) ------

function wrapper(text?: string): JSONContent {
  return { type: "docBlockText", content: text ? [{ type: "text", text }] : [] };
}

function heading(text: string | undefined, attrs: Record<string, unknown>): JSONContent {
  return { type: "docHeading", attrs, content: [wrapper(text)] };
}

function paragraph(text: string | undefined, attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "docParagraph", attrs, content: [wrapper(text)] };
}

function quote(text: string | undefined, attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "docQuote", attrs, content: [wrapper(text)] };
}

function listItem(text: string | undefined, attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "docListItem", attrs, content: [wrapper(text)] };
}

function codeBlock(text: string, attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "docCodeBlock", attrs, content: [{ type: "text", text }] };
}

// ---- cursor + key helpers --------------------------------------------------

/** Absolute doc position of the start of top-level block `blockIndex`. */
function blockStart(editor: Editor, blockIndex: number): number {
  let pos = 0;
  for (let i = 0; i < blockIndex; i += 1) pos += editor.state.doc.child(i).nodeSize;
  return pos;
}

/** Puts the cursor inside top-level block `blockIndex`'s docBlockText wrapper at `offset` (0 = start of the block's own text). */
function setCursorInWrapper(editor: Editor, blockIndex: number, offset: number): void {
  // block start + 1 enters the block, + 1 enters the wrapper → wrapper
  // content starts at blockStart + 2.
  editor.commands.setTextSelection(blockStart(editor, blockIndex) + 2 + offset);
}

/** Puts the cursor inside a docCodeBlock (flat `text*` content, no wrapper) at `offset`. */
function setCursorInCode(editor: Editor, blockIndex: number, offset: number): void {
  editor.commands.setTextSelection(blockStart(editor, blockIndex) + 1 + offset);
}

// prosemirror-keymap binds "Mod-" to Meta on Mac platforms and Ctrl
// elsewhere (w3c-keyname platform sniff) — mirror the same sniff so the
// synthetic event matches whichever binding it produced in this test env.
const IS_MAC =
  typeof navigator !== "undefined" ? /Mac|iP(hone|[oa]d)/.test(navigator.platform) : false;

function pressKey(
  editor: Editor,
  key: string,
  modifiers: { mod?: boolean; shift?: boolean } = {},
): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey: modifiers.shift ?? false,
    metaKey: (modifiers.mod ?? false) && IS_MAC,
    ctrlKey: (modifiers.mod ?? false) && !IS_MAC,
  });
  let handled = false;
  editor.view.someProp("handleKeyDown", (handler) => {
    handled = handler(editor.view, event) === true;
    return handled;
  });
  return handled;
}

/** `getJSON()` narrowed back to plain JSONContent — TipTap 3's DocumentType return type splits children into a NodeType|TextType union that hides `.text`/`.content` behind narrowing these shape assertions don't need. */
function docJSON(editor: Editor): JSONContent {
  return editor.getJSON() as JSONContent;
}

/** The wrapper's concatenated text of a block JSON node. */
function wrapperText(block: JSONContent): string {
  const inline = block.content?.[0]?.content ?? [];
  return inline.map((node) => node.text ?? "").join("");
}

// ---------------------------------------------------------------------------

describe("DocKeymap Enter", () => {
  it("at the end of a heading inserts a SIBLING empty paragraph (never a nested child)", () => {
    const editor = createEditor([heading("Title", { blockId: "h1", level: 1 })]);
    setCursorInWrapper(editor, 0, "Title".length);

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    const [head, tail] = json.content!;
    expect(head.type).toBe("docHeading");
    expect(head.attrs).toMatchObject({ blockId: "h1", level: 1 });
    // The heading holds ONLY its wrapper — the new paragraph must NOT be in
    // its `block*` child slot (the "descends into a subpage" bug).
    expect(head.content).toHaveLength(1);
    expect(head.content![0].type).toBe("docBlockText");
    expect(tail.type).toBe("docParagraph");
    expect(tail.attrs).toMatchObject({ blockId: null });
    expect(wrapperText(tail)).toBe("");

    // Cursor landed inside the new paragraph's wrapper.
    const { $from } = editor.state.selection;
    expect($from.parent.type.name).toBe("docBlockText");
    expect($from.node(1).type.name).toBe("docParagraph");
  });

  it("mid-heading splits into two sibling headings; head keeps blockId, tail mints (null)", () => {
    const editor = createEditor([heading("Hello world", { blockId: "h1", level: 2 })]);
    setCursorInWrapper(editor, 0, "Hello".length);

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    const [head, tail] = json.content!;
    expect(head.type).toBe("docHeading");
    expect(head.attrs).toMatchObject({ blockId: "h1", level: 2 });
    expect(wrapperText(head)).toBe("Hello");
    expect(tail.type).toBe("docHeading");
    expect(tail.attrs).toMatchObject({ blockId: null, level: 2 });
    expect(wrapperText(tail)).toBe(" world");

    // Cursor sits at the start of the tail heading's text.
    const { $from } = editor.state.selection;
    expect($from.node(1).type.name).toBe("docHeading");
    expect($from.parentOffset).toBe(0);
  });

  it("at the end of a quote inserts a sibling paragraph", () => {
    const editor = createEditor([quote("Wise words", { blockId: "q1" })]);
    setCursorInWrapper(editor, 0, "Wise words".length);

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    expect(json.content![0].type).toBe("docQuote");
    expect(json.content![0].content).toHaveLength(1); // wrapper only, no nested child
    expect(json.content![1].type).toBe("docParagraph");
    expect(json.content![1].attrs).toMatchObject({ blockId: null });
  });

  it("at the start of a non-empty block inserts an empty paragraph ABOVE, original untouched", () => {
    const editor = createEditor([heading("Title", { blockId: "h1", level: 1 })]);
    setCursorInWrapper(editor, 0, 0);

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    expect(json.content![0].type).toBe("docParagraph");
    expect(json.content![0].attrs).toMatchObject({ blockId: null });
    expect(wrapperText(json.content![0])).toBe("");
    // The original heading keeps id, type, level, text.
    expect(json.content![1].type).toBe("docHeading");
    expect(json.content![1].attrs).toMatchObject({ blockId: "h1", level: 1 });
    expect(wrapperText(json.content![1])).toBe("Title");

    // Cursor stayed in the original heading.
    const { $from } = editor.state.selection;
    expect($from.node(1).type.name).toBe("docHeading");
  });

  it("in a non-empty list item splits into a sibling list item with the same ordered attr", () => {
    const editor = createEditor([listItem("First item", { blockId: "li1", ordered: true })]);
    setCursorInWrapper(editor, 0, "First item".length);

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    const [head, tail] = json.content!;
    expect(head.type).toBe("docListItem");
    expect(head.attrs).toMatchObject({ blockId: "li1", ordered: true });
    expect(wrapperText(head)).toBe("First item");
    expect(tail.type).toBe("docListItem");
    expect(tail.attrs).toMatchObject({ blockId: null, ordered: true, blockProps: {} });
    expect(wrapperText(tail)).toBe("");
  });

  it("mid-text in a list item moves the trailing text into the new item", () => {
    const editor = createEditor([listItem("one two", { blockId: "li1", ordered: false })]);
    setCursorInWrapper(editor, 0, "one".length);

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    expect(wrapperText(json.content![0])).toBe("one");
    expect(json.content![1].attrs).toMatchObject({ blockId: null, ordered: false });
    expect(wrapperText(json.content![1])).toBe(" two");
  });

  it("in an EMPTY list item converts it to a paragraph in place (exit-list)", () => {
    const editor = createEditor([listItem("Item", { blockId: "li1" }), listItem(undefined, { blockId: "li2", ordered: false })]);
    setCursorInWrapper(editor, 1, 0);

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    expect(json.content![0].type).toBe("docListItem");
    expect(json.content![1].type).toBe("docParagraph");
    expect(json.content![1].attrs).toMatchObject({ blockId: "li2" });
  });

  it("inside a code block inserts a newline in the SAME code block", () => {
    const editor = createEditor([codeBlock("const a = 1;", { blockId: "c1" })]);
    setCursorInCode(editor, 0, "const a = 1;".length);

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(1);
    expect(json.content![0].type).toBe("docCodeBlock");
    expect(json.content![0].content![0].text).toBe("const a = 1;\n");
  });

  it("Mod-Enter exits a code block into a paragraph sibling after it", () => {
    const editor = createEditor([codeBlock("const a = 1;", { blockId: "c1" })]);
    setCursorInCode(editor, 0, "const a = 1;".length);

    expect(pressKey(editor, "Enter", { mod: true })).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    expect(json.content![0].type).toBe("docCodeBlock");
    expect(json.content![0].content![0].text).toBe("const a = 1;"); // untouched
    expect(json.content![1].type).toBe("docParagraph");
    expect(json.content![1].attrs).toMatchObject({ blockId: null });

    const { $from } = editor.state.selection;
    expect($from.node(1).type.name).toBe("docParagraph");
  });

  it("returns false (defaults run) for a node selection", () => {
    const editor = createEditor([paragraph("Hello", { blockId: "p1" })]);
    // Select the paragraph NODE itself — not a text selection, so our
    // keymap must pass it through to the defaults untouched.
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));

    pressKey(editor, "Enter");
    const json = docJSON(editor);
    // Whatever the default does with a node selection is PM's business; we
    // pin only that OUR rules didn't fire: p1 is intact (nothing deleted,
    // nothing split, still exactly its wrapper) and no docParagraph sibling
    // (our end-of-block insert's signature) appeared anywhere.
    expect(json.content![0].type).toBe("docParagraph");
    expect(json.content![0].attrs).toMatchObject({ blockId: "p1" });
    expect(json.content![0].content).toHaveLength(1);
    expect(wrapperText(json.content![0])).toBe("Hello");
    for (const block of json.content!.slice(1)) {
      expect(block.type).not.toBe("docParagraph");
    }
  });
});

describe("DocKeymap Enter on ranged selections", () => {
  it("mid-paragraph range: deletes the range, then splits into two sibling paragraphs", () => {
    const editor = createEditor([paragraph("Hello world", { blockId: "p1" })]);
    // Select "o w" (offsets 4..7 → wrapper text starts at doc pos 2).
    editor.commands.setTextSelection({ from: 6, to: 9 });

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    const [head, tail] = json.content!;
    expect(head.type).toBe("docParagraph");
    expect(head.attrs).toMatchObject({ blockId: "p1" });
    expect(head.content).toHaveLength(1); // wrapper only — nothing nested
    expect(wrapperText(head)).toBe("Hell");
    expect(tail.type).toBe("docParagraph");
    expect(tail.attrs).toMatchObject({ blockId: null });
    expect(tail.content).toHaveLength(1);
    expect(wrapperText(tail)).toBe("orld");

    // Cursor sits at the start of the tail's text.
    const { $from } = editor.state.selection;
    expect($from.parent.type.name).toBe("docBlockText");
    expect($from.node(1).type.name).toBe("docParagraph");
    expect($from.parentOffset).toBe(0);
  });

  it("range extending to the END of a heading: heading keeps the head text, sibling paragraph follows", () => {
    const editor = createEditor([heading("Hello world", { blockId: "h1", level: 2 })]);
    // Select " world" through to the very end of the wrapper (offsets 5..11).
    editor.commands.setTextSelection({ from: 7, to: 13 });

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    const [head, tail] = json.content!;
    // The collapse point is the wrapper END → the end-of-block rule: the
    // heading survives (same id/level, remaining text) and a plain empty
    // paragraph — NOT a heading tail, NOT a nested child — follows.
    expect(head.type).toBe("docHeading");
    expect(head.attrs).toMatchObject({ blockId: "h1", level: 2 });
    expect(head.content).toHaveLength(1);
    expect(wrapperText(head)).toBe("Hello");
    expect(tail.type).toBe("docParagraph");
    expect(tail.attrs).toMatchObject({ blockId: null });
    expect(wrapperText(tail)).toBe("");

    const { $from } = editor.state.selection;
    expect($from.node(1).type.name).toBe("docParagraph");
  });

  it("cross-block range: collapses into the head block, then splits — never nests", () => {
    const editor = createEditor([
      paragraph("Alpha", { blockId: "p1" }),
      heading("Bravo", { blockId: "h1", level: 2 }),
    ]);
    // From "Al|pha" (pos 4) to "Bra|vo" (pos 14) — spans the block boundary.
    editor.commands.setTextSelection({ from: 4, to: 14 });

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    // The delete joins the heading's remainder ("vo") into the paragraph,
    // the collapse point is mid-text → same-type sibling split of the HEAD
    // block: two top-level paragraphs, head keeps p1's id, tail mints.
    expect(json.content).toHaveLength(2);
    const [head, tail] = json.content!;
    expect(head.type).toBe("docParagraph");
    expect(head.attrs).toMatchObject({ blockId: "p1" });
    expect(wrapperText(head)).toBe("Al");
    expect(tail.type).toBe("docParagraph");
    expect(tail.attrs).toMatchObject({ blockId: null });
    expect(wrapperText(tail)).toBe("vo");
    // Nothing nested anywhere: every top-level block holds exactly its wrapper.
    for (const block of json.content!) {
      expect(block.content).toHaveLength(1);
      expect(block.content![0].type).toBe("docBlockText");
    }

    // Cursor at the start of the tail block's text.
    const { $from } = editor.state.selection;
    expect($from.node(1).type.name).toBe("docParagraph");
    expect($from.parentOffset).toBe(0);
  });

  it("cross-block range ending at the END of the second block: empty sibling paragraph after the head", () => {
    const editor = createEditor([
      paragraph("Alpha", { blockId: "p1" }),
      paragraph("Bravo", { blockId: "p2" }),
    ]);
    // From "Al|pha" (pos 4) through the very end of "Bravo" (pos 16).
    editor.commands.setTextSelection({ from: 4, to: 16 });

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    expect(json.content![0]).toMatchObject({ type: "docParagraph", attrs: { blockId: "p1" } });
    expect(wrapperText(json.content![0])).toBe("Al");
    expect(json.content![1].type).toBe("docParagraph");
    expect(json.content![1].attrs).toMatchObject({ blockId: null });
    expect(wrapperText(json.content![1])).toBe("");
  });

  it("range inside a code block: replaced by a newline in the SAME code block", () => {
    const editor = createEditor([codeBlock("const a = 1;", { blockId: "c1" })]);
    // Select " = 1" (offsets 7..11 → code text starts at doc pos 1).
    editor.commands.setTextSelection({ from: 8, to: 12 });

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(1);
    expect(json.content![0].type).toBe("docCodeBlock");
    expect(json.content![0].content![0].text).toBe("const a\n;");
  });
});

describe("DocKeymap Backspace", () => {
  it("at the start of a heading converts it to a paragraph, preserving blockId and text", () => {
    const editor = createEditor([heading("Title", { blockId: "h1", level: 3 })]);
    setCursorInWrapper(editor, 0, 0);

    expect(pressKey(editor, "Backspace")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(1);
    expect(json.content![0].type).toBe("docParagraph");
    expect(json.content![0].attrs).toMatchObject({ blockId: "h1" });
    expect(wrapperText(json.content![0])).toBe("Title");
  });

  it("at the start of a quote converts it to a paragraph", () => {
    const editor = createEditor([quote("Quoted", { blockId: "q1" })]);
    setCursorInWrapper(editor, 0, 0);

    expect(pressKey(editor, "Backspace")).toBe(true);

    expect(docJSON(editor).content![0]).toMatchObject({
      type: "docParagraph",
      attrs: { blockId: "q1" },
    });
  });

  it("at the start of a list item converts it to a paragraph", () => {
    const editor = createEditor([listItem("Item", { blockId: "li1", ordered: true })]);
    setCursorInWrapper(editor, 0, 0);

    expect(pressKey(editor, "Backspace")).toBe(true);

    expect(docJSON(editor).content![0]).toMatchObject({
      type: "docParagraph",
      attrs: { blockId: "li1" },
    });
  });

  it("preserves marks on the converted block's text", () => {
    const editor = createEditor([
      {
        type: "docHeading",
        attrs: { blockId: "h1", level: 1 },
        content: [
          {
            type: "docBlockText",
            content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }],
          },
        ],
      },
    ]);
    setCursorInWrapper(editor, 0, 0);

    expect(pressKey(editor, "Backspace")).toBe(true);

    const block = docJSON(editor).content![0];
    expect(block.type).toBe("docParagraph");
    expect(block.content![0].content![0]).toMatchObject({
      text: "Bold",
      marks: [{ type: "bold" }],
    });
  });

  it("at the start of a paragraph is NOT handled by DocKeymap (defaults run)", () => {
    const editor = createEditor([
      paragraph("Above", { blockId: "p1" }),
      paragraph("Below", { blockId: "p2" }),
    ]);
    setCursorInWrapper(editor, 1, 0);

    pressKey(editor, "Backspace");

    // Whatever the default join does, our convert-to-paragraph must not have
    // touched types/ids of a block that is ALREADY a paragraph — and it must
    // not have swallowed the key into a no-op that leaves both intact AND
    // dispatched. Pin the non-conversion: no block changed type.
    const json = docJSON(editor);
    for (const block of json.content!) {
      expect(block.type).toBe("docParagraph");
    }
  });

  it("mid-text in a heading is NOT handled (default character delete applies)", () => {
    const editor = createEditor([heading("Title", { blockId: "h1", level: 1 })]);
    setCursorInWrapper(editor, 0, 3);

    pressKey(editor, "Backspace");

    // Still a heading — the format-strip only fires at offset 0.
    const json = docJSON(editor);
    expect(json.content![0].type).toBe("docHeading");
    expect(json.content![0].attrs).toMatchObject({ blockId: "h1" });
  });
});

describe("DocPlaceholder", () => {
  it("decorates an empty heading with its level hint (always, cursor elsewhere)", () => {
    const editor = createEditor([
      heading(undefined, { blockId: "h1", level: 1 }),
      paragraph("Content", { blockId: "p1" }),
    ]);
    // Cursor in the OTHER block — heading hint must not depend on it.
    setCursorInWrapper(editor, 1, 0);

    const h1 = editor.view.dom.querySelector("h1");
    expect(h1?.getAttribute("data-placeholder")).toBe("Heading 1");
    expect(h1?.classList.contains("doc-block-placeholder")).toBe(true);
  });

  it("renders a null heading level as Heading 2 and deep levels as Heading N", () => {
    const editor = createEditor([
      heading(undefined, { blockId: "h1" }), // level: null → 2
      heading(undefined, { blockId: "h2", level: 4 }),
    ]);

    expect(editor.view.dom.querySelector("h2")?.getAttribute("data-placeholder")).toBe(
      "Heading 2",
    );
    expect(editor.view.dom.querySelector("h4")?.getAttribute("data-placeholder")).toBe(
      "Heading 4",
    );
  });

  it("shows the slash hint on an empty paragraph only when the cursor is inside and the editor is focused", () => {
    const editor = createEditor([
      paragraph(undefined, { blockId: "p1" }),
      paragraph("Content", { blockId: "p2" }),
    ]);

    const emptyP = () => editor.view.dom.querySelector('p[data-block-id="p1"]');

    // Cursor inside but editor NOT focused → no hint.
    setCursorInWrapper(editor, 0, 0);
    expect(emptyP()?.getAttribute("data-placeholder")).toBeNull();

    // Focused + cursor inside → hint. (happy-dom can't drive real
    // contenteditable focus, so flip the same editor.isFocused flag TipTap's
    // FocusEvents plugin maintains, then redispatch to recompute.)
    editor.isFocused = true;
    setCursorInWrapper(editor, 0, 0);
    expect(emptyP()?.getAttribute("data-placeholder")).toBe("Type '/' for commands");
    expect(emptyP()?.classList.contains("doc-block-placeholder")).toBe(true);

    // Cursor moves away → hint disappears.
    setCursorInWrapper(editor, 1, 0);
    expect(emptyP()?.getAttribute("data-placeholder")).toBeNull();
  });

  it("labels empty quote/callout/list blocks when the editor is focused; non-empty blocks get nothing", () => {
    const editor = createEditor([
      quote(undefined, { blockId: "q1" }),
      { type: "docCallout", attrs: { blockId: "co1" }, content: [wrapper()] },
      listItem(undefined, { blockId: "li1" }),
      paragraph("Real text", { blockId: "p1" }),
      heading("Real title", { blockId: "h1", level: 1 }),
    ]);

    const dom = editor.view.dom;

    // Unfocused editor: no block type labels (only heading hints are always-on).
    expect(dom.querySelector("blockquote")?.getAttribute("data-placeholder")).toBeNull();
    expect(dom.querySelector("li")?.getAttribute("data-placeholder")).toBeNull();

    // Focused: every empty typed block labels up, wherever the cursor is
    // (park it in the non-empty paragraph). Same isFocused test seam as the
    // paragraph-hint test above; the selection dispatch recomputes decorations.
    editor.isFocused = true;
    setCursorInWrapper(editor, 3, 0);
    expect(dom.querySelector("blockquote")?.getAttribute("data-placeholder")).toBe("Quote");
    expect(
      dom.querySelector('[data-doc-type="callout"]')?.getAttribute("data-placeholder"),
    ).toBe("Callout");
    expect(dom.querySelector("li")?.getAttribute("data-placeholder")).toBe("List");

    // Non-empty blocks carry no placeholder attributes even while focused.
    expect(dom.querySelector('p[data-block-id="p1"]')?.getAttribute("data-placeholder")).toBeNull();
    expect(dom.querySelector("h1")?.getAttribute("data-placeholder")).toBeNull();
  });

  it("injects its stylesheet exactly once", () => {
    createEditor([paragraph("a", { blockId: "p1" })]);
    createEditor([paragraph("b", { blockId: "p2" })]);

    const styles = document.querySelectorAll("style#doc-editor-placeholder-style");
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain(".doc-block-placeholder::before");
  });
});

// ---------------------------------------------------------------------------

describe("DocKeymap + SlashMenu integration (full handleKeyDown chain)", () => {
  // Regression: DocKeymap's Enter keymap runs AHEAD of the slash plugin's
  // handleKeyDown in the real view (TipTap hoists addKeyboardShortcuts
  // keymaps). Without the explicit open-menu yield in handleEnter, Enter
  // with the menu open inserted a sibling block instead of executing the
  // highlighted command. This suite drives the SAME someProp chain a real
  // keydown takes — unlike SlashMenu.test.tsx's sendKey, which calls the
  // slash plugin's handler directly and so cannot see ordering conflicts.
  it("Enter with the menu open executes the selected command, not a block split", () => {
    const editor = createEditor([paragraph(undefined, { blockId: "p1" })], [SlashMenu]);
    setCursorInWrapper(editor, 0, 0);
    editor.commands.insertContent("/h1");
    expect(slashMenuPluginKey.getState(editor.state)?.open).toBe(true);

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    // The command replaced the /h1 paragraph with a level-1 heading — no
    // extra paragraph from a keymap split, no leftover "/h1" text.
    expect(json.content).toHaveLength(1);
    expect(json.content![0].type).toBe("docHeading");
    expect(json.content![0].attrs).toMatchObject({ level: 1 });
    expect(wrapperText(json.content![0])).toBe("");
    expect(slashMenuPluginKey.getState(editor.state)?.open).toBe(false);
  });

  it("Enter with the menu closed still splits normally with SlashMenu mounted", () => {
    const editor = createEditor([heading("Title", { blockId: "h1", level: 1 })], [SlashMenu]);
    setCursorInWrapper(editor, 0, "Title".length);

    expect(pressKey(editor, "Enter")).toBe(true);

    const json = docJSON(editor);
    expect(json.content).toHaveLength(2);
    expect(json.content![0].type).toBe("docHeading");
    expect(json.content![1].type).toBe("docParagraph");
  });
});
