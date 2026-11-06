import { CHIP_GLUE_AFTER, CHIP_GLUE_BEFORE, inlineCodeChipProps } from "./delta-spans";
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

const isChip = (node: HastNode, parent: HastNode | null) => node.type === "element" && node.tagName === "code" && parent?.tagName !== "pre";

function visit(node: HastNode, parent: HastNode | null): void {
  if (isChip(node, parent)) {
    const text = hastText(node);
    const { className, "data-chip-kind": kind } = inlineCodeChipProps(text);
    node.properties = { ...node.properties, className: className.split(" "), dataChipKind: kind };
    if (chipNeedsPieces(text)) node.children = chipChildren(text);
    return;
  }
  const children = node.children ?? [];
  for (const child of children) visit(child, node);
  // A chip and the punctuation beside it share one nowrap span (delta-spans.tsx CHIP_GLUE_BEFORE and CHIP_GLUE_AFTER).
  for (let i = 0; i < children.length; i++) {
    if (!isChip(children[i]!, node)) continue;
    const prev = children[i - 1];
    const next = children[i + 1];
    const before = prev?.type === "text" ? CHIP_GLUE_BEFORE.exec(prev.value ?? "")?.[0] ?? "" : "";
    const after = next?.type === "text" ? CHIP_GLUE_AFTER.exec(next.value ?? "")?.[0] ?? "" : "";
    if (!before && !after) continue;
    if (before) prev!.value = prev!.value!.slice(0, -before.length);
    if (after) next!.value = next!.value!.slice(after.length);
    const parts: HastNode[] = [...(before ? [{ type: "text", value: before }] : []), children[i]!, ...(after ? [{ type: "text", value: after }] : [])];
    children[i] = { type: "element", tagName: "span", properties: { dataChipGlue: "true", ...(before ? { dataChipGlueBefore: "true" } : {}), ...(after ? { dataChipGlueAfter: "true" } : {}), style: "white-space:nowrap" }, children: parts };
  }
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
