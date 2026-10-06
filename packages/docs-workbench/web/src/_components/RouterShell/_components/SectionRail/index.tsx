import { FileTextIcon, FolderIcon } from "lucide-react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

export type SectionRailProps = {
  tree: DocsTreeNode[];
  selectedPath: string | null;
};

function containsPath(node: DocsTreeNode, path: string | null): boolean {
  if (!path) return false;
  if (node.path === path) return true;
  return node.children?.some((child) => containsPath(child, path)) ?? false;
}

/** The first readable doc at or under a node: a bundle itself, else its first bundle descendant. */
function landingPath(node: DocsTreeNode): string | null {
  if (node.kind === "bundle") return node.path;
  for (const child of node.children ?? []) {
    const nested = landingPath(child);
    if (nested) return nested;
  }
  return null;
}

/**
 * The collapsed sidebar's icon rail for a docs tree (layout.md rules 2, 3, 7).
 * The tree is deep and its rows have no icons of their own, so the rail shows
 * the tree's top level only: one row per section, a folder for a section with
 * children and a page for a single doc. A row links to its section's doc (or,
 * for a plain folder, to the first doc inside it), carries its name as a
 * native tooltip, and the section that holds the open doc takes the fill.
 * Legacy markdown files are inert in the tree and are left out here.
 */
export function SectionRail({ tree, selectedPath }: SectionRailProps) {
  const rows = tree.flatMap((node) => {
    const href = landingPath(node);
    return href ? [{ node, href }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <nav className="ds-nav" aria-label="Docs sections">
      {rows.map(({ node, href }) => {
        const current = node.path === selectedPath;
        const active = !current && containsPath(node, selectedPath);
        return (
          <a
            key={node.path}
            className="ds-nav-item"
            href={`#/${href}`}
            title={node.name}
            aria-current={current ? "page" : undefined}
            data-active={active ? "true" : undefined}
            data-docs-rail-path={node.path}
          >
            <span className="ds-nav-icon" aria-hidden="true">
              {(node.children?.length ?? 0) > 0 ? <FolderIcon /> : <FileTextIcon />}
            </span>
            <span className="ds-nav-label">{node.name}</span>
          </a>
        );
      })}
    </nav>
  );
}
