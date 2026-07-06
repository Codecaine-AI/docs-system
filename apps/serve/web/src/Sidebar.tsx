import { useState } from "react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

/**
 * Left docs-tree navigation. Bundles are hash links (#/<bundle path>) so the
 * exported static site deep-links without any server rewrite rules; plain
 * dirs are collapsible; legacy markdown files (kind "file") are listed but
 * inert — the standalone viewer renders doc.json bundles only.
 */

function TreeNode({
  node,
  depth,
  selectedPath,
}: {
  node: DocsTreeNode;
  depth: number;
  selectedPath: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const indent = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.kind === "bundle") {
    const isSelected = selectedPath === node.path;
    return (
      <div>
        <a
          href={`#/${node.path}`}
          style={indent}
          className={`block truncate rounded-sm py-1 pr-2 text-sm no-underline ${
            isSelected
              ? "bg-accent font-medium text-accent-foreground"
              : "text-foreground hover:bg-muted"
          }`}
          title={node.path}
        >
          {node.name}
        </a>
        {node.children && node.children.length > 0 && (
          <div>
            {node.children.map((child) => (
              <TreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (node.kind === "dir") {
    return (
      <div>
        <button
          type="button"
          style={indent}
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex w-full items-center gap-1 truncate rounded-sm py-1 pr-2 text-left text-sm font-medium text-muted-foreground hover:bg-muted"
          aria-expanded={!collapsed}
        >
          <span className="inline-block w-3 text-[10px]">{collapsed ? "▸" : "▾"}</span>
          <span className="truncate">{node.name}</span>
        </button>
        {!collapsed && (
          <div>
            {(node.children ?? []).map((child) => (
              <TreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={indent}
      className="truncate py-1 pr-2 text-sm text-muted-foreground/60"
      title={`${node.path} (legacy markdown file — not renderable standalone)`}
    >
      {node.name}
    </div>
  );
}

export function Sidebar({
  tree,
  selectedPath,
}: {
  tree: DocsTreeNode[];
  selectedPath: string | null;
}) {
  return (
    <nav className="flex h-full min-h-0 flex-col overflow-y-auto py-2 pr-1" aria-label="Docs tree">
      {tree.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} selectedPath={selectedPath} />
      ))}
    </nav>
  );
}
