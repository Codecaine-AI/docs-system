import { expect, test } from "bun:test";
import { splitBulletListRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocBlock, DocDocument } from "../../doc-schema";

const check = (doc: DocDocument) => splitBulletListRule.check({ document: doc, blocks: orderedBlocks(doc) });
const item = (id: string, text: string, props: Record<string, unknown> = {}): DocBlock => ({ ...paragraph(id, text), type: "list-item", props });
const block = (id: string, type: "code" | "callout"): DocBlock => ({ ...paragraph(id, "docs render 30-implementation"), type });

test("flags a code block and a callout between two bullets of one list", () => {
  const doc = document(item("a", "Render a page as markdown."), block("cmd", "code"), item("b", "Search every page."), block("warn", "callout"), item("c", "Read the source."));
  expect(check(doc).map((m) => m.blockId)).toEqual(["cmd", "warn"]);
});

test("accepts a block after the last bullet, a paragraph between bullets, and numbered steps", () => {
  expect(check(document(item("a", "Render a page."), item("b", "Search pages."), block("cmd", "code")))).toEqual([]);
  expect(check(document(item("a", "Render a page."), paragraph("p", "Two more tools help."), item("b", "Search pages.")))).toEqual([]);
  expect(check(document(item("a", "Render a page.", { ordered: true }), block("cmd", "code"), item("b", "Search pages.", { ordered: true })))).toEqual([]);
});
