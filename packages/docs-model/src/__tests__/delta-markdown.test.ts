import { describe, expect, it } from "bun:test";
import { deltaToMarkdownInline, deltaToPlainTextInline } from "../delta-markdown";

describe("deltaToMarkdownInline", () => {
  it("projects marks to markdown syntax", () => {
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
  });

  it("renders reference marks as PLAIN text (D35) — label wins, no link syntax", () => {
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
  });

  it("renders a label-less reference as its span text, falling back to the path", () => {
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
  });

  it("keeps inline marks on reference spans (a typed code path keeps its backticks)", () => {
    expect(
      deltaToMarkdownInline([
        {
          insert: "packages/x/y.ts",
          attributes: { code: true, reference: { kind: "source", path: "packages/x/y.ts" } },
        },
      ]),
    ).toBe("`packages/x/y.ts`");
  });

  it("handles empty/undefined input", () => {
    expect(deltaToMarkdownInline(undefined)).toBe("");
    expect(deltaToMarkdownInline([])).toBe("");
  });

  it("nests multiple marks on one span (code innermost, then bold/italic/strike, link outermost)", () => {
    expect(deltaToMarkdownInline([{ insert: "x", attributes: { bold: true, italic: true } }])).toBe("***x***");
    expect(
      deltaToMarkdownInline([{ insert: "x", attributes: { code: true, bold: true, link: "https://e.com" } }]),
    ).toBe("[**`x`**](https://e.com)");
  });
});

describe("deltaToPlainTextInline", () => {
  it("strips all marks", () => {
    expect(
      deltaToPlainTextInline([
        { insert: "a" },
        { insert: "b", attributes: { bold: true } },
        { insert: "c", attributes: { reference: { kind: "source", path: "x.ts" } } },
      ]),
    ).toBe("abc");
  });

  it("handles undefined", () => {
    expect(deltaToPlainTextInline(undefined)).toBe("");
  });
});
