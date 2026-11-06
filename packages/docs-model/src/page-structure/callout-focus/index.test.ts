import { expect, test } from "bun:test";
import { calloutFocusRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocBlock, DocDocument } from "../../doc-schema";

const check = (doc: DocDocument) => calloutFocusRule.check({ document: doc, blocks: orderedBlocks(doc) });
const callout = (id: string, body: string, props: Record<string, unknown> = {}): DocBlock => ({ ...paragraph(id, body), type: "callout", props: { tone: "warning", ...props } });
const fields = (doc: DocDocument) => check(doc).map((m) => `${m.blockId} ${m.field}`);

test("flags a title that repeats the printed label", () => {
  const doc = document(callout("c", "Place a feature in docs-viewer when every host needs it.", { tone: "decision", title: "Decided: Place a Feature by Who Wants It" }));
  expect(fields(doc)).toEqual(["c props.title"]);
});

test("flags a title that repeats the body's first sentence", () => {
  const doc = document(callout("c", "The service refuses content writes until the task reads the style guidance.", { title: "Content writes wait for the style read" }));
  expect(fields(doc)).toEqual(["c props.title"]);
});

test("accepts a title that names a fact the body does not state, and a callout with no title", () => {
  expect(check(document(callout("c", "The sweep function works in memory only. It returns the changes for each page.", { tone: "info", title: "A sweep changes nothing on disk" })))).toEqual([]);
  expect(check(document(callout("c", "Never read doc.json directly.")))).toEqual([]);
});

test("flags a body of more than two sentences, counting nested paragraphs", () => {
  const long = callout("c", "Place a feature by who wants it. Rendering belongs to the viewer.");
  const doc = { ...document(long), blocks: { ...document(long).blocks, c: { ...long, children: ["p"] }, p: paragraph("p", "Saving belongs to the host.") } };
  expect(fields(doc)).toEqual(["c text"]);
  expect(check(document(callout("c", "Place a feature by who wants it. Rendering belongs to the viewer.")))).toEqual([]);
});

test("a title that opens with another tone's word, or with a tone word under a kind, passes", () => {
  expect(check(document(callout("c", "The rate counts runs that end with an accepted page.", { tone: "info", title: "Success rate per round" })))).toEqual([]);
  expect(check(document(callout("c", "Two lanes may touch the theme file.", { tone: "warning", kind: "Boundary under review", title: "Warning lights on shared files" })))).toEqual([]);
});
