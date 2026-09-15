import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageGrid } from "../components/rich-text/image-grid";
import { checkStateProps } from "../../../docs-model/src/components/validate";
import { docToPM, pmToDoc } from "../editor/core/convert";
import { projectToMarkdown } from "../../../docs-model/src/project-markdown";
import type { DocDocument } from "../../../docs-model/src/doc-schema";

const images = Array.from({ length: 6 }, (_, i) => ({ src: `./assets/images/${i}.png`, heading: `Variant ${i}`, alt: `Image variant ${i}`, caption: `Result ${i}` }));
const doc: DocDocument = { schemaVersion: 1, id: "test", title: "Comparison", root: "root", blocks: {
  root: { id: "root", type: "paragraph", props: {}, children: ["grid"] },
  grid: { id: "grid", type: "image-grid", props: { images, columns: 3 }, children: [] },
} };

describe("image-only grid", () => {
  it("accepts variable image counts and rejects text columns or invalid configuration", () => {
    for (const columns of ["auto", 1, 2, 3, 4]) expect(checkStateProps("image-grid", { images, columns })).toEqual([]);
    expect(checkStateProps("image-grid", { images: [] })).toEqual([]);
    for (const props of [{ images, columns: 0 }, { images, columns: 5 }, { images, columns: 2.5 }, { images: [{ text: "Not a column" }] }, { images: [{ src: "" }] }]) expect(checkStateProps("image-grid", props).length).toBeGreaterThan(0);
  });
  it("renders headings before images, captions after, and resolves every asset without download UI", () => {
    const html = renderToStaticMarkup(createElement(ImageGrid, { images, columns: 3, resolveAssetSrc: src => `/published/${src.split('/').pop()}` }));
    expect(html.match(/<img /g)).toHaveLength(6);
    expect(html).toContain('src="/published/5.png"');
    expect(html).toContain('alt="Image variant 0"');
    expect(html.indexOf('>Variant 0<')).toBeLessThan(html.indexOf('<img'));
    expect(html.indexOf('>Result 0<')).toBeGreaterThan(html.indexOf('<img'));
    expect(html).not.toContain('download');
    expect(html).not.toContain('<button');
  });
  it("preserves all grid fields through editor serialization and searchable projection", () => {
    expect(pmToDoc(docToPM(doc), doc, () => "new").blocks.grid).toEqual(doc.blocks.grid);
    const text = projectToMarkdown(doc);
    for (const image of images) for (const field of Object.values(image)) expect(text).toContain(field);
  });
});
