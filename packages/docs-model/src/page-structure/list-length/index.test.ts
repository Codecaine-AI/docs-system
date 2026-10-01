import { expect, test } from "bun:test";
import { listLengthRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import { lintDocument } from "../../lint";
import type { DocBlock, DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  listLengthRule.check({ document: doc, blocks: orderedBlocks(doc) });
const list = (n: number, prefix = "i"): DocBlock[] =>
  Array.from({ length: n }, (_, i) => ({
    ...paragraph(`${prefix}${i}`, `Item ${i}.`),
    type: "list-item" as const,
  }));
test("list-length detects its condition and accepts the corrected form", () => {
  expect(check(document(...list(7)))).toHaveLength(1);
  expect(check(document(...list(6)))).toEqual([]);
  // A paragraph ends the run, so two short lists stay separate.
  expect(
    check(document(...list(4), paragraph("p", "Break."), ...list(4, "j"))),
  ).toEqual([]);
  const grown = lintDocument(document(...list(8)), {
    phase: "complete",
    baseline: document(...list(7)),
  }).findings.find((f) => f.ruleId === "structure.list-length");
  expect(grown?.introduced).toBe(true);
});
test("Process Outline levels count steps, not notes", () => {
  const outline = (steps: number, notes: number): DocBlock => ({
    id: "outline",
    type: "process-outline",
    children: [],
    props: {
      steps: [
        {
          text: "Run the release",
          steps: [
            ...Array.from({ length: steps }, (_, i) => ({ text: `Step ${i}` })),
            ...Array.from({ length: notes }, (_, i) => ({
              text: `Note ${i}`,
              kind: "note",
            })),
          ],
        },
      ],
    },
  });
  expect(check(document(outline(7, 0)))).toHaveLength(1);
  expect(check(document(outline(6, 3)))).toEqual([]);
});
