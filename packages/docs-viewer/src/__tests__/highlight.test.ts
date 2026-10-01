import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import {
  canonicalLanguage,
  highlightCode,
  highlightCodeTokens,
  prettyPrintIfJson,
  rehypeHljsRoles,
} from "../components/code/highlight";

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

describe("null literals carry hljs-null so --syntax-null reaches code blocks", () => {
  it("tags JSON null (nested keyword shape) but not true/false", () => {
    const [line] = highlightCode('{"a": null, "b": true, "c": false}', "json");
    expect(line).toContain(
      '<span class="hljs-literal hljs-null"><span class="hljs-keyword">null</span></span>',
    );
    expect(countMatches(line, /hljs-null/g)).toBe(1);
    expect(line).toContain('<span class="hljs-literal"><span class="hljs-keyword">true</span></span>');
    // The text itself is untouched.
    expect(stripTags(line)).toBe("{&quot;a&quot;: null, &quot;b&quot;: true, &quot;c&quot;: false}");
  });

  it("tags the direct-literal shape in ts, python and go", () => {
    expect(highlightCode("const a = null;", "ts")[0]).toContain(
      '<span class="hljs-literal hljs-null">null</span>',
    );
    expect(highlightCode("a = None", "python")[0]).toContain(
      '<span class="hljs-literal hljs-null">None</span>',
    );
    expect(highlightCode("var a = nil", "go")[0]).toContain(
      '<span class="hljs-literal hljs-null">nil</span>',
    );
    // Booleans and the word inside a string stay untagged.
    expect(highlightCode("const a = true;", "ts")[0]).not.toContain("hljs-null");
    expect(highlightCode('const a = "null";', "ts")[0]).not.toContain("hljs-null");
  });

  it("gives the editor's token ranges the same class, with offsets unchanged", () => {
    const code = '{"a": null}';
    const token = highlightCodeTokens(code, "json").find((entry) =>
      entry.className.includes("hljs-null"),
    );
    expect(token).toEqual({ from: 6, to: 10, className: "hljs-literal hljs-null hljs-keyword" });
    expect(code.slice(token!.from, token!.to)).toBe("null");
  });

  it("the stylesheet colors hljs-null from --syntax-null, after the literal rule", () => {
    const css = readFileSync(new URL("../styles/code.css", import.meta.url), "utf8");
    const nullRule = css.indexOf(".hljs-null,");
    expect(nullRule).toBeGreaterThan(css.indexOf(".hljs-literal,"));
    expect(css.slice(nullRule)).toMatch(
      /^\.hljs-null,\s*\.hljs-null \.hljs-keyword \{\s*color: var\(--syntax-null, /,
    );
  });
});

describe("control-flow keywords carry hljs-control so --syntax-control reaches them", () => {
  const CONTROL = '<span class="hljs-keyword hljs-control">';

  it("tags if/return/import/from in ts but not const/function", () => {
    const line = highlightCode(
      'import { a } from "b"; function f() { const x = 1; if (x) { return x; } }',
      "ts",
    )[0];
    for (const word of ["import", "from", "if", "return"]) {
      expect(line).toContain(`${CONTROL}${word}</span>`);
    }
    expect(line).toContain('<span class="hljs-keyword">const</span>');
    expect(line).toContain('<span class="hljs-keyword">function</span>');
    expect(countMatches(line, /hljs-control/g)).toBe(4);
  });

  it("leaves the word `if` inside strings and comments untagged", () => {
    const line = highlightCode('const s = "if return"; // if import', "ts")[0];
    expect(line).not.toContain("hljs-control");
    expect(stripTags(line)).toBe("const s = &quot;if return&quot;; // if import");
  });

  it("tags python's elif/raise and leaves def alone; SQL keywords stay plain", () => {
    const py = highlightCode("def f(x):\n    if x: raise E\n    elif y: pass", "python");
    expect(py[0]).not.toContain("hljs-control");
    expect(py[1]).toContain(`${CONTROL}if</span>`);
    expect(py[1]).toContain(`${CONTROL}raise</span>`);
    expect(py[2]).toContain(`${CONTROL}elif</span>`);
    expect(highlightCode("select a from t", "sql")[0]).not.toContain("hljs-control");
  });

  it("gives the editor's token ranges the class with exact offsets", () => {
    const code = 'if (a < "x") return b;';
    const tokens = highlightCodeTokens(code, "ts").filter((token) =>
      token.className.includes("hljs-control"),
    );
    expect(tokens).toEqual([
      { from: 0, to: 2, className: "hljs-keyword hljs-control" },
      { from: 13, to: 19, className: "hljs-keyword hljs-control" },
    ]);
    expect(tokens.map((token) => code.slice(token.from, token.to))).toEqual(["if", "return"]);
  });

  it("splits built-ins: types get hljs-type, callables stay plain built_in", () => {
    const line = highlightCode("const s: string = String(setTimeout(f));", "ts")[0];
    expect(line).toContain('<span class="hljs-built_in hljs-type">string</span>');
    expect(line).toContain('<span class="hljs-built_in">setTimeout</span>');
    expect(highlightCode("print(int(x))", "python")[0]).toContain(
      '<span class="hljs-built_in">print</span>(<span class="hljs-built_in hljs-type">int</span>',
    );
  });

  it("the stylesheet colors control keywords from --syntax-control", () => {
    const css = readFileSync(new URL("../styles/code.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.hljs-keyword\.hljs-control \{\s*color: var\(--syntax-control, /);
  });
});

describe("rehypeHljsRoles: markdown fenced code gets the same role classes", () => {
  const render = (markdown: string) =>
    renderToStaticMarkup(
      createElement(ReactMarkdown, { rehypePlugins: [rehypeHighlight, rehypeHljsRoles] }, markdown),
    );

  it("tags control keywords, built-in types and nulls, leaving strings and comments alone", () => {
    const html = render(
      '```ts\nimport { a } from "b";\nconst s: string = setTimeout(f) ?? null; // if\nif (s) return "if";\n```',
    );
    for (const word of ["import", "from", "if", "return"]) {
      expect(html).toContain(`<span class="hljs-keyword hljs-control">${word}</span>`);
    }
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain('<span class="hljs-built_in hljs-type">string</span>');
    expect(html).toContain('<span class="hljs-built_in">setTimeout</span>');
    expect(html).toContain('<span class="hljs-literal hljs-null">null</span>');
    expect(countMatches(html, /hljs-control/g)).toBe(4);
  });

  it("matches highlight.ts on the JSON null shape and skips SQL", () => {
    expect(render('```json\n{"a": null, "b": true}\n```')).toContain(
      '<span class="hljs-literal hljs-null"><span class="hljs-keyword">null</span></span>',
    );
    expect(render("```sql\nselect a from t\n```")).not.toContain("hljs-control");
  });
});

describe("canonicalLanguage", () => {
  it("maps grammar aliases to the picker's canonical names", () => {
    expect(canonicalLanguage("ts")).toBe("typescript");
    expect(canonicalLanguage(" YML ")).toBe("yaml");
    expect(canonicalLanguage("shell")).toBe("bash");
    expect(canonicalLanguage("typescript")).toBe("typescript");
  });

  it("returns null for unknown or missing languages", () => {
    expect(canonicalLanguage("cobol")).toBeNull();
    expect(canonicalLanguage(null)).toBeNull();
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
