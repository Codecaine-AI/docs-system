import { describe, expect, it } from "bun:test";
import { inlineToDelta } from "../inline-to-delta";

const repoRoot = process.cwd();
const docPath = "docs/00-foundation/00-overview.mdx";

describe("inlineToDelta", () => {
  it("returns empty spans and no warnings for empty input", () => {
    expect(inlineToDelta("", { docPath, repoRoot })).toEqual({ spans: [], warnings: [] });
  });

  it("returns one unattributed span for plain text", () => {
    expect(inlineToDelta("plain text only", { docPath, repoRoot })).toEqual({
      spans: [{ insert: "plain text only" }],
      warnings: [],
    });
  });

  it("parses bold in isolation", () => {
    expect(inlineToDelta("before **bold** after", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "before " },
        { insert: "bold", attributes: { bold: true } },
        { insert: " after" },
      ],
      warnings: [],
    });
  });

  it("parses asterisk italic in isolation", () => {
    expect(inlineToDelta("before *italic* after", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "before " },
        { insert: "italic", attributes: { italic: true } },
        { insert: " after" },
      ],
      warnings: [],
    });
  });

  it("parses underscore italic in isolation", () => {
    expect(inlineToDelta("before _italic_ after", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "before " },
        { insert: "italic", attributes: { italic: true } },
        { insert: " after" },
      ],
      warnings: [],
    });
  });

  it("parses strike in isolation", () => {
    expect(inlineToDelta("before ~~strike~~ after", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "before " },
        { insert: "strike", attributes: { strike: true } },
        { insert: " after" },
      ],
      warnings: [],
    });
  });

  it("parses inline code in isolation", () => {
    expect(inlineToDelta("before `const x = 1` after", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "before " },
        { insert: "const x = 1", attributes: { code: true } },
        { insert: " after" },
      ],
      warnings: [],
    });
  });

  it("keeps external links as plain link attributes", () => {
    expect(inlineToDelta("read [site](https://example.com)", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "read " },
        { insert: "site", attributes: { link: "https://example.com" } },
      ],
      warnings: [],
    });
  });

  it("classifies doc links as doc references", () => {
    expect(inlineToDelta("read [purpose](./10-purpose.mdx)", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "read " },
        {
          insert: "purpose",
          attributes: {
            reference: { kind: "doc", path: "docs/00-foundation/10-purpose.mdx", label: "purpose" },
          },
        },
      ],
      warnings: [],
    });
  });

  it("classifies source links as source references", () => {
    expect(inlineToDelta("see [schema](../../apps/frontend/src/lib/docs-model/doc-schema.ts)", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "see " },
        {
          insert: "schema",
          attributes: {
            reference: { kind: "source", path: "apps/frontend/src/lib/docs-model/doc-schema.ts", label: "schema" },
          },
        },
      ],
      warnings: [],
    });
  });

  it("merges attrs for bold containing italic", () => {
    expect(inlineToDelta("**bold *both* bold**", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "bold ", attributes: { bold: true } },
        { insert: "both", attributes: { bold: true, italic: true } },
        { insert: " bold", attributes: { bold: true } },
      ],
      warnings: [],
    });
  });

  it("merges attrs for italic containing bold", () => {
    expect(inlineToDelta("*italic **both** italic*", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "italic ", attributes: { italic: true } },
        { insert: "both", attributes: { bold: true, italic: true } },
        { insert: " italic", attributes: { italic: true } },
      ],
      warnings: [],
    });
  });

  it("merges attrs for bold and strike combined", () => {
    expect(inlineToDelta("**bold ~~both~~ bold**", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "bold ", attributes: { bold: true } },
        { insert: "both", attributes: { bold: true, strike: true } },
        { insert: " bold", attributes: { bold: true } },
      ],
      warnings: [],
    });
  });

  it("keeps code spans verbatim and atomic inside surrounding emphasis", () => {
    expect(inlineToDelta("**before `*literal*` after**", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "before ", attributes: { bold: true } },
        { insert: "*literal*", attributes: { code: true } },
        { insert: " after", attributes: { bold: true } },
      ],
      warnings: [],
    });
  });

  it("keeps stray single asterisk literal without corrupting surrounding text", () => {
    expect(inlineToDelta("a stray * marker", { docPath, repoRoot })).toEqual({
      spans: [{ insert: "a stray * marker" }],
      warnings: [],
    });
  });

  it("keeps stray double asterisk literal without corrupting surrounding text", () => {
    expect(inlineToDelta("a stray ** marker", { docPath, repoRoot })).toEqual({
      spans: [{ insert: "a stray ** marker" }],
      warnings: [],
    });
  });

  it("preserves whitespace inside marked spans exactly", () => {
    expect(inlineToDelta("x**  leading  middle\ttrailing  **y", { docPath, repoRoot })).toEqual({
      spans: [
        { insert: "x" },
        { insert: "  leading  middle\ttrailing  ", attributes: { bold: true } },
        { insert: "y" },
      ],
      warnings: [],
    });
  });

  it("adds doc anchor as section", () => {
    expect(inlineToDelta("[purpose](./10-purpose.mdx#some-heading)", { docPath, repoRoot })).toEqual({
      spans: [
        {
          insert: "purpose",
          attributes: {
            reference: {
              kind: "doc",
              path: "docs/00-foundation/10-purpose.mdx",
              section: "some-heading",
              label: "purpose",
            },
          },
        },
      ],
      warnings: [],
    });
  });

  it("adds numeric source anchor as line number", () => {
    expect(inlineToDelta("[schema](../../apps/frontend/src/lib/docs-model/doc-schema.ts#L42)", { docPath, repoRoot })).toEqual({
      spans: [
        {
          insert: "schema",
          attributes: {
            reference: {
              kind: "source",
              path: "apps/frontend/src/lib/docs-model/doc-schema.ts",
              line: 42,
              label: "schema",
            },
          },
        },
      ],
      warnings: [],
    });
  });

  it("adds non-numeric source anchor as symbol", () => {
    expect(inlineToDelta("[schema](../../apps/frontend/src/lib/docs-model/doc-schema.ts#myFunction)", { docPath, repoRoot })).toEqual({
      spans: [
        {
          insert: "schema",
          attributes: {
            reference: {
              kind: "source",
              path: "apps/frontend/src/lib/docs-model/doc-schema.ts",
              symbol: "myFunction",
              label: "schema",
            },
          },
        },
      ],
      warnings: [],
    });
  });

  it("keeps mailto links plain", () => {
    expect(inlineToDelta("[email](mailto:test@example.com)", { docPath, repoRoot })).toEqual({
      spans: [{ insert: "email", attributes: { link: "mailto:test@example.com" } }],
      warnings: [],
    });
  });

  it("keeps image-like links plain", () => {
    expect(inlineToDelta("[asset](./diagram.svg)", { docPath, repoRoot })).toEqual({
      spans: [{ insert: "asset", attributes: { link: "./diagram.svg" } }],
      warnings: [],
    });
  });

  it("warns for ambiguous extensionless relative paths and keeps them plain", () => {
    const result = inlineToDelta("[folder](../some-folder)", { docPath, repoRoot });

    expect(result.spans).toEqual([{ insert: "folder", attributes: { link: "../some-folder" } }]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toBe('Unclassifiable internal-looking link target: "../some-folder"');
  });

  it("parses a mixed real-world sentence with marks and link", () => {
    expect(
      inlineToDelta("Ship **bold and _nested_** text, `code`, ~~old~~, and [purpose](./10-purpose.mdx).", {
        docPath,
        repoRoot,
      }),
    ).toEqual({
      spans: [
        { insert: "Ship " },
        { insert: "bold and ", attributes: { bold: true } },
        { insert: "nested", attributes: { bold: true, italic: true } },
        { insert: " text, " },
        { insert: "code", attributes: { code: true } },
        { insert: ", " },
        { insert: "old", attributes: { strike: true } },
        { insert: ", and " },
        {
          insert: "purpose",
          attributes: {
            reference: { kind: "doc", path: "docs/00-foundation/10-purpose.mdx", label: "purpose" },
          },
        },
        { insert: "." },
      ],
      warnings: [],
    });
  });
});
