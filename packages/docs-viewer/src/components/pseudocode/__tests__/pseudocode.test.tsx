import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockRenderContext } from "../../../render/block-registry";
import { descriptors } from "../descriptor";

const RENDER_CTX: DocBlockRenderContext = {
  renderText: () => null,
  renderChildren: () => null,
  renderMarkdown: () => null,
};

afterEach(() => {
  cleanup();
});

function renderPseudocode(text: string, props: Record<string, unknown> = {}) {
  const block: DocBlock = { id: "p", type: "pseudocode", props, text: [{ insert: text }], children: [] };
  render(<>{descriptors[0]!.render(block, RENDER_CTX)}</>);
  return [...document.querySelectorAll(".docs-pseudo-row")].map((row) => ({
    number: row.querySelector(".docs-pseudo-num")?.textContent,
    code: row.querySelector(".docs-pseudo-code")?.textContent,
    comment: row.querySelector(".docs-pseudo-comment")?.textContent ?? null,
    diff: row.getAttribute("data-code-diff"),
    html: row.innerHTML,
  }));
}

const PSEUDO = [
  "annotationLineRuns(lineCount, annotations)",
  "  for each annotation in annotations // walk the input",
  '    emit row(entry, "a // b") // one row per entry',
  "// a full-line comment stays in place",
  "else",
  "return rows",
].join("\n");

describe("pseudocode block", () => {
  it("keeps every character of every line without diff, with trailing comments in their own column", () => {
    const rows = renderPseudocode(PSEUDO);
    expect(rows.map((row) => row.number)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(rows.map((row) => [row.code, row.comment])).toEqual([
      ["annotationLineRuns(lineCount, annotations)", null],
      ["  for each annotation in annotations", "// walk the input"],
      ['    emit row(entry, "a // b")', "// one row per entry"],
      ["// a full-line comment stays in place", null],
      ["else", null],
      ["return rows", null],
    ]);
    expect(rows.every((row) => row.diff === null)).toBe(true);
  });

  it("highlights control words, calls, properties and arrows", () => {
    const [row] = renderPseudocode("for each line in entry.lines -> emit row(line)");
    expect(row.html).toContain('<span class="hljs-keyword hljs-control">each</span>');
    expect(row.html).toContain('<span class="hljs-property">lines</span>');
    expect(row.html).toContain('<span class="hljs-operator">-&gt;</span>');
    expect(row.html).toContain('<span class="hljs-title function_">row</span>');
  });

  it("reads the leading +/-/space column as diff marks only with diff on", () => {
    const code = [" keep()", "-old()", "+new()"].join("\n");
    expect(renderPseudocode(code, { diff: true }).map((row) => [row.diff, row.code])).toEqual([
      [null, "keep()"],
      ["del", "old()"],
      ["add", "new()"],
    ]);
    cleanup();
    expect(renderPseudocode(code).map((row) => [row.diff, row.code])).toEqual([
      [null, " keep()"],
      [null, "-old()"],
      [null, "+new()"],
    ]);
  });

  it("heads the panel with the pseudocode tile and label, and diffs with +/− signs whose strike skips the indent", () => {
    const code = [" keep()", "-  old(x) // gone", "+  new(x)"].join("\n");
    renderPseudocode(code, { diff: true });

    const header = document.querySelector("[data-code-header]")!;
    expect(header.querySelector("[data-code-tile]")?.getAttribute("data-code-tile")).toBe("pseudocode");
    expect(header.querySelector("[data-code-lang]")?.textContent).toBe("pseudocode");

    const row = (mark: string) => document.querySelector(`.docs-pseudo-row[data-code-diff="${mark}"]`)!;
    // A true minus sign (U+2212) pairs with the plus.
    expect(row("del").querySelector(".docs-pseudo-sign")?.textContent).toBe("\u2212");
    expect(row("add").querySelector(".docs-pseudo-sign")?.textContent).toBe("+");

    // The removed line's code cell: the bare indent, then everything after
    // it wrapped in .docs-pseudo-body (the strike target); the trailing
    // comment stays in its own column.
    const cell = row("del").querySelector(".docs-pseudo-code")!;
    expect(cell.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(cell.firstChild?.textContent).toBe("  ");
    const body = cell.querySelector(":scope > .docs-pseudo-body")!;
    expect(body.textContent).toBe("old(x)");
    expect(cell.lastElementChild).toBe(body);
    expect(row("del").querySelector(".docs-pseudo-comment")?.textContent).toBe("// gone");
  });

});
