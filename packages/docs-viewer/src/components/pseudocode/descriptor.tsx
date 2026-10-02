import { createElement } from "react";
import { CODE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { CODE_BLOCK_CLASSES } from "../../render/block-classes";
import { TEXT_OPS, blockAttrs, deltaToPlainText, el } from "../../render/descriptor-helpers";
import { CodeBlockHeader } from "../code/CodeShell";
import { highlightPseudoLines } from "./highlight";

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
 * trailing comment. Every cell is escaped or highlighted HTML.
 */
function pseudocodeRows(code: string, diff: boolean): string {
  return highlightPseudoLines(code, diff)
    .map((line, index) => {
      const sign = diff
        ? `<span class="docs-pseudo-sign" aria-hidden="true">${line.mark ? DIFF_SIGN[line.mark] : ""}</span>`
        : "";
      const comment = line.comment === null ? "" : `<span class="hljs-comment docs-pseudo-comment">${line.comment}</span>`;
      return (
        `<div class="docs-pseudo-row"${line.mark ? ` data-code-diff="${line.mark}"` : ""}>` +
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
      "A pseudocode block; the text is the pseudocode. Control words (if / else / for each / return), calls and -> arrows are highlighted, and trailing // comments sit in one aligned comment column that wraps inside the panel. With props.diff: true each line's leading +, - or space is a diff marker: added and removed rows get a +/− sign and a tint, and removed code is struck.",
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
          el("div", {
            className: "hljs docs-pseudo-grid font-mono",
            "data-pseudo-diff": diff ? "true" : undefined,
            dangerouslySetInnerHTML: { __html: pseudocodeRows(code, diff) },
          }),
        ),
        ctx.renderChildren(block),
      );
    },
  },
];
