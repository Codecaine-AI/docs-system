import { createElement } from "react";
import { CODE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { CODE_BLOCK_CLASSES } from "../../render/block-classes";
import { TEXT_OPS, blockAttrs, deltaToPlainText, el } from "../../render/descriptor-helpers";
import { CodeBlockHeader } from "../code/CodeShell";
import { highlightPseudoLines } from "./highlight";
import { PseudocodeGrid } from "./PseudocodeGrid";

/** Diff sign glyphs: plus, and a true minus sign (U+2212) so the two read as a pair. */
const DIFF_SIGN = { add: "+", del: "\u2212" } as const;

/**
 * A line's code cell: the leading indent stays bare and the rest is wrapped
 * in `.docs-pseudo-body`, so a removed line's strike starts at the first
 * glyph, not at the margin. The highlighter never tokenizes the indent, so
 * the HTML starts with the literal whitespace.
 */
function codeCell(html: string): string {
  const indent = /^[ \t]*/.exec(html)?.[0] ?? "";
  const body = html.slice(indent.length);
  return `<span class="docs-pseudo-code">${indent}${body ? `<span class="docs-pseudo-body">${body}</span>` : ""}</span>`;
}

/**
 * Row-grid HTML (styles/code.css `.docs-pseudo-*`): one row per source line
 * with its number, the diff sign when `diff` is on, the code, and the
 * trailing comment, plus the line's indent for a comment moved under it and
 * for its indent guides. A function header line is marked data-pseudo-header.
 * Every cell is escaped or highlighted HTML.
 */
/** A line's indent in ch, where a tab counts 4. `html` starts with the literal indent, which the highlighter never tokenizes. */
function indentOf(html: string): number {
  return [...(/^[ \t]*/.exec(html)?.[0] ?? "")].reduce((n, c) => n + (c === "\t" ? 4 : 1), 0);
}

/** A function header: a call shape at indent 0, such as `parseTranscript(jsonl)`, with a more indented line after it. */
const HEADER = /^<span class="hljs-title function_">[^<]*<\/span>\([^]*\)\s*$/;

function pseudocodeRows(code: string, diff: boolean): string {
  const lines = highlightPseudoLines(code, diff);
  return lines
    .map((line, index) => {
      const sign = diff
        ? `<span class="docs-pseudo-sign" aria-hidden="true">${line.mark ? DIFF_SIGN[line.mark] : ""}</span>`
        : "";
      const comment = line.comment === null ? "" : `<span class="hljs-comment docs-pseudo-comment">${line.comment}</span>`;
      // The indent in ch: a comment moved under its line starts there, and one indent guide is drawn per 2ch.
      const indent = indentOf(line.code);
      const next = lines[index + 1];
      const header = indent === 0 && HEADER.test(line.code) && next !== undefined && indentOf(next.code) > 0;
      return (
        `<div class="docs-pseudo-row"${line.mark ? ` data-code-diff="${line.mark}"` : ""}${header ? " data-pseudo-header" : ""} style="--docs-pseudo-indent:${indent}ch">` +
        `<span class="docs-pseudo-num" aria-hidden="true">${index + 1}</span>${sign}` +
        `${codeCell(line.code)}${comment}</div>`
      );
    })
    .join("");
}

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "pseudocode",
    targetKind: "pseudocode",
    label: "Pseudocode",
    agentDescription:
      "A pseudocode block; the text is the pseudocode, written as plain-language steps (equals, is empty, and, or, add 1 to), not source syntax such as ===, ??, ?. or object literals. Control words (if / else / for each / return / leave), the action verb that opens a step (set, add, append, remove, replace), calls and -> arrows are highlighted, and plain words stay plain. Trailing // comments give a short reason and sit in one aligned comment column. When a comment would wrap there, or the code is too wide, every comment moves under its line. With props.diff: true each line's leading +, - or space is a diff marker: added and removed rows get a +/− sign and a tint, and removed code is struck.",
    patchOps: TEXT_OPS,
    // Mono lines share the code block's measure (block-layout.ts).
    layout: CODE_LEFT_BLOCK_LAYOUT,
    render: (block, ctx) => {
      const code = deltaToPlainText(block.text);
      const diff = block.props.diff === true;
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el(
          "div",
          // data-code-surface: the frame is a code panel, like the code block's.
          { className: `group/code ${CODE_BLOCK_CLASSES}`, "data-language": "pseudo", "data-code-surface": "true" },
          createElement(CodeBlockHeader, { languageLabel: "pseudocode", copyText: () => code, kind: "pseudocode" }),
          createElement(PseudocodeGrid, { html: pseudocodeRows(code, diff), diff }),
        ),
        ctx.renderChildren(block),
      );
    },
  },
];
