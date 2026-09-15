import { expect, test } from "bun:test";
import { lintDocument } from "../lint";
import { document, paragraph } from "../lint/fixtures";
import type { DocBlock } from "../doc-schema";
const writing = (...blocks: DocBlock[]) =>
  lintDocument(document(paragraph("intro", "Page introduction."), ...blocks), {
    phase: "complete",
  }).findings.filter((f) => f.ruleId.startsWith("writing."));
test("inline code and references separate prose, formatting does not", () => {
  const p = paragraph("p", "");
  p.text = [
    { insert: "In " },
    { insert: "order", attributes: { bold: true } },
    { insert: " to save." },
  ];
  expect(writing(p).map((f) => f.ruleId)).toEqual(["writing.filler"]);
  p.text = [
    { insert: "In " },
    { insert: "literal —", attributes: { code: true } },
    { insert: "order to save." },
  ];
  expect(writing(p)).toEqual([]);
  p.text = [
    {
      insert: "symbol —",
      attributes: { reference: { kind: "doc", path: "example" } as never },
    },
  ];
  expect(writing(p)).toEqual([]);
});
test("code, quoted examples and embedded payloads are excluded", () => {
  const quote = {
    ...paragraph("q", "Quoted — text."),
    type: "quote" as const,
    children: ["child"],
  };
  const doc = document(
    paragraph("intro", "Introduction."),
    quote,
    { ...paragraph("c", "Code — literal."), type: "code" },
    {
      id: "canvas",
      type: "canvas",
      props: {
        title: "Canvas title",
        data: { description: "Embedded — prose" },
      },
      children: [],
    },
    {
      id: "sequence",
      type: "sequence",
      props: { data: { title: "Embedded — title" } },
      children: [],
    },
  );
  doc.blocks.child = paragraph("child", "Quoted — child.");
  expect(
    lintDocument(doc, { phase: "complete" }).findings.filter((f) =>
      f.ruleId.startsWith("writing."),
    ),
  ).toEqual([]);
});
test("doc-authored descriptions are included, source paths and example literals excluded", () => {
  const b: DocBlock = {
    id: "shape",
    type: "state-shape",
    children: [],
    props: {
      name: "Type—Name",
      description: "Shape — description.",
      source: { path: "path—literal" },
      example: '{"value":"literal—value"}',
      fields: [
        {
          name: "field—name",
          type: "literal—type",
          description: "Field — description.",
          fields: [{ name: "nested", description: "Nested — description." }],
        },
      ],
    },
  };
  expect(writing(b).map((f) => f.field)).toEqual([
    "props.description",
    "props.fields[0].description",
    "props.fields[0].fields[0].description",
  ]);
});
test("authored component fields cover table, files, operations, steps, media and callouts", () => {
  const block = (
    id: string,
    type: DocBlock["type"],
    props: Record<string, unknown>,
  ): DocBlock => ({ id, type, props, children: [] });
  const findings = writing(
    block("table", "structured-table", {
      columns: ["Name"],
      rows: [["Value — description."]],
    }),
    block("file", "file-tree", {
      entries: [{ path: "a—b", note: "File — note." }],
    }),
    block("op", "interaction-surface", {
      operations: [
        {
          name: "op—name",
          description: "Operation — description.",
          params: [{ description: "Param — description." }],
        },
      ],
    }),
    block("step", "process-outline", { steps: [{ text: "Run — step." }] }),
    block("image", "image", { src: "a—b", alt: "Image — description." }),
    block("video", "video", { url: "a—b", caption: "Video — caption." }),
    block("callout", "callout", { title: "Callout — title." }),
  );
  expect(findings).toHaveLength(8);
});
test("plain-string code markup is excluded; document title is authored prose", () => {
  const doc = document(paragraph("p", "Use `a—b` here."));
  doc.title = "Title — prose";
  expect(
    lintDocument(doc, { phase: "complete" }).blocking.map((f) => f.field),
  ).toEqual(["title"]);
});
test("dense paragraph is advisory", () => {
  expect(
    writing(paragraph("p", Array(121).fill("word").join(" "))).map((f) => [
      f.ruleId,
      f.severity,
    ]),
  ).toEqual([["writing.dense-paragraph", "warning"]]);
});
test("malformed optional component items are left for schema validation", () => {
  const block: DocBlock = {
    id: "shape",
    type: "state-shape",
    props: { fields: [null, 42, { fields: [null] }] },
    children: [],
  };
  expect(() => writing(block)).not.toThrow();
});

test("Canvas and Sequence wrapper titles are doc-authored prose", () => {
  const make = (type: "canvas" | "sequence"): DocBlock => ({
    id: type,
    type,
    props: { title: "Wrapper — title.", src: "path—literal" },
    children: [],
  });
  expect(writing(make("canvas"), make("sequence")).map((f) => f.field)).toEqual(
    ["props.title", "props.title"],
  );
});
