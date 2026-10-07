import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

export function containsPath(node: DocsTreeNode, path: string | null): boolean {
  if (!path) return false;
  if (node.path === path) return true;
  return node.children?.some((child) => containsPath(child, path)) ?? false;
}
