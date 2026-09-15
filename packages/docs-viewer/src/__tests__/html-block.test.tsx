import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HtmlBlock, htmlEmbedDocument } from "../components/rich-text/html";
import { checkStateProps } from "../../../docs-model/src/components/validate";
import { docToPM, pmToDoc } from "../editor/core/convert";
import { mdxToDoc } from "../../../docs-cli/src/migrate/mdx-to-doc";

describe("portable HTML block", () => {
  it("keeps author HTML inside an opaque sandbox with scripts disabled by default", () => {
    const html = renderToStaticMarkup(createElement(HtmlBlock, { title: "Diagram", html: '<script>parent.document.body.remove()</script><svg><text>Hello</text></svg>' }));
    expect(html).toContain('sandbox=""');
    expect(html).toContain('title="Diagram"');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('allow-same-origin');
    expect(html).not.toContain('download');
  });
  it("enables only explicit sandbox scripts and constrains resources before author markup", () => {
    const raw = htmlEmbedDocument('<meta http-equiv="Content-Security-Policy" content="default-src *"><button onclick="this.textContent=42">Run</button>', true);
    expect(raw.indexOf("default-src 'none'")).toBeLessThan(raw.indexOf('default-src *'));
    expect(raw).toContain("script-src 'unsafe-inline'");
    expect(raw).toContain("img-src data:");
    expect(raw).toContain("connect-src 'none'");
    const rendered = renderToStaticMarkup(createElement(HtmlBlock, { html: raw, title: "Interactive diagram", allowScripts: true }));
    expect(rendered).toContain('sandbox="allow-scripts"');
    expect(rendered).not.toContain('allow-same-origin');
  });
  it("validates closed typed props and height limits", () => {
    expect(checkStateProps("html", { html: "<p>Hello</p>", title: "Hello", height: 400 })).toEqual([]);
    for (const invalid of [{ html: "", title: "", height: 10 }, { html: "", title: "", src: "external.html" }, { html: "", title: "", allowScripts: "yes" }]) {
      expect(checkStateProps("html", invalid).length).toBeGreaterThan(0);
    }
  });
  it("imports explicit Html components while ordinary HTML code examples remain code", () => {
    const source = '<Html title="My diagram" allowScripts="true" height="500">\n<style>p{color:red}</style><p>Hello</p>\n</Html>\n\n```html\n<p>Example only</p>\n```';
    const { doc, warnings } = mdxToDoc(source, "docs/example.mdx");
    const block = Object.values(doc.blocks).find(b => b.type === "html")!;
    expect(block.props).toEqual({ html: '<style>p{color:red}</style><p>Hello</p>', title: "My diagram", height: 500, allowScripts: true });
    expect(Object.values(doc.blocks).some(b => b.type === "code")).toBe(true);
    expect(warnings).toEqual([]);
    const roundTrip = pmToDoc(docToPM(doc), doc, () => "new-id");
    expect(roundTrip.blocks[block.id]).toEqual(block);
  });
});
