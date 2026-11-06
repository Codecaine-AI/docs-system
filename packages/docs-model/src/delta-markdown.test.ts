import { expect, test } from "bun:test";
import { deltaToMarkdownInline } from "./delta-markdown";

test("a bold run that holds a bold code span projects as one bold run", () => {
  expect(deltaToMarkdownInline([
    { insert: "Data in through ", attributes: { bold: true } },
    { insert: "DocsClient", attributes: { bold: true, code: true } },
  ])).toBe("**Data in through `DocsClient`**");
});

test("spans with different marks keep their own wrapping, and references print their text", () => {
  expect(deltaToMarkdownInline([
    { insert: "Call " },
    { insert: "docs_read", attributes: { code: true } },
    { insert: " first", attributes: { italic: true } },
    { insert: ", then read ", attributes: {} },
    { insert: "Theming", attributes: { reference: { kind: "doc", path: "docs/theming" } } },
    { insert: "site", attributes: { link: "https://example.com" } },
  ])).toBe("Call `docs_read`* first*, then read Theming[site](https://example.com)");
});
