import { expect, test } from "bun:test";
import { splitOrderedListRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocBlock, DocDocument } from "../../doc-schema";

const check = (doc: DocDocument) => splitOrderedListRule.check({ document: doc, blocks: orderedBlocks(doc) });
const step = (id: string, children: string[] = []): DocBlock => ({ ...paragraph(id, `Do ${id}.`), type: "list-item", props: { ordered: true }, children });
const code = (id: string): DocBlock => ({ id, type: "code", props: { language: "sh" }, text: [{ insert: "bun test" }], children: [] });
const heading = (id: string): DocBlock => ({ ...paragraph(id, "Next Task"), type: "heading", props: { level: 2 } });

test("flags a code block that splits numbered steps, so the next step would read 1.", () => {
  const doc = document(paragraph("lead", "Add the import in four steps."), step("s1"), step("s2"), code("run"), step("s3"));
  expect(check(doc).map((m) => [m.blockId, m.message])).toEqual([
    ["run", 'The code block run sits between step 2 and the next numbered step, so that step renders as "1.". Move run into step 2\'s children.'],
  ]);
});

test("accepts the code block inside its step, after the last step, and after a heading", () => {
  const nested = document(step("s1"), step("s2", ["run"]), step("s3"));
  expect(check({ ...nested, blocks: { ...nested.blocks, run: code("run") } })).toEqual([]);
  expect(check(document(step("s1"), step("s2"), code("run"), paragraph("after", "The test prints each import.")))).toEqual([]);
  expect(check(document(step("s1"), heading("h"), step("t1")))).toEqual([]);
});
