import { describe, expect, it } from "bun:test";
import { generateHTML, generateJSON, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ATOM_BLOCK_NODES, TEXT_BLOCK_NODES } from "../core/schema";
import { DocReference } from "../menus/reference-node";

/**
 * Copy/paste (clipboard HTML) round-trip coverage. ProseMirror serializes a
 * copied slice through the schema's `toDOM` (each node's renderHTML) and
 * parses pasted HTML through the schema's parse rules — `generateHTML` /
 * `generateJSON` exercise exactly those two surfaces, with no editor view or
 * node views involved, so these tests pin the real clipboard data path.
 *
 * Regression suite for the "[object Object]" incident: object-valued attrs
 * (the reference chip's SpectreRef, `blockProps`, atom `blockText`) must be
 * JSON-encoded into data attributes on copy and defensively parsed on paste —
 * TipTap's default attribute handling stringified them to "[object Object]",
 * which corrupted the saved doc.json and made the bundle fail validation.
 */

const EXTENSIONS = [
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
];

/** Serializes PM JSON to clipboard HTML and parses it back through the schema — the copy→paste data path. */
function roundTrip(content: JSONContent[]): JSONContent {
  const html = serialize(content);
  return generateJSON(html, EXTENSIONS);
}

function serialize(content: JSONContent[]): string {
  return generateHTML({ type: "doc", content }, EXTENSIONS);
}

function findNodes(node: JSONContent, type: string, out: JSONContent[] = []): JSONContent[] {
  if (node.type === type) out.push(node);
  for (const child of node.content ?? []) findNodes(child, type, out);
  return out;
}

function collectText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(collectText).join("");
}

function wrapper(inline: JSONContent[]): JSONContent {
  return { type: "docBlockText", content: inline };
}

function paragraph(inline: JSONContent[]): JSONContent {
  return { type: "docParagraph", attrs: { blockId: "p1", blockProps: {} }, content: [wrapper(inline)] };
}

describe("clipboard HTML: list markers", () => {
  it("serializes empty CSS-driven markers and the matching ordered/bullet item attribute", () => {
    const unordered = serialize([
      {
        type: "docListItem",
        attrs: { blockId: "li-unordered", blockProps: {}, ordered: null },
        content: [wrapper([{ type: "text", text: "Unordered item" }])],
      },
    ]);
    expect(unordered).toContain('data-doc-bullet="true"');
    expect(unordered).not.toContain('data-doc-ordered="true"');
    expect(unordered).not.toContain("•");
    expect(unordered).toMatch(/<span[^>]*data-doc-list-marker="true"[^>]*><\/span>/);
    expect(collectText(generateJSON(unordered, EXTENSIONS))).toBe("Unordered item");

    const ordered = serialize([
      {
        type: "docListItem",
        attrs: { blockId: "li-ordered", blockProps: {}, ordered: true },
        content: [wrapper([{ type: "text", text: "Ordered item" }])],
      },
    ]);
    expect(ordered).toContain('data-doc-ordered="true"');
    expect(ordered).not.toContain('data-doc-bullet="true"');
    expect(ordered).not.toContain("•");
    expect(ordered).toMatch(/<span[^>]*data-doc-list-marker="true"[^>]*><\/span>/);
    expect(collectText(generateJSON(ordered, EXTENSIONS))).toBe("Ordered item");
  });
});

describe("clipboard round-trip: reference chip", () => {
  it("preserves kind/path/label (and symbol/line) through copy HTML", () => {
    const docRef = { kind: "doc", path: "docs/00-foundation/00-manifesto", label: "Manifesto" };
    const sourceRef = { kind: "source", path: "src/editor/core/convert.ts", symbol: "pmToDoc", line: 348 };
    const back = roundTrip([
      paragraph([
        { type: "text", text: "See " },
        { type: "docReference", attrs: { ref: docRef, label: "Manifesto" } },
        { type: "text", text: " and " },
        { type: "docReference", attrs: { ref: sourceRef, label: "pmToDoc" } },
      ]),
    ]);

    const chips = findNodes(back, "docReference");
    expect(chips.length).toBe(2);
    expect(chips[0].attrs?.ref).toEqual(docRef);
    expect(chips[0].attrs?.label).toBe("Manifesto");
    expect(chips[1].attrs?.ref).toEqual(sourceRef);
    expect(chips[1].attrs?.label).toBe("pmToDoc");
  });

  it('parses a legacy ref="[object Object]" span as plain text, never a chip', () => {
    // HTML shape produced by the pre-fix serializer: the marker attribute but
    // no JSON payload, and the attrs object collapsed to "[object Object]".
    const back = generateJSON(
      '<p><span data-doc-reference="true" ref="[object Object]" label="Manifesto">Manifesto</span> ok</p>',
      EXTENSIONS,
    );
    expect(findNodes(back, "docReference")).toEqual([]);
    expect(collectText(back)).toBe("Manifesto ok");
  });
});

describe("clipboard round-trip: block props", () => {
  it("preserves callout tone AND title", () => {
    const props = { tone: "info", title: "The contract: both surfaces read true" };
    const back = roundTrip([
      {
        type: "docCallout",
        attrs: { blockId: "c1", blockProps: props },
        content: [wrapper([{ type: "text", text: "Body copy" }])],
      },
    ]);

    const callouts = findNodes(back, "docCallout");
    expect(callouts.length).toBe(1);
    expect(callouts[0].attrs?.blockProps).toEqual(props);
    expect(collectText(callouts[0])).toBe("Body copy");
  });

  it("preserves code language and unpromoted props, and image src/caption", () => {
    const codeProps = { annotations: [{ line: 1, note: "entry" }] };
    const imageProps = { src: "assets/diagram.png", caption: "The diagram" };
    const back = roundTrip([
      {
        type: "docCodeBlock",
        attrs: { blockId: "code1", blockProps: codeProps, language: "typescript" },
        content: [{ type: "text", text: "const x = 1;" }],
      },
      { type: "docImage", attrs: { blockId: "img1", blockProps: imageProps } },
    ]);

    const code = findNodes(back, "docCodeBlock")[0];
    expect(code.attrs?.language).toBe("typescript");
    expect(code.attrs?.blockProps).toEqual(codeProps);
    const image = findNodes(back, "docImage")[0];
    expect(image.attrs?.blockProps).toEqual(imageProps);
  });

  it("preserves an atom block's text payload", () => {
    const spans = [{ insert: "src/index.ts" }];
    const back = roundTrip([
      { type: "docFileTree", attrs: { blockId: "ft1", blockProps: {}, blockText: spans } },
    ]);
    expect(findNodes(back, "docFileTree")[0].attrs?.blockText).toEqual(spans);
  });

  it("parses malformed data attributes back to safe defaults", () => {
    const back = generateJSON(
      '<div data-doc-type="callout" data-block-props="[object Object]">' +
        '<span data-doc-node="docBlockText">Body</span>' +
        "</div>" +
        '<div data-doc-node="docFileTree" data-block-props="{not json" data-block-text="[object Object]"></div>',
      EXTENSIONS,
    );
    const callout = findNodes(back, "docCallout")[0];
    expect(callout.attrs?.blockProps).toEqual({});
    const fileTree = findNodes(back, "docFileTree")[0];
    expect(fileTree.attrs?.blockProps).toEqual({});
    expect(fileTree.attrs?.blockText).toBe(null);
  });
});
