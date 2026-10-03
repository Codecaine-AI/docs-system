import { expect, test } from "bun:test";
import { markdownToSpans } from "./markdown";
import { meaningMarkdown } from "./meaning-markdown";

test("a change reads as a lead line plus bullets, two spaces of indent per level below the first", () => {
  const blocks = [
    { spans: markdownToSpans("The sweep has two steps."), depth: 0 },
    { spans: markdownToSpans("It lints **every** page."), depth: 1 },
    { spans: markdownToSpans("Run `docs style lint`."), depth: 2 },
    { spans: markdownToSpans("It stages [proposals](https://example.com/p)."), depth: 1 },
  ];
  expect(meaningMarkdown(blocks)).toBe(
    "The sweep has two steps.\n- It lints **every** page.\n  - Run `docs style lint`.\n- It stages [proposals](https://example.com/p).",
  );
});

test("a reference shows its target, and marks stay inside the label", () => {
  const spans = [
    { insert: "See " },
    { insert: "Mutation Model", attributes: { bold: true as const, reference: { kind: "doc" as const, path: "10-system-design/30-data-model/50-mutation-model", section: "ops" } } },
    { insert: " and " },
    { insert: "doc-ops.ts", attributes: { code: true as const, link: "https://example.com/doc-ops" } },
    { insert: "." },
  ];
  expect(meaningMarkdown([{ spans, depth: 0 }])).toBe(
    "See [**Mutation Model**](ref:10-system-design/30-data-model/50-mutation-model#ops) and [`doc-ops.ts`](https://example.com/doc-ops).",
  );
});
