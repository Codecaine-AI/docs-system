import { describe, expect, it } from "bun:test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  highlightCodeTokens,
} from "../../components/code/highlight";
import {
  DocCodeBlockHighlight,
  docCodeBlockHighlightPluginKey,
} from "../../components/code/editor-highlight";
import { DocBlockText, DocCodeBlock, DocParagraph } from "../core/schema";

describe("highlightCodeTokens", () => {
  it("returns offset ranges into the ORIGINAL code string", () => {
    const code = 'const x = "a<b"';
    const tokens = highlightCodeTokens(code, "typescript");

    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(token.from).toBeLessThan(token.to);
      expect(token.from).toBeGreaterThanOrEqual(0);
      expect(token.to).toBeLessThanOrEqual(code.length);
      expect(token.className).toMatch(/hljs-/);
    }
    // The `const` keyword tokenizes at its exact source offsets even though
    // hljs HTML-escaped the `<` later in the string.
    const keyword = tokens.find((token) => token.className.includes("keyword"));
    expect(keyword).toMatchObject({ from: 0, to: "const".length });
    // The string literal (with the escaped `<`) still maps to source offsets.
    const literal = tokens.find((token) => token.className.includes("string"));
    expect(literal).toMatchObject({ from: code.indexOf('"a<b"'), to: code.length });
  });

  it("returns no tokens for unknown languages (plain rendering)", () => {
    expect(highlightCodeTokens("plain words", "no-such-language")).toEqual([]);
    expect(highlightCodeTokens("plain words")).toEqual([]);
  });

  it("sniffs JSON when no language is declared", () => {
    const tokens = highlightCodeTokens('{"a": 1}');
    expect(tokens.length).toBeGreaterThan(0);
  });
});

describe("DocCodeBlockHighlight plugin", () => {
  function createEditor(codeText: string, language: string | null) {
    return new Editor({
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
        DocBlockText,
        DocParagraph,
        DocCodeBlock,
        DocCodeBlockHighlight,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "docCodeBlock",
            attrs: { language },
            content: [{ type: "text", text: codeText }],
          },
        ],
      },
      injectCSS: false,
    });
  }

  it("decorates code block text with hljs classes at node-relative offsets", () => {
    const editor = createEditor("const a = 1;", "typescript");
    const decorations = docCodeBlockHighlightPluginKey.getState(editor.state);
    // The code block starts at doc position 0; its text starts at 1 — the
    // `const` keyword decoration must span [1, 6).
    const found = decorations?.find(1, 6) ?? [];
    expect(found.length).toBeGreaterThan(0);
    editor.destroy();
  });

  it("recomputes when the language attr changes", () => {
    const editor = createEditor("const a = 1;", null);
    const before = docCodeBlockHighlightPluginKey.getState(editor.state)?.find() ?? [];
    expect(before).toHaveLength(0); // plain text: not JSON, no grammar

    editor.commands.updateAttributes("docCodeBlock", { language: "typescript" });
    const after = docCodeBlockHighlightPluginKey.getState(editor.state)?.find() ?? [];
    expect(after.length).toBeGreaterThan(0);
    editor.destroy();
  });
});
