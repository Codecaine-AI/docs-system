import { describe, expect, it } from "bun:test";
import { Editor, Extension, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  DocBlockText,
  DocCodeBlock,
  DocDivider,
  DocHeading,
  DocListItem,
  DocParagraph,
  DocQuote,
} from "../core/schema";
import { DocItalic, DocStrike } from "../../components/rich-text/editor-marks";
import { buildDocInputRules } from "../input/input-rules";

const DocInputRules = Extension.create({
  name: "docInputRules",
  addInputRules() {
    return buildDocInputRules(this.editor);
  },
});

// The REAL nested schema shape — every text block is `docBlockText block*`
// with the wrapper holding the inline content (see editor/core/schema.ts).
// An earlier version of this harness flattened the nodes to `inline*`, which
// made TipTap's stock textblock/wrapping rules pass here while silently
// never firing in the live editor; the harness now mirrors production.
const TEST_NODES = [
  DocBlockText,
  DocParagraph,
  DocHeading,
  DocListItem,
  DocCodeBlock,
  DocQuote,
  DocDivider,
];

function createEditor(text = "", attrs: Record<string, unknown> = {}) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        // Mirrors DocEditor: italic/strike marks re-register below WITHOUT
        // their markdown typing shortcuts (bold-only policy).
        italic: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        paragraph: false,
        strike: false,
        trailingNode: false,
        undoRedo: false,
      }),
      DocItalic,
      DocStrike,
      ...TEST_NODES,
      DocInputRules,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "docParagraph",
          attrs,
          content: [
            {
              type: "docBlockText",
              content: text ? [{ type: "text", text }] : undefined,
            },
          ],
        },
      ],
    },
    injectCSS: false,
  });

  editor.commands.focus();
  // Cursor at end of the paragraph's text: doc > docParagraph(+1) >
  // docBlockText(+1) puts the first text position at 2.
  editor.commands.setTextSelection(text.length + 2);
  return editor;
}

function typeChar(editor: Editor, triggerChar: string) {
  const { from, to } = editor.state.selection;
  let handled = false;

  editor.view.someProp("handleTextInput", (handler) => {
    // prosemirror-view >= 1.34 passes a fifth `deflt` argument (the default
    // insert-text transaction factory); TipTap's input-rule plugin ignores
    // it, but the type requires it.
    handled =
      handler(
        editor.view,
        from,
        to,
        triggerChar,
        () => editor.view.state.tr.insertText(triggerChar, from, to),
      ) || handled;
    return handled;
  });

  if (!handled) {
    editor.commands.insertContent(triggerChar);
  }
}

function trigger(textBefore: string, triggerChar: string, attrs: Record<string, unknown> = {}) {
  const editor = createEditor(textBefore, attrs);
  typeChar(editor, triggerChar);
  const json = editor.getJSON();
  const selectionParent = editor.state.selection.$from.node(-1)?.type.name ?? null;
  editor.destroy();
  return { json, selectionParent };
}

function firstBlock(json: JSONContent) {
  return json.content?.[0];
}

/** The first block's docBlockText wrapper. */
function blockText(json: JSONContent) {
  return firstBlock(json)?.content?.[0];
}

/** The first text node inside the first block's docBlockText. */
function firstText(json: JSONContent) {
  return blockText(json)?.content?.[0];
}

