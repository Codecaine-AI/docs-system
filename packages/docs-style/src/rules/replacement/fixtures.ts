/** Test pages for the deny-list rules: build a page from blocks, then run a rule's detect or autofix. */
import type { DeltaSpan, DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import type { Replacement } from "../../profile";
import type { StyleRule } from "../../types";

export function paragraph(id: string, text: string | DeltaSpan[]): DocBlock {
  return { id, type: "paragraph", props: {}, text: typeof text === "string" ? [{ insert: text }] : text, children: [] };
}

export function table(id: string, columns: string[], rows: string[][]): DocBlock {
  return { id, type: "structured-table", props: { columns, rows }, children: [] };
}

export function heading(id: string, text: string): DocBlock {
  return { id, type: "heading", props: { level: 2 }, text: [{ insert: text }], children: [] };
}

/** A page that holds the blocks in order. */
export function pageOf(...blocks: DocBlock[]): DocDocument {
  const root: DocBlock = { id: "root", type: "paragraph", props: {}, children: blocks.map((b) => b.id) };
  return { schemaVersion: 1, id: "test", root: "root", blocks: Object.fromEntries([root, ...blocks].map((b) => [b.id, b])) };
}

export function detect(rule: StyleRule, ...blocks: DocBlock[]) {
  const document = pageOf(...blocks);
  return rule.detect!({ document, blocks: orderedBlocks(document) });
}

/** The autofixed text of one paragraph as a plain string, or undefined when nothing changes. */
export function fix(rule: StyleRule, text: string): string | undefined {
  const block = paragraph("p", text);
  return rule.autofix!(block.text!, block)?.map((span) => span.insert).join("");
}

/** The autofixed text of one block of a page, read with its page, or undefined when nothing changes. */
export function fixOnPage(rule: StyleRule, page: DocDocument, blockId: string): string | undefined {
  const block = page.blocks[blockId]!;
  return rule.autofix!(block.text!, block, page)?.map((span) => span.insert).join("");
}

/** A deny-list row with the defaults most tests share. */
export function row(find: string, replace: string, extra: Partial<Replacement> = {}): Replacement {
  return { find, replace, tier: "autofix", category: "simple word", origin: "style-guides", ...extra };
}
