"use client";

import { describe, expect, it } from "bun:test";
import type { Static, TObject } from "@sinclair/typebox";
import type { DocBlock } from "../../../doc-schema";
import { checkParams } from "../../define";
import type { ComponentActionResult, ComponentAction } from "../../types";
import { insertLine } from "../actions/insert-line";
import { removeLine } from "../actions/remove-line";
import { setLines } from "../actions/set-lines";
import { updateLine } from "../actions/update-line";

function pseudo(text: string | undefined, diff = false): DocBlock {
  return {
    id: "p",
    type: "pseudocode",
    props: diff ? { diff: true } : {},
    ...(text === undefined ? {} : { text: [{ insert: text }] }),
    children: [],
  };
}

function run<P extends TObject>(
  action: ComponentAction<P>,
  block: DocBlock,
  params: Record<string, unknown>,
): ComponentActionResult {
  const before = JSON.stringify(block);
  const issues = checkParams(action, params);
  const result = issues.length > 0
    ? { ok: false as const, issues }
    : "apply" in action
      ? action.apply(block, params as Static<P>)
      : { ok: false as const, issues: [] };
  expect(JSON.stringify(block)).toBe(before);
  return result;
}

/** Returns the resulting plain text (or "" for no text). */
function textOf(result: ComponentActionResult): string {
  if (!result.ok) throw new Error(`Expected ok, got issues: ${JSON.stringify(result.issues)}`);
  expect(result.text).toBeDefined();
  return (result.text ?? []).map((span) => span.insert).join("");
}

function mustFail(result: ComponentActionResult, path: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issues.map((issue) => issue.path)).toContain(path);
}

describe("pseudocode.insertLine", () => {
  it("inserts at the start, middle and end of a plain block", () => {
    const block = pseudo("a()\nc()");
    expect(textOf(run(insertLine, block, { index: 0, text: "start()" }))).toBe("start()\na()\nc()");
    expect(textOf(run(insertLine, block, { index: 1, text: "  b()" }))).toBe("a()\n  b()\nc()");
    expect(textOf(run(insertLine, block, { index: 2, text: "d()" }))).toBe("a()\nc()\nd()");
  });

  it("writes the marker in a diff block and defaults it to a space", () => {
    const block = pseudo(" keep()\n-old()", true);
    expect(textOf(run(insertLine, block, { index: 2, text: "new()", marker: "+" }))).toBe(" keep()\n-old()\n+new()");
    expect(textOf(run(insertLine, block, { index: 0, text: "ctx()" }))).toBe(" ctx()\n keep()\n-old()");
  });

  it("inserts the first line into an empty block", () => {
    expect(textOf(run(insertLine, pseudo(undefined), { index: 0, text: "x()" }))).toBe("x()");
  });

  it("rejects an out-of-range index, a newline, and a marker on a plain block", () => {
    mustFail(run(insertLine, pseudo("a()"), { index: 2, text: "x" }), "$.params.index");
    mustFail(run(insertLine, pseudo("a()"), { index: -1, text: "x" }), "$.params.index");
    mustFail(run(insertLine, pseudo("a()"), { index: 0, text: "x\ny" }), "$.params.text");
    mustFail(run(insertLine, pseudo("a()"), { index: 0, text: "x", marker: "+" }), "$.params.marker");
    mustFail(run(insertLine, pseudo("a()", true), { index: 0, text: "x", marker: "*" }), "$.params.marker");
  });
});

describe("pseudocode.updateLine", () => {
  it("replaces text and keeps the marker in a diff block", () => {
    expect(textOf(run(updateLine, pseudo(" a()\n-b()", true), { index: 1, text: "b2()" }))).toBe(" a()\n-b2()");
  });

  it("changes a marker and resets it with null", () => {
    const block = pseudo(" a()\n-b()", true);
    expect(textOf(run(updateLine, block, { index: 0, marker: "+" }))).toBe("+a()\n-b()");
    expect(textOf(run(updateLine, block, { index: 1, marker: null }))).toBe(" a()\n b()");
  });

  it("rejects an empty patch, a bad index, and a marker on a plain block", () => {
    mustFail(run(updateLine, pseudo("a()"), { index: 0 }), "$.params");
    mustFail(run(updateLine, pseudo("a()"), { index: 1, text: "x" }), "$.params.index");
    mustFail(run(updateLine, pseudo(undefined), { index: 0, text: "x" }), "$.params.index");
    mustFail(run(updateLine, pseudo("a()"), { index: 0, marker: "-" }), "$.params.marker");
  });
});

describe("pseudocode.removeLine", () => {
  it("removes a line and leaves no text once the last line goes", () => {
    expect(textOf(run(removeLine, pseudo("a()\nb()\nc()"), { index: 1 }))).toBe("a()\nc()");
    const last = run(removeLine, pseudo("a()"), { index: 0 });
    expect(last).toEqual({ ok: true, props: {}, text: [] });
  });

  it("rejects an out-of-range index", () => {
    mustFail(run(removeLine, pseudo("a()"), { index: 1 }), "$.params.index");
  });
});

describe("pseudocode.setLines", () => {
  it("replaces every line under the current diff mode", () => {
    const result = run(setLines, pseudo(" a()", true), { lines: [{ text: "x()", marker: "-" }, { text: "y()" }] });
    expect(textOf(result)).toBe("-x()\n y()");
    expect(result.ok && result.props).toEqual({});
  });

  it("turns diff on or off in the same edit", () => {
    const on = run(setLines, pseudo("a()"), { lines: [{ text: "x()", marker: "+" }], diff: true });
    expect(textOf(on)).toBe("+x()");
    expect(on.ok && on.props).toEqual({ diff: true });
    const off = run(setLines, pseudo("+a()", true), { lines: [{ text: "x()" }], diff: false });
    expect(textOf(off)).toBe("x()");
    expect(off.ok && off.props).toEqual({ diff: undefined });
  });

  it("clears the text with an empty array", () => {
    expect(run(setLines, pseudo("a()"), { lines: [] })).toEqual({ ok: true, props: {}, text: [] });
  });

  it("rejects per-line newlines and markers without diff, with indexed paths", () => {
    mustFail(run(setLines, pseudo("a()"), { lines: [{ text: "ok" }, { text: "x\ny" }] }), "$.params.lines[1].text");
    mustFail(run(setLines, pseudo("a()"), { lines: [{ text: "x", marker: "+" }] }), "$.params.lines[0].marker");
  });
});
