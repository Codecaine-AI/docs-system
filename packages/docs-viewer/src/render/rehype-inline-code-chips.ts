import { inlineCodeChipProps } from "./delta-spans";

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

function visit(node: HastNode, parent: HastNode | null): void {
  if (node.type === "element" && node.tagName === "code" && parent?.tagName !== "pre") {
    const { className, "data-chip-kind": kind } = inlineCodeChipProps(hastText(node));
    node.properties = { ...node.properties, className: className.split(" "), dataChipKind: kind };
    return;
  }
  for (const child of node.children ?? []) visit(child, node);
}

/**
 * Markdown-projected inline code (callout bodies and the other markdown
 * renders) wears the same typed chip as delta-span code: the shared chip
 * classes plus the kind class and `data-chip-kind`. Fenced code (a `code`
 * inside `pre`) is a code panel and is left alone.
 */
export function rehypeInlineCodeChips() {
  return (tree: HastNode) => visit(tree, null);
}
