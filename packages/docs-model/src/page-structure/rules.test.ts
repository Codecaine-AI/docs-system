import { expect, test } from "bun:test";
import { lintDocument } from "../lint";
import { document, paragraph } from "../lint/fixtures";
const heading = (id: string, level: number) => ({
  ...paragraph(id, id),
  type: "heading" as const,
  props: { level },
});
test("empty drafts are allowed; complete body reports missing opener", () => {
  expect(lintDocument(document(), { phase: "draft" }).blocking).toEqual([]);
  expect(
    lintDocument(document(), { phase: "complete" }).findings.map(
      (f) => f.ruleId,
    ),
  ).toEqual(["structure.opening-paragraph"]);
  expect(
    lintDocument(
      document(heading("title", 1), paragraph("p", "Introduction.")),
      { phase: "complete" },
    ).blocking,
  ).toEqual([]);
});
test("multiple H1s are allowed; skipped heading levels still warn", () => {
  const report = lintDocument(
    document(
      paragraph("p", "Introduction."),
      heading("a", 1),
      heading("b", 1),
      heading("c", 3),
    ),
    { phase: "complete" },
  );
  expect(report.blocking).toEqual([]);
  expect(report.findings.map((f) => f.ruleId)).toEqual([
    "structure.heading-order",
  ]);
});
test("image alt is semantic and stable across regenerated IDs", () => {
  const image = {
    id: "image",
    type: "image" as const,
    props: { src: "image.png" },
    children: [],
  };
  const baseline = document(paragraph("p", "Introduction."), image);
  expect(
    lintDocument(baseline, { phase: "complete" }).findings.map((f) => f.ruleId),
  ).toEqual(["structure.image-alt"]);
  expect(
    lintDocument(
      document(paragraph("new", "Introduction."), {
        ...image,
        id: "new-image",
      }),
      { phase: "complete", baseline },
    ).blocking,
  ).toEqual([]);
});
test("deep list is warning only", () => {
  const doc = document(paragraph("p", "Introduction."), {
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
  const report = lintDocument(doc, { phase: "complete" });
  expect(report.blocking).toEqual([]);
  expect(report.findings.map((f) => f.ruleId)).toEqual(["structure.deep-list"]);
});
test("an existing missing opener stays existing when its title level changes", () => {
  const baseline = document(heading("title", 1));
  expect(
    lintDocument(document(heading("title", 2)), { phase: "complete", baseline })
      .blocking,
  ).toEqual([]);
});
