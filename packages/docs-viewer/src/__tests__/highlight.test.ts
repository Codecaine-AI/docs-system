import { describe, expect, it } from "bun:test";
import { highlightCode, prettyPrintIfJson } from "../components/code/highlight";

/** Strip all tags — recovers the (still HTML-escaped) text of a line. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function countMatches(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

describe("highlightCode", () => {
  it("returns exactly one entry per input line, even across multiline tokens", () => {
    const code = [
      "const s = `first",
      "second ${x}",
      "third`;",
      "/* comment",
      "   still comment */",
      "const n = 1;",
    ].join("\n");
    const lines = highlightCode(code, "ts");
    expect(lines.length).toBe(code.split("\n").length);
    // Joining the stripped lines reproduces the input text (escaped-neutral
    // here: this code contains no HTML-special chars beyond none).
    expect(lines.map(stripTags).join("\n")).toBe(code);
  });

  it("keeps every line's spans balanced and re-opens crossing spans per line", () => {
    const code = ["const s = `first", "second ${x}", "third`;", "/* comment", "still */"].join(
      "\n",
    );
    const lines = highlightCode(code, "ts");
    for (const line of lines) {
      expect(countMatches(line, /<span/g)).toBe(countMatches(line, /<\/span>/g));
    }
    // Continuation lines of the template string re-open the string span...
    expect(lines[1].startsWith('<span class="hljs-string">')).toBe(true);
    expect(lines[2].startsWith('<span class="hljs-string">')).toBe(true);
    // ...and the block comment's continuation re-opens the comment span.
    expect(lines[4].startsWith('<span class="hljs-comment">')).toBe(true);
    // The first template-string line closes its still-open span at line end.
    expect(lines[0].endsWith("</span>")).toBe(true);
  });

  it("resolves language aliases (ts, js, sh, html, yml, jsonc)", () => {
    expect(highlightCode("const a = 1;", "ts")[0]).toContain("hljs-keyword");
    expect(highlightCode("const a = 1;", "js")[0]).toContain("hljs-keyword");
    expect(highlightCode("echo hi", "sh")[0]).toContain("hljs-built_in");
    expect(highlightCode("<div>x</div>", "html")[0]).toContain("hljs-tag");
    expect(highlightCode("key: value", "yml")[0]).toContain("hljs-attr");
    expect(highlightCode('{"a": 1}', "jsonc")[0]).toContain("hljs-attr");
  });

  it("highlights undeclared-language JSON via the cheap sniff", () => {
    const lines = highlightCode('{"key": [1, true, null]}');
    expect(lines[0]).toContain("hljs-attr");
    expect(lines[0]).toContain("hljs-number");
  });

  it("falls back to escaped plain lines for unknown languages", () => {
    const lines = highlightCode("a < b && c > 'd'", "klingon");
    expect(lines).toEqual(["a &lt; b &amp;&amp; c &gt; &#x27;d&#x27;"]);
  });

  it("never emits unescaped input (XSS)", () => {
    const nasty = '<script>alert("x")</script>\n<img src=x onerror=alert(1)>';
    for (const language of [undefined, "html", "ts", "klingon"]) {
      const joined = highlightCode(nasty, language).join("\n");
      expect(joined).not.toContain("<script");
      expect(joined).not.toContain("<img");
    }
  });

  it("preserves empty lines (count and content)", () => {
    const lines = highlightCode("const a = 1;\n\nconst b = 2;", "ts");
    expect(lines.length).toBe(3);
    expect(stripTags(lines[1])).toBe("");
  });
});

describe("prettyPrintIfJson", () => {
  it("pretty-prints one-liner JSON when the language is json/jsonc", () => {
    expect(prettyPrintIfJson('{"a":1,"b":[true,null]}', "json")).toBe(
      '{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}',
    );
    expect(prettyPrintIfJson("[1,2]", "jsonc")).toBe("[\n  1,\n  2\n]");
  });

  it("pretty-prints undeclared-language text that parses as a JSON object/array", () => {
    expect(prettyPrintIfJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    // Bare scalars are NOT treated as JSON without a declared language.
    expect(prettyPrintIfJson("42")).toBe("42");
    expect(prettyPrintIfJson('"hello"')).toBe('"hello"');
  });

  it("passes through non-JSON, invalid JSON, and other declared languages", () => {
    expect(prettyPrintIfJson("const a = 1;", "ts")).toBe("const a = 1;");
    expect(prettyPrintIfJson("{not json}", "json")).toBe("{not json}");
    // jsonc that actually uses comments can't JSON.parse — unchanged.
    expect(prettyPrintIfJson('{"a": 1} // note', "jsonc")).toBe('{"a": 1} // note');
    // JSON-looking text under a non-json language is left alone.
    expect(prettyPrintIfJson('{"a": 1}', "python")).toBe('{"a": 1}');
    expect(prettyPrintIfJson("", "json")).toBe("");
  });

  it("is display-only stable: already-pretty JSON round-trips to the same form", () => {
    const pretty = '{\n  "a": 1\n}';
    expect(prettyPrintIfJson(pretty, "json")).toBe(pretty);
  });
});
