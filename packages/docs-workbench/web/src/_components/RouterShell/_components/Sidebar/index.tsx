import { useState } from "react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { TreeNode } from "./_components/TreeNode";
import type { TreeFocus } from "./types";

/**
 * Left docs-tree navigation — ported from Spectre's DocsFileTree
 * interactions: folders expand/collapse with chevrons, bundle docs are
 * selectable leaves (hash links, so the exported static site deep-links
 * without any server rewrite rules) that grow their own chevron when they
 * nest other docs. Legacy markdown files (kind "file") are listed but
 * inert — the standalone viewer renders doc.json bundles only.
 *
 * Every branch starts collapsed except the ancestors of the open doc, so a
 * fresh load shows just the path to where you are. Double-clicking a row
 * tidies the tree the same way around that row: everything collapses except
 * its ancestors and the row itself.
 */

export type SidebarProps = {
  tree: DocsTreeNode[];
  selectedPath: string | null;
};

export function Sidebar({
  tree,
  selectedPath,
}: SidebarProps) {
  const [focus, setFocus] = useState<TreeFocus | null>(null);
  const onFocus = (path: string) => setFocus((prev) => ({ path, seq: (prev?.seq ?? 0) + 1 }));
  return (
    <nav
      className="flex h-full min-h-0 flex-col overflow-y-auto py-2 pr-1"
      aria-label="Docs tree"
      style={{
        fontFamily: "var(--docs-sidebar-font, inherit)",
        fontSize: "var(--docs-sidebar-font-size, var(--ds-font-size-ui-lg))",
        color: "var(--docs-sidebar-item-fg, var(--foreground))",
      }}
    >
      {tree.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          focus={focus}
          onFocus={onFocus}
        />
      ))}
    </nav>
  );
}
