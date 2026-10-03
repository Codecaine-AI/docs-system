import { expect, test } from "bun:test";
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { protectSpans, restoreSpans } from "./index";

const styleGuide = { kind: "doc" as const, path: "99-appendix/10-style-guide", label: "Style guide" };
const docSchema = { kind: "source" as const, path: "packages/docs-model/src/doc-schema.ts" };

test("masks code, links, references, and markdown-like words, and an unchanged answer restores the exact spans", () => {
  const spans: DeltaSpan[] = [
    { insert: "Run " },
    { insert: "docs check", attributes: { code: true } },
    { insert: " before " },
    { insert: "Publish", attributes: { bold: true } },
    { insert: ". See " },
    { insert: "Style guide", attributes: { reference: styleGuide } },
    { insert: " and " },
    { insert: "doc-schema.ts", attributes: { code: true, reference: docSchema } },
    { insert: ", or read " },
    { insert: "the ", attributes: { link: "https://example.com/spec" } },
    { insert: "spec", attributes: { link: "https://example.com/spec", italic: true } },
    { insert: ". Later writes call docs_check and move_blocks with " },
    { insert: "gh-pages", attributes: { bold: true, code: true } },
    { insert: "." },
  ];

  const { markdown, tokens } = protectSpans(spans);

  expect(markdown).toBe(
    "Run ⟦0⟧ before **Publish**. See ⟦1⟧ and ⟦2⟧, or read ⟦3⟧. Later writes call ⟦4⟧ and ⟦5⟧ with **⟦6⟧**.",
  );
  expect(tokens.map(({ token, kind, preview }) => [token, kind, preview])).toEqual([
    ["⟦0⟧", "code", "docs check"],
    ["⟦1⟧", "reference", "Style guide"],
    ["⟦2⟧", "reference", "doc-schema.ts"],
    ["⟦3⟧", "link", "the spec"],
    ["⟦4⟧", "code", "docs_check"],
    ["⟦5⟧", "code", "move_blocks"],
    ["⟦6⟧", "code", "gh-pages"],
  ]);
  expect(restoreSpans(markdown, tokens)).toEqual({ blocks: [{ spans, depth: 0 }], ok: true, problems: [] });
});

test("restores a list answer into a lead, bullets, and sub-bullets with moved tokens and marks", () => {
  const { tokens } = protectSpans([
    { insert: "The verifier runs " },
    { insert: "three", attributes: { bold: true } },
    { insert: " checks; " },
    { insert: "tokens", attributes: { code: true } },
    { insert: " come back once; " },
    { insert: "Meaning Words", attributes: { reference: styleGuide } },
    { insert: " keep their count." },
  ]);
  const answer = [
    "The verifier runs **three** checks.",
    "- ⟦0⟧ come back once.",
    "  - Each one comes back *exactly* once.",
    "- ⟦1⟧ keep their count.",
    "Nothing else changes.",
  ].join("\n");

  expect(restoreSpans(answer, tokens)).toEqual({
    blocks: [
      { depth: 0, spans: [{ insert: "The verifier runs " }, { insert: "three", attributes: { bold: true } }, { insert: " checks." }] },
      { depth: 1, spans: [{ insert: "tokens", attributes: { code: true } }, { insert: " come back once." }] },
      {
        depth: 2,
        spans: [{ insert: "Each one comes back " }, { insert: "exactly", attributes: { italic: true } }, { insert: " once." }],
      },
      { depth: 1, spans: [{ insert: "Meaning Words", attributes: { reference: styleGuide } }, { insert: " keep their count." }] },
      // A loose sentence after the bullets is its own bullet, not the tail of the last one.
      { depth: 1, spans: [{ insert: "Nothing else changes." }] },
    ],
    ok: true,
    problems: [],
  });
  // A list item often comes back with its own bullet marker. The marker is not text.
  expect(restoreSpans("- The only line.", []).blocks).toEqual([{ depth: 0, spans: [{ insert: "The only line." }] }]);
  // A paragraph with a stray line break stays one block.
  expect(restoreSpans("One.\nTwo.", []).blocks).toEqual([{ depth: 0, spans: [{ insert: "One. Two." }] }]);
});

test("a step number that opens a block is protected and restores exactly", () => {
  const spans: DeltaSpan[] = [
    { insert: "1. Discover the project and read the section root with " },
    { insert: "docs_read", attributes: { code: true } },
    { insert: ". Keep its hash." },
  ];

  const { markdown, tokens } = protectSpans(spans);

  expect(markdown).toBe("⟦0⟧ Discover the project and read the section root with ⟦1⟧. Keep its hash.");
  expect(restoreSpans(markdown, tokens)).toEqual({ blocks: [{ spans, depth: 0 }], ok: true, problems: [] });
  // A number the model writes itself is text as well, never a list marker.
  expect(restoreSpans("2. Call the operation.", []).blocks).toEqual([{ depth: 0, spans: [{ insert: "2. Call the operation." }] }]);
});

test("reports duplicated, missing, and unknown tokens", () => {
  const { tokens } = protectSpans([
    { insert: "a", attributes: { code: true } },
    { insert: " and " },
    { insert: "b", attributes: { code: true } },
  ]);

  const result = restoreSpans("⟦0⟧ runs, ⟦0⟧ runs again, and ⟦9⟧ runs.", tokens);

  expect(result.ok).toBe(false);
  expect(result.problems).toEqual(["⟦0⟧ appears 2 times", "⟦1⟧ is missing", "⟦9⟧ is not a known token"]);
});
