import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon, FolderIcon } from "lucide-react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";

/**
 * Left docs-tree navigation — ported from Spectre's DocsFileTree
 * interactions: folders expand/collapse with chevrons, bundle docs are
 * selectable leaves (hash links, so the exported static site deep-links
 * without any server rewrite rules) that grow their own chevron when they
 * nest other docs. Legacy markdown files (kind "file") are listed but
 * inert — the standalone viewer renders doc.json bundles only.
 */

function containsPath(node: DocsTreeNode, path: string | null): boolean {
  if (!path) return false;
  if (node.path === path) return true;
  return node.children?.some((child) => containsPath(child, path)) ?? false;
}

function TreeNode({
  node,
  depth,
  selectedPath,
}: {
  node: DocsTreeNode;
  depth: number;
  selectedPath: string | null;
}) {
  const [open, setOpen] = useState(depth === 0 || containsPath(node, selectedPath));
  const rowStyle = {
    paddingLeft: `${depth * 12 + 8}px`,
    paddingTop: "var(--docs-sidebar-item-py, 4px)",
    paddingBottom: "var(--docs-sidebar-item-py, 4px)",
  };

  if (node.kind === "dir") {
    return (
      <div>
        <button
          type="button"
          style={rowStyle}
          onClick={() => setOpen((prev) => !prev)}
          data-docs-tree-kind="dir"
          data-docs-tree-path={node.path}
          className="flex w-full items-center gap-1 pr-2 text-left hover:bg-muted/50"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDownIcon className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRightIcon className="h-3 w-3 shrink-0" />
          )}
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
        </button>
        {/* Full-width children keep guide offsets aligned with row padding. */}
        {open && (node.children?.length ?? 0) > 0 && (
          <div className="relative">
            <span
              aria-hidden
              data-docs-tree-guide
              className="pointer-events-none absolute inset-y-0"
              style={{
                left: `calc(${depth * 12 + 14}px - var(--docs-sidebar-guide-width, 1px) / 2)`,
                width: "var(--docs-sidebar-guide-width, 1px)",
                background: "var(--docs-sidebar-guide-color, var(--border))",
                opacity: "var(--docs-sidebar-guide-opacity, 0.6)",
                display: "var(--docs-sidebar-guide-display, block)",
                zIndex: 1,
              }}
            />
            {node.children!.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (node.kind === "bundle") {
    const isSelected = selectedPath === node.path;
    const hasChildren = (node.children?.length ?? 0) > 0;
    return (
      <div>
        <div
          className={cn(
            "flex w-full items-center gap-1 pr-2 hover:bg-muted/50",
            isSelected && "bg-muted font-medium",
          )}
          style={rowStyle}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={`Toggle ${node.name} children`}
              onClick={() => setOpen((prev) => !prev)}
              className="shrink-0"
            >
              {open ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronRightIcon className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <a
            href={`#/${node.path}`}
            data-docs-tree-kind="bundle"
            data-docs-tree-path={node.path}
            className="flex min-w-0 flex-1 items-center gap-1 text-left no-underline"
            title={node.path}
          >
            <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
          </a>
        </div>
        {/* Full-width children keep guide offsets aligned with row padding. */}
        {open && hasChildren && (
          <div className="relative">
            <span
              aria-hidden
              data-docs-tree-guide
              className="pointer-events-none absolute inset-y-0"
              style={{
                left: `calc(${depth * 12 + 14}px - var(--docs-sidebar-guide-width, 1px) / 2)`,
                width: "var(--docs-sidebar-guide-width, 1px)",
                background: "var(--docs-sidebar-guide-color, var(--border))",
                opacity: "var(--docs-sidebar-guide-opacity, 0.6)",
                display: "var(--docs-sidebar-guide-display, block)",
                zIndex: 1,
              }}
            />
            {node.children!.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={rowStyle}
      data-docs-tree-kind="file"
      data-docs-tree-path={node.path}
      className="flex items-center gap-1 truncate pr-2 opacity-60"
      title={`${node.path} (legacy markdown file — not renderable standalone)`}
    >
      <span className="w-3 shrink-0" />
      <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-50" />
      <span className="truncate">{node.name}</span>
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
    <nav
      className="flex h-full min-h-0 flex-col overflow-y-auto py-2 pr-1"
      aria-label="Docs tree"
      style={{
        fontFamily: "var(--docs-sidebar-font, inherit)",
        fontSize: "var(--docs-sidebar-font-size, 0.875rem)",
        color: "var(--docs-sidebar-item-fg, var(--foreground))",
      }}
    >
      {tree.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} selectedPath={selectedPath} />
      ))}
    </nav>
  );
}
