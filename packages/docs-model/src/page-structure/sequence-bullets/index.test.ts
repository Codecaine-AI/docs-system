import { expect, test } from "bun:test";
import { sequenceBulletsRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocBlock, DocDocument } from "../../doc-schema";

const check = (doc: DocDocument) => sequenceBulletsRule.check({ document: doc, blocks: orderedBlocks(doc) });
const item = (id: string, text: string, props: Record<string, unknown> = {}): DocBlock => ({ ...paragraph(id, text), type: "list-item", props });

test("flags a bullet run whose later item opens with an order word", () => {
  const doc = document(item("a", "Start with src/types.ts, which holds every contract."), item("b", "Then read src/sweep/index.ts."));
  expect(check(doc).map((m) => m.blockId)).toEqual(["a"]);
});

test("accepts plain fact bullets, numbered steps and task items", () => {
  expect(check(document(item("a", "The viewer renders pages."), item("b", "The host saves them.")))).toEqual([]);
  expect(check(document(item("a", "Start with the types.", { ordered: true }), item("b", "Then read the sweep.", { ordered: true })))).toEqual([]);
  expect(check(document(item("a", "Install the CLI.", { checked: false }), item("b", "Then run the check.", { checked: false })))).toEqual([]);
});
