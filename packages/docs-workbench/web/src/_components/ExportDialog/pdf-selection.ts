import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

export function exportPages(tree: DocsTreeNode[]): DocsTreeNode[] {
  return tree.flatMap(node => [...(node.kind === "bundle" ? [node] : []), ...exportPages(node.children ?? [])]);
}

/** Keep canonical paths, including numbered folder names, in ZIP archives. */
export function pdfEntryPath(path: string): string {
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..") || /[\x00-\x1f]/.test(path)) {
    throw new Error("Invalid page path for PDF export.");
  }
  return `${path}.pdf`;
}
