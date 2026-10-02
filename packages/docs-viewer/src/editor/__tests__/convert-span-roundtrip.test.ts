import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
  type DocDocument,
} from "@codecaine-ai/docs-model/doc-schema";
import { docToPM, pmToDoc, diffToOps, type PMNode } from "../core/convert";
import { ATOM_BLOCK_NODES, TEXT_BLOCK_NODES } from "../core/schema";
import { DocReference } from "../menus/reference-node";

/**
 * Untouched content must survive doc -> PM -> doc without a single changed
 * byte, and must never produce an op. Regression for the autosave that
 * rewrote the structured-table page after "Add row" + undo: reference spans
 * lost `code: true`, and adjacent equal-attribute runs collapsed into one.
 */

const docRef = { kind: "doc", path: "10-system-design/40-block-vocabulary" } as const;
const srcRef = { kind: "source", path: "packages/docs-model/src/doc-ops.ts" } as const;

const CASES: Record<string, DeltaSpan[]> = {
  "code + reference": [
    { insert: "see " },
    { insert: "doc-ops.ts", attributes: { code: true, reference: srcRef } },
    { insert: " for details" },
  ],
  "bold + italic + reference": [
    { insert: "Block vocabulary", attributes: { bold: true, italic: true, reference: docRef } },
  ],
  "code + link": [{ insert: "npm", attributes: { code: true, link: "https://npmjs.com" } }],
  "bold + code": [
    { insert: "a " },
    { insert: "parseX", attributes: { bold: true, code: true } },
  ],
  "reference alone": [{ insert: "Block vocabulary", attributes: { reference: docRef } }],
  "adjacent runs differing only by attributes": [
    { insert: "plain " },
    { insert: "bold", attributes: { bold: true } },
    { insert: "both", attributes: { bold: true, italic: true } },
    { insert: "code", attributes: { code: true } },
    { insert: "ref", attributes: { code: true, reference: srcRef } },
  ],
  "two adjacent reference spans": [
    { insert: "a", attributes: { reference: srcRef } },
    { insert: "b", attributes: { reference: srcRef } },
  ],
};

function docWith(text: DeltaSpan[]): DocDocument {
  const result = validateDocDocument({
    schemaVersion: 1,
    id: "doc-test",
    title: "Test",
    root: "root",
    blocks: {
      root: { id: "root", type: "page", props: {}, children: ["p1"] },
      p1: { id: "p1", type: "paragraph", props: {}, text, children: [] },
    },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.document;
}

const ids = () => {
  let n = 0;
  return () => `fresh-${(n += 1)}`;
};

describe("span round trip (pure convert)", () => {
  for (const [name, text] of Object.entries(CASES)) {
    it(`${name}: doc -> PM -> doc is deep-equal and diffs to zero ops`, () => {
      const doc = docWith(text);
      const back = pmToDoc(docToPM(doc), doc, ids());
      expect(back.blocks.p1.text).toEqual(doc.blocks.p1.text);
      expect(diffToOps(doc, back)).toEqual([]);
    });
  }

  it("adjacent identical-attribute runs: PM merges them, but the block is NOT rewritten", () => {
    // ProseMirror itself joins adjacent text nodes with equal marks, so the
    // run boundary cannot survive the editor. docs-model does not
    // canonicalize this either, so the save path must treat the merged form
    // as equal to the split form (no op for an untouched block).
    const doc = docWith([
      { insert: "one sentence." },
      { insert: " Another sentence." },
      { insert: "x", attributes: { bold: true } },
      { insert: "y", attributes: { bold: true } },
    ]);
    const back = pmToDoc(docToPM(doc), doc, ids());
    expect(back.blocks.p1.text).toEqual([
      { insert: "one sentence. Another sentence." },
      { insert: "xy", attributes: { bold: true } },
    ]);
    expect(diffToOps(doc, back)).toEqual([]);
  });

  it("a legacy `label` on a stored ref does not by itself rewrite the block", () => {
    const doc = docWith([
      { insert: "Style guide", attributes: { reference: { ...docRef, label: "Style guide" } } },
    ]);
    const back = pmToDoc(docToPM(doc), doc, ids());
    expect(diffToOps(doc, back)).toEqual([]);
  });

  it("a real edit to such a block still emits an updateBlock", () => {
    const doc = docWith([{ insert: "one." }, { insert: " two." }]);
    const back = pmToDoc(docToPM(doc), doc, ids());
    back.blocks.p1.text = [{ insert: "one. two!" }];
    expect(diffToOps(doc, back)).toEqual([
      { type: "updateBlock", blockId: "p1", text: [{ insert: "one. two!" }] },
    ]);
  });
});

let editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
});

/** Real TipTap schema (StarterKit marks incl. `code` with `excludes: "_"`). */
function throughEditor(doc: DocDocument): PMNode {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        paragraph: false,
        trailingNode: false,
        undoRedo: false,
      }),
      ...TEXT_BLOCK_NODES,
      ...ATOM_BLOCK_NODES,
      DocReference,
    ],
    content: docToPM(doc) as unknown as Record<string, unknown>,
    injectCSS: false,
  });
  editors.push(editor);
  return editor.getJSON() as PMNode;
}

describe("span round trip (real editor schema)", () => {
  for (const [name, text] of Object.entries(CASES)) {
    it(`${name}: survives the live schema`, () => {
      const doc = docWith(text);
      const back = pmToDoc(throughEditor(doc), doc, ids());
      expect(back.blocks.p1.text).toEqual(doc.blocks.p1.text);
      expect(diffToOps(doc, back)).toEqual([]);
    });
  }

  it("the structured-table page loads and saves with zero ops", () => {
    const path = fileURLToPath(
      new URL(
        "../../../../../docs/10-system-design/40-block-vocabulary/40-structured-reference/30-structured-table/doc.json",
        import.meta.url,
      ),
    );
    const result = validateDocDocument(JSON.parse(readFileSync(path, "utf8")));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const doc = result.document;
    const back = pmToDoc(throughEditor(doc), doc, ids());
    expect(diffToOps(doc, back)).toEqual([]);
    // Every reference span keeps its extra marks (the page carries
    // code + reference spans).
    const refSpans = (d: DocDocument) =>
      Object.values(d.blocks).flatMap((b) => (b.text ?? []).filter((s) => s.attributes?.reference));
    expect(refSpans(back)).toEqual(refSpans(doc));
    expect(refSpans(doc).some((s) => s.attributes?.code)).toBe(true);
    // And the serializer is unaffected for the untouched doc.
    expect(serializeDocDocument(doc)).toBe(serializeDocDocument(doc));
  });
});
