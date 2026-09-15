import { expect, test } from "bun:test";
import { document, paragraph } from "../../lint/fixtures";
import { lintDocument } from "../../lint";
import { titleHeadingFixOps } from "./index";
import { applyOps } from "../../doc-ops";
const heading = (id: string, text: string, level = 1) => ({ ...paragraph(id, text), type: "heading" as const, props: { level } });

test("only an opening H1 matching the title is a completion error", () => {
  const doc = { ...document(heading("h", "Provider Sync"), paragraph("p", "An introduction.")), title: "Provider Sync" };
  expect(lintDocument(doc, { phase: "complete" }).blocking.map(f => f.ruleId)).toEqual(["structure.title-heading"]);
  expect(lintDocument(doc, { phase: "draft" }).blocking).toEqual([]);
  expect(lintDocument({ ...doc, title: undefined }, { phase: "complete" }).blocking).toEqual([]);
});

test("fix removes the opening duplicate, reparents children, preserves other headings, and is undoable and idempotent", () => {
  const doc = { ...document(heading("h", "  Provider  Sync "), heading("section", "Operation")), title: "Provider Sync" };
  doc.blocks.h.children = ["child"];
  doc.blocks.child = paragraph("child", "Keep this content.");
  const result = applyOps(doc, titleHeadingFixOps(doc));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.doc.blocks.h).toBeUndefined();
  expect(result.doc.blocks.root.children).toEqual(["child", "section"]);
  expect(result.doc.blocks.child.text).toEqual(doc.blocks.child.text);
  expect(result.doc.blocks.section.props.level).toBe(1);
  expect(titleHeadingFixOps(result.doc)).toEqual([]);
  const undo = applyOps(result.doc, result.inverse);
  expect(undo.ok && undo.doc).toEqual(doc);
});

test("non-opening repeated headings and untitled docs are unchanged", () => {
  const doc = { ...document(paragraph("p", "Intro"), heading("h", "Title")), title: "Title" };
  expect(titleHeadingFixOps(doc)).toEqual([]);
  expect(lintDocument(doc, { phase: "complete" }).blocking).toEqual([]);
  expect(titleHeadingFixOps({ ...doc, title: "" })).toEqual([]);
});

test("a distinct opening H1 and multiple body H1s are preserved by title cleanup", () => {
  const doc = { ...document(heading("a", "First Section"), heading("b", "Second Section")), title: "Page Title" };
  expect(titleHeadingFixOps(doc)).toEqual([]);
  expect(lintDocument(doc, { phase: "complete" }).findings.filter(f => f.ruleId === "structure.title-heading")).toEqual([]);
});