describe("buildDocInputRules", () => {
  it("applies bold from double asterisk delimiters", () => {
    const { json } = trigger("**bold text*", "*");

    expect(firstText(json)).toMatchObject({
      type: "text",
      text: "bold text",
      marks: [{ type: "bold" }],
    });
  });

  it("closing double asterisks resolve as bold, never italic", () => {
    const { json } = trigger("**bold text*", "*");

    expect(firstText(json)?.marks).toEqual([{ type: "bold" }]);
  });

  it("does NOT auto-italicize single asterisk delimiters (bold-only policy)", () => {
    const { json } = trigger("*italic text", "*");

    expect(firstText(json)).toMatchObject({ type: "text", text: "*italic text*" });
    expect(firstText(json)?.marks).toBeUndefined();
  });

  it("does NOT auto-strike double tilde delimiters (bold-only policy)", () => {
    const { json } = trigger("~~strike text~", "~");

    expect(firstText(json)).toMatchObject({ type: "text", text: "~~strike text~~" });
    expect(firstText(json)?.marks).toBeUndefined();
  });

  it("applies code from backtick delimiters", () => {
    const { json } = trigger("`code text", "`");

    expect(firstText(json)).toMatchObject({
      type: "text",
      text: "code text",
      marks: [{ type: "code" }],
    });
  });

  it("converts # to level 1 docHeading", () => {
    const { json } = trigger("#", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docHeading",
      attrs: { blockId: null, blockProps: {}, level: 1 },
    });
  });

  it("converts ## to level 2 docHeading", () => {
    const { json } = trigger("##", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docHeading",
      attrs: { blockId: null, blockProps: {}, level: 2 },
    });
  });

  it("converts ### to level 3 docHeading", () => {
    const { json } = trigger("###", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docHeading",
      attrs: { blockId: null, blockProps: {}, level: 3 },
    });
  });

  it("keeps the blockId when converting a paragraph", () => {
    const { json } = trigger("##", " ", { blockId: "b-stable-1" });

    expect(firstBlock(json)).toMatchObject({
      type: "docHeading",
      attrs: { blockId: "b-stable-1", level: 2 },
    });
  });

  it("converts dash trigger to an unordered docListItem", () => {
    const { json } = trigger("-", " ");

    // `ordered: null` is deliberate — the absent-in-source-props sentinel
    // (see DocListItem's attr comment); null renders as unordered.
    expect(firstBlock(json)).toMatchObject({
      type: "docListItem",
      attrs: { blockId: null, blockProps: {}, ordered: null },
    });
  });

  it("converts asterisk trigger to an unordered docListItem", () => {
    const { json } = trigger("*", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docListItem",
      attrs: { blockId: null, blockProps: {}, ordered: null },
    });
  });

  it("converts ordered trigger to an ordered docListItem", () => {
    const { json } = trigger("1.", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docListItem",
      attrs: { blockId: null, blockProps: {}, ordered: true },
    });
  });

  it("converts quote trigger to docQuote", () => {
    const { json } = trigger(">", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docQuote",
      attrs: { blockId: null, blockProps: {} },
    });
  });

  it("does not convert mid-paragraph hashes", () => {
    const { json } = trigger("some text ##", " ");

    expect(firstBlock(json)).toMatchObject({ type: "docParagraph" });
    expect(firstText(json)).toMatchObject({ type: "text", text: "some text ## " });
  });

  it("converts to docCodeBlock the moment the third backtick lands", () => {
    const { json } = trigger("``", "`");

    expect(firstBlock(json)).toMatchObject({
      type: "docCodeBlock",
      attrs: { blockId: null, blockProps: {}, language: null },
    });
  });

  it("does not convert backticks mid-paragraph", () => {
    const { json } = trigger("x ``", "`");

    expect(firstBlock(json)).toMatchObject({ type: "docParagraph" });
  });

  it("replaces three hyphens with docDivider the moment the third lands", () => {
    const { json, selectionParent } = trigger("--", "-");

    expect(firstBlock(json)).toMatchObject({
      type: "docDivider",
      attrs: { blockId: null, blockProps: {} },
    });
    // Notion semantics: the cursor lands in an empty paragraph after the rule.
    expect(json.content?.[1]).toMatchObject({ type: "docParagraph" });
    expect(selectionParent).toBe("docParagraph");
  });

  it("does not replace two hyphens with docDivider", () => {
    const { json } = trigger("-", "-");

    expect(firstBlock(json)).toMatchObject({ type: "docParagraph" });
    expect(firstText(json)).toMatchObject({ type: "text", text: "--" });
  });

  it("does not fire the divider mid-paragraph", () => {
    const { json } = trigger("a --", "-");

    expect(firstBlock(json)).toMatchObject({ type: "docParagraph" });
    expect(firstText(json)).toMatchObject({ type: "text", text: "a ---" });
  });
});
