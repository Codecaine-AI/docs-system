import { describe, expect, it } from "bun:test";
import { highlightCode } from "../components/code/highlight";
import { withWrapPoints } from "../components/code/wrap-points";

/** The text a reader sees and copies: the HTML with its tags removed. */
const text = (html: string) => html.replace(/<[^>]*>/g, "");

describe("withWrapPoints", () => {
  it("keeps a line's text exactly, so copying a wrapped line gives the source", () => {
    for (const line of [
      'const url = fileURLToPath(new URL("./x.ts", import.meta.url));',
      '  throw new Error(`Component action "${def.action}" must have a non-empty verb.`);',
      "/* Explicit --workspace and docs_discover remain available. */",
    ]) {
      const [html] = highlightCode(line, "ts");
      expect(text(withWrapPoints(html!))).toBe(text(html!));
    }
  });

  it("lets a long unspaced run break after . ( , [ { and never inside a name", () => {
    const html = withWrapPoints("fileURLToPath(new URL(x,import.meta.url))");
    expect(html).toBe("fileURLToPath(<wbr>new URL(<wbr>x,<wbr>import.<wbr>meta.<wbr>url))");
  });

  it("keeps hyphenated words and short string literals on one row", () => {
    expect(withWrapPoints("a non-empty verb and --workspace")).toBe(
      'a <span class="whitespace-pre">non-empty</span> verb and <span class="whitespace-pre">--workspace</span>',
    );
    expect(withWrapPoints('<span class="hljs-string">&quot;, &quot;</span>')).toBe('<span class="hljs-string whitespace-pre">&quot;, &quot;</span>');
  });

  it("keeps the spaces of a short string as written while it keeps the string on one row", () => {
    const [html] = highlightCode('const gap = "  ";', "ts");
    const wrapped = withWrapPoints(html!);
    expect(wrapped).toContain('<span class="hljs-string whitespace-pre">&quot;  &quot;</span>');
    expect(text(wrapped)).toBe(text(html!));
  });
});
