import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { HTML_FRAME_BRIDGE, HTML_FRAME_BRIDGE_HASH, fitHtmlScale } from "../components/rich-text/html-frame";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HtmlBlock, htmlEmbedDocument } from "../components/rich-text/html";
import { checkStateProps } from "../../../docs-model/src/components/validate";
import { docToPM, pmToDoc } from "../editor/core/convert";
import { mdxToDoc } from "../../../docs-cli/src/migrate/mdx-to-doc";

describe("portable HTML block", () => {
  it("keeps author HTML inside an opaque sandbox with scripts disabled by default", () => {
    const html = renderToStaticMarkup(createElement(HtmlBlock, { title: "Diagram", html: '<script>parent.document.body.remove()</script><svg><text>Hello</text></svg>' }));
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).toContain('sha256-');
    expect(htmlEmbedDocument('<script>bad()</script>')).not.toContain("script-src 'unsafe-inline'");
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

 describe("HTML sizing policy", () => {
  it("authorizes only the exact measurement bridge when author scripts are disabled", () => {
    expect(createHash("sha256").update(HTML_FRAME_BRIDGE).digest("base64")).toBe(HTML_FRAME_BRIDGE_HASH);
    const source = htmlEmbedDocument('<button onclick="bad()">Run</button>');
    expect(source).toContain(`script-src 'sha256-${HTML_FRAME_BRIDGE_HASH}'`);
    expect(source.indexOf('Content-Security-Policy')).toBeLessThan(source.indexOf('<script>'));
  });
  it("fits both axes without enlarging small content", () => {
    expect(fitHtmlScale(1600, 1000, 800, 600)).toBe(0.5);
    expect(fitHtmlScale(800, 2000, 800, 600)).toBe(0.3);
    expect(fitHtmlScale(200, 100, 800, 600)).toBe(1);
  });
});
