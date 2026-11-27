import { describe, expect, it } from "bun:test";
import { deltaToMarkdownInline, deltaToPlainTextInline } from "../delta-markdown";

describe("deltaToMarkdownInline", () => {
  it.each([
    ["projects marks to markdown syntax", () => {
      expect(
        deltaToMarkdownInline([
          { insert: "plain " },
          { insert: "bold", attributes: { bold: true } },
          { insert: " " },
          { insert: "italic", attributes: { italic: true } },
          { insert: " " },
          { insert: "struck", attributes: { strike: true } },
          { insert: " " },
          { insert: "code", attributes: { code: true } },
          { insert: " " },
          { insert: "site", attributes: { link: "https://example.com" } },
        ]),
      ).toBe("plain **bold** *italic* ~~struck~~ `code` [site](https://example.com)");
    }],
    ["renders reference marks as PLAIN text (D35) — label wins, no link syntax", () => {
      expect(
        deltaToMarkdownInline([
          {
            insert: "doc-schema.ts",
            attributes: {
              reference: {
                kind: "source",
                path: "apps/frontend/src/lib/docs-model/doc-schema.ts",
                symbol: "validateDocDocument",
                label: "doc-schema.ts",
              },
            },
          },
        ]),
      ).toBe("doc-schema.ts");
      expect(deltaToMarkdownInline([{ insert: "doc-schema.ts", attributes: {} }])).toBe("doc-schema.ts");
    }],
    ["renders a label-less reference as its span text, falling back to the path", () => {
      expect(
        deltaToMarkdownInline([
          {
            insert: "raw text",
            attributes: { reference: { kind: "source", path: "some/path.ts" } },
          },
        ]),
      ).toBe("raw text");
      expect(
        deltaToMarkdownInline([
          { insert: "", attributes: { reference: { kind: "source", path: "some/path.ts" } } },
        ]),
      ).toBe("some/path.ts");
    }],
    ["keeps inline marks on reference spans (a typed code path keeps its backticks)", () => {
      expect(
        deltaToMarkdownInline([
          {
            insert: "packages/x/y.ts",
            attributes: { code: true, reference: { kind: "source", path: "packages/x/y.ts" } },
          },
        ]),
      ).toBe("`packages/x/y.ts`");
    }],
    ["handles empty/undefined input", () => {
      expect(deltaToMarkdownInline(undefined)).toBe("");
      expect(deltaToMarkdownInline([])).toBe("");
    }],
    ["nests multiple marks on one span (code innermost, then bold/italic/strike, link outermost)", () => {
      expect(deltaToMarkdownInline([{ insert: "x", attributes: { bold: true, italic: true } }])).toBe("***x***");
      expect(
        deltaToMarkdownInline([{ insert: "x", attributes: { code: true, bold: true, link: "https://e.com" } }]),
      ).toBe("[**`x`**](https://e.com)");
    }],
    ["a bold run that holds a bold code span projects as one bold run", () => {
      expect(deltaToMarkdownInline([
        { insert: "Data in through ", attributes: { bold: true } },
        { insert: "DocsClient", attributes: { bold: true, code: true } },
      ])).toBe("**Data in through `DocsClient`**");
    }],
    ["spans with different marks keep their own wrapping, and references print their text", () => {
      expect(deltaToMarkdownInline([
        { insert: "Call " },
        { insert: "docs_read", attributes: { code: true } },
        { insert: " first", attributes: { italic: true } },
        { insert: ", then read ", attributes: {} },
        { insert: "Theming", attributes: { reference: { kind: "doc", path: "docs/theming" } } },
        { insert: "site", attributes: { link: "https://example.com" } },
      ])).toBe("Call `docs_read`* first*, then read Theming[site](https://example.com)");
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());
});

describe("deltaToPlainTextInline", () => {
  it.each([
    ["strips all marks", () => {
      expect(
        deltaToPlainTextInline([
          { insert: "a" },
          { insert: "b", attributes: { bold: true } },
          { insert: "c", attributes: { reference: { kind: "source", path: "x.ts" } } },
        ]),
      ).toBe("abc");
    }],
    ["handles undefined", () => {
      expect(deltaToPlainTextInline(undefined)).toBe("");
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());
});
