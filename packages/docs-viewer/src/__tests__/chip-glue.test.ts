import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, Fragment } from "react";
import { renderDeltaSpans } from "../render/delta-spans";
import { rehypeInlineCodeChips } from "../render/rehype-inline-code-chips";

const html = (spans: Parameters<typeof renderDeltaSpans>[0]) => renderToStaticMarkup(createElement(Fragment, null, renderDeltaSpans(spans)));
/** The text of each glue span, read to its matching close tag. */
const glued = (markup: string) => {
  const out: string[] = [];
  for (const start of markup.matchAll(/<span data-chip-glue="true"[^>]*>/g)) {
    let depth = 1;
    let i = start.index! + start[0].length;
    const from = i;
    for (const tag of markup.slice(i).matchAll(/<(\/?)span\b[^>]*>/g)) {
      depth += tag[1] ? -1 : 1;
      if (depth === 0) { i += tag.index!; break; }
    }
    out.push(markup.slice(from, i).replace(/<[^>]+>/g, ""));
  }
  return out;
};

test("a chip and the punctuation after it render in one nowrap span, and the rest of the text follows", () => {
  const markup = html([{ insert: "Call " }, { insert: "docs_read", attributes: { code: true } }, { insert: ", which returns the hash." }]);
  expect(glued(markup)).toEqual(["docs_read,"]);
  expect(markup).toContain("whitespace-nowrap");
  expect(markup.replace(/<[^>]+>/g, "")).toBe("Call docs_read, which returns the hash.");
});

test("a chip followed by a word or by nothing stays unglued", () => {
  expect(glued(html([{ insert: "docs_read", attributes: { code: true } }, { insert: " returns the hash" }]))).toEqual([]);
  expect(glued(html([{ insert: "Run " }, { insert: "docs_end", attributes: { code: true } }]))).toEqual([]);
});

test("markdown chips glue the punctuation of the text node after them", () => {
  const code = { type: "element", tagName: "code", properties: {}, children: [{ type: "text", value: "doc.json" }] };
  const tree = { type: "root", children: [{ type: "element", tagName: "p", properties: {}, children: [{ type: "text", value: "Never read " }, code, { type: "text", value: ". Use docs" }] }] };
  rehypeInlineCodeChips()(tree);
  const p = tree.children[0]!;
  expect(p.children.map((c: { type: string; tagName?: string; value?: string }) => c.tagName ?? c.value)).toEqual(["Never read ", "span", " Use docs"]);
  const glue = p.children[1] as unknown as { properties: Record<string, string>; children: { tagName?: string; value?: string }[] };
  expect(glue.properties.style).toBe("white-space:nowrap");
  expect(glue.children.map((c) => c.tagName ?? c.value)).toEqual(["code", "."]);
});

test("an opening bracket before a chip joins it, and punctuation between two chips goes to one of them", () => {
  const markup = html([{ insert: "the STE Profile page (" }, { insert: "docs/99-appendix/10-style-guide/30-ste-profile", attributes: { code: true } }, { insert: ")." }]);
  expect(glued(markup)).toEqual(["(docs/99-appendix/10-style-guide/30-ste-profile)."]);
  // The glue span marks both sides, so the chip drops its padding next to the bracket and the period.
  expect(markup).toContain('data-chip-glue-before="true" data-chip-glue-after="true"');
  const pair = html([{ insert: "a", attributes: { code: true } }, { insert: "(" }, { insert: "b", attributes: { code: true } }]);
  expect(pair.replace(/<[^>]+>/g, "")).toBe("a(b");
});

test("a reference span next to a chip is never split, so its label prints once", () => {
  const markup = html([{ insert: "(", attributes: { reference: { kind: "doc", path: "docs/settings", label: "Settings (" } } }, { insert: "x", attributes: { code: true } }]);
  expect(markup.replace(/<[^>]+>/g, "")).toBe("Settings (x");
  expect(glued(markup)).toEqual([]);
});
