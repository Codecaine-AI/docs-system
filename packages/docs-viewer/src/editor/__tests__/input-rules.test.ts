import { describe, expect, it } from "bun:test";
import { Editor, Extension, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { DocCodeBlock, DocDivider, DocHeading, DocListItem, DocParagraph, DocQuote } from "../core/schema";
import { buildDocInputRules } from "../input/input-rules";

const DocInputRules = Extension.create({
  name: "docInputRules",
  addInputRules() {
    return buildDocInputRules(this.editor);
  },
});

const TEST_NODES = [
  DocParagraph.extend({ content: "inline*" }),
  DocHeading.extend({ content: "inline*" }),
  DocListItem.extend({ content: "block+" }),
  DocCodeBlock,
  DocQuote.extend({ content: "block+" }),
  DocDivider,
];

function createEditor(text = "") {
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
        listItem: false,
        listKeymap: false,
        orderedList: false,
        paragraph: false,
        trailingNode: false,
        undoRedo: false,
      }),
      ...TEST_NODES,
      DocInputRules,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "docParagraph",
          content: text ? [{ type: "text", text }] : undefined,
        },
      ],
    },
    injectCSS: false,
  });

  editor.commands.focus();
  editor.commands.setTextSelection(text.length + 1);
  return editor;
}

function trigger(textBefore: string, triggerChar: string) {
  const editor = createEditor(textBefore);
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

  const json = editor.getJSON();
  editor.destroy();
  return json;
}

function firstBlock(json: JSONContent) {
  return json.content?.[0];
}

function firstText(json: JSONContent) {
  return firstBlock(json)?.content?.[0];
}

describe("buildDocInputRules", () => {
  it("applies bold from double asterisk delimiters", () => {
    const json = trigger("**bold text*", "*");

    expect(firstText(json)).toMatchObject({
      type: "text",
      text: "bold text",
      marks: [{ type: "bold" }],
    });
  });

  it("applies italic from single asterisk delimiters", () => {
    const json = trigger("*italic text", "*");

    expect(firstText(json)).toMatchObject({
      type: "text",
      text: "italic text",
      marks: [{ type: "italic" }],
    });
  });

  it("does not treat bold syntax as italic", () => {
    const json = trigger("**bold text*", "*");

    expect(firstText(json)?.marks).toEqual([{ type: "bold" }]);
  });

  it("applies strike from double tilde delimiters", () => {
    const json = trigger("~~strike text~", "~");

    expect(firstText(json)).toMatchObject({
      type: "text",
      text: "strike text",
      marks: [{ type: "strike" }],
    });
  });

  it("applies code from backtick delimiters", () => {
    const json = trigger("`code text", "`");

    expect(firstText(json)).toMatchObject({
      type: "text",
      text: "code text",
      marks: [{ type: "code" }],
    });
  });

  it("converts # to level 1 docHeading", () => {
    const json = trigger("#", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docHeading",
      attrs: { blockId: null, blockProps: {}, level: 1 },
    });
  });

  it("converts ## to level 2 docHeading", () => {
    const json = trigger("##", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docHeading",
      attrs: { blockId: null, blockProps: {}, level: 2 },
    });
  });

  it("converts ### to level 3 docHeading", () => {
    const json = trigger("###", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docHeading",
      attrs: { blockId: null, blockProps: {}, level: 3 },
    });
  });

  it("wraps dash trigger in unordered docListItem", () => {
    const json = trigger("-", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docListItem",
      attrs: { blockId: null, blockProps: {}, ordered: false },
    });
  });

  it("wraps asterisk trigger in unordered docListItem", () => {
    const json = trigger("*", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docListItem",
      attrs: { blockId: null, blockProps: {}, ordered: false },
    });
  });

  it("wraps ordered trigger in ordered docListItem", () => {
    const json = trigger("1.", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docListItem",
      attrs: { blockId: null, blockProps: {}, ordered: true },
    });
  });

  it("wraps quote trigger in docQuote", () => {
    const json = trigger(">", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docQuote",
      attrs: { blockId: null, blockProps: {} },
    });
  });

  it("converts bare code fence to docCodeBlock with null language", () => {
    const json = trigger("```", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docCodeBlock",
      attrs: { blockId: null, blockProps: {}, language: null },
    });
  });

  it("converts language code fence to docCodeBlock language attr", () => {
    const json = trigger("```typescript", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docCodeBlock",
      attrs: { blockId: null, blockProps: {}, language: "typescript" },
    });
  });

  it("replaces exactly three hyphens with docDivider", () => {
    const json = trigger("---", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docDivider",
      attrs: { blockId: null, blockProps: {}, blockText: null },
    });
  });

  it("does not replace two hyphens with docDivider", () => {
    const json = trigger("--", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docParagraph",
      content: [{ type: "text", text: "-- " }],
    });
  });

  it("does not replace four hyphens with docDivider", () => {
    const json = trigger("----", " ");

    expect(firstBlock(json)).toMatchObject({
      type: "docParagraph",
      content: [{ type: "text", text: "---- " }],
    });
  });
});
