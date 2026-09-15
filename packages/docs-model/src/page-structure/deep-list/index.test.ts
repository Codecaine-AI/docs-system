import { expect, test } from "bun:test";
import { deepListRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
test("four list levels warn and three do not", () => {
  const doc = document({
    ...paragraph("a", "A"),
    type: "list-item",
    children: ["b"],
  });
  for (const [id, next] of [
    ["b", "c"],
    ["c", "d"],
    ["d", ""],
  ] as const)
    doc.blocks[id] = {
      ...paragraph(id, id),
      type: "list-item",
      children: next ? [next] : [],
    };
  expect(
    deepListRule.check({ document: doc, blocks: orderedBlocks(doc) }),
  ).toHaveLength(1);
  doc.blocks.c!.children = [];
  expect(
    deepListRule.check({ document: doc, blocks: orderedBlocks(doc) }),
  ).toEqual([]);
  expect(deepListRule.severity).toBe("warning");
  expect(deepListRule.enforcement).toEqual([]);
});
