import { inlineCodeChipProps } from "./delta-spans";
import { chipNeedsPieces, chipPieces } from "../components/mono-breaks";

/** The slice of the hast shape this pass reads and writes (no @types/hast dependency). */
type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function hastText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

/** The chip's text as nowrap pieces with a `<wbr>` between adjacent words' pieces (mono-breaks.tsx chipBreaks, in hast). */
function chipChildren(text: string): HastNode[] {
  const pieces = chipPieces(text);
  return pieces.flatMap((piece, index): HastNode[] => {
    if (/^\s+$/.test(piece)) return [{ type: "text", value: piece }];
    const span: HastNode = {
      type: "element",
      tagName: "span",
      properties: { dataChipPiece: "", style: "white-space:nowrap" },
      children: [{ type: "text", value: piece }],
    };
    const breakBefore = index > 0 && !/^\s+$/.test(pieces[index - 1]);
    return breakBefore ? [{ type: "element", tagName: "wbr", properties: {}, children: [] }, span] : [span];
  });
}

function visit(node: HastNode, parent: HastNode | null): void {
  if (node.type === "element" && node.tagName === "code" && parent?.tagName !== "pre") {
    const text = hastText(node);
    const { className, "data-chip-kind": kind } = inlineCodeChipProps(text);
    node.properties = { ...node.properties, className: className.split(" "), dataChipKind: kind };
    if (chipNeedsPieces(text)) node.children = chipChildren(text);
    return;
  }
  for (const child of node.children ?? []) visit(child, node);
}

/**
 * Markdown-projected inline code (callout bodies and the other markdown
 * renders) wears the same typed chip as delta-span code: the shared chip
 * classes plus the kind class and `data-chip-kind`, and its text is cut
 * into the same nowrap pieces (never broken mid-token). Fenced code (a `code`
 * inside `pre`) is a code panel and is left alone.
 */
export function rehypeInlineCodeChips() {
  return (tree: HastNode) => visit(tree, null);
}
