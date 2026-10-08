"use client";

import { useState, type KeyboardEvent } from "react";
import { FILE_TREE_VARS, RenamedFrom } from "../file-tree/FileTreeDocsBlock";
import {
  colorAttrs,
  colorScope,
  colorSeams,
  sortFileTreeNodes,
  type FileTreeNode,
  type TreeColorScope,
} from "../file-tree/tree-model";
import {
  TREE_ICONS,
  TreeGuides,
  TreeHead,
  TreeMark,
  TreeStyle,
  depthStyle,
  pipeGuides,
  onColorGroupHover,
} from "../outline-rows/tree-rows";

/** Rows shown before the explorer folds when the block sets no `maxRows`. */
export const DEFAULT_EXPLORER_MAX_ROWS = 8;

type ExplorerRow = {
  /** Path of the row's last node: the React key and the collapse key. */
  key: string;
  depth: number;
  /** One segment, or a compacted single-child folder chain. */
  names: string[];
  node: FileTreeNode;
  /** The row's group color, its own or a colored ancestor's. */
  scope: TreeColorScope;
  /** The row's first node sets the color itself (the band's head). */
  head: boolean;
};

/**
 * A folder chain compacts while the folder carries no note/change of its own
 * and holds exactly one child that is itself a folder without its own color
 * (a color source always starts its own row).
 */
function compactChain(node: FileTreeNode): { names: string[]; last: FileTreeNode } {
  const names = [node.name];
  let last = node;
  while (!last.change && !last.note && last.children.size === 1) {
    const only = last.children.values().next().value as FileTreeNode;
    if (!only.isDir || only.color) break;
    names.push(only.name);
    last = only;
  }
  return { names, last };
}

function explorerRows(
  nodes: Iterable<FileTreeNode>,
  depth: number,
  inherited: TreeColorScope,
  collapsed: ReadonlySet<string>,
  out: ExplorerRow[],
): ExplorerRow[] {
  for (const node of sortFileTreeNodes(nodes)) {
    const { names, last } = node.isDir ? compactChain(node) : { names: [node.name], last: node };
    // Only a chain's first node can carry a color (compactChain stops before
    // a colored folder), so the first node's scope is the whole row's.
    const scope = colorScope(node, inherited);
    out.push({ key: last.path, depth, names, node: last, scope, head: node.color !== undefined });
    if (last.isDir && !collapsed.has(last.path)) {
      explorerRows(last.children.values(), depth + 1, scope, collapsed, out);
    }
  }
  return out;
}

function treeHasChange(nodes: Iterable<FileTreeNode>): boolean {
  for (const node of nodes) {
    if (node.change || treeHasChange(node.children.values())) return true;
  }
  return false;
}

function ExplorerRowView({
  row,
  diff,
  seam,
  open,
  onToggle,
}: {
  row: ExplorerRow;
  diff: boolean;
  seam: boolean;
  open: boolean;
  onToggle: (path: string) => void;
}) {
  const { node, names } = row;
  const folder = node.isDir
    ? {
        tabIndex: 0,
        "aria-expanded": open,
        onClick: () => onToggle(node.path),
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle(node.path);
          }
        },
      }
    : {};
  return (
    <div
      className="docs-tree__row"
      role="treeitem"
      aria-level={row.depth + 1}
      data-docs-file-tree-entry={node.entryPath ?? (node.isDir ? `${node.path}/` : node.path)}
      data-docs-file-tree-change={node.change}
      data-change={node.change}
      {...colorAttrs(row.scope, row.head, seam)}
      {...folder}
    >
      {diff && <TreeMark change={node.change} />}
      <span
        className={node.note ? "docs-tree__path" : "docs-tree__path docs-tree__path--span"}
        style={depthStyle(row.depth)}
      >
        <TreeGuides guides={pipeGuides(row.depth)} />
        <span className="docs-tree__twisty" aria-hidden="true">
          {node.isDir ? (open ? TREE_ICONS.chevronDown : TREE_ICONS.chevronRight) : null}
        </span>
        <span className="docs-tree__icon" aria-hidden="true">
          {node.isDir ? TREE_ICONS.folder : TREE_ICONS.file}
        </span>
        <RenamedFrom node={node} />
        <span className="docs-tree__name" data-dir={node.isDir ? "" : undefined} data-docs-file-tree-name="">
          {names.map((name, index) => (
            <span key={`${index}-${name}`}>
              {index > 0 && <span className="docs-tree__sep">/</span>}
              {name}
            </span>
          ))}
        </span>
      </span>
      {node.note && <span className="docs-tree__note">{node.note}</span>}
    </div>
  );
}

/**
 * IDE-explorer rows on the shared trees row system: one row per file or
 * folder (single-child folder chains compacted), collapsible folders, the
 * diff gutter glyph + row tint as the change signal, a colored folder's band
 * over its subtree, and wrapped notes in one aligned column. A head shows
 * only when a title is set (family tile + title). Past `maxRows` visible rows
 * the list folds behind one quiet "Show all" row. Reads the file tree's
 * `--docs-file-tree-*` knobs.
 */
export function FileExplorer({
  roots,
  title,
  maxRows,
}: {
  roots: Map<string, FileTreeNode>;
  title?: string;
  maxRows?: number;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const limit = maxRows && maxRows > 0 ? maxRows : DEFAULT_EXPLORER_MAX_ROWS;
  const rows = explorerRows(roots.values(), 0, undefined, collapsed, []);
  const folds = rows.length > limit;
  const visible = folds && !expanded ? rows.slice(0, limit) : rows;
  const seams = colorSeams(visible.map((row) => row.scope));
  // The gutter belongs to the whole tree, so folding never shifts the rows.
  const diff = treeHasChange(roots.values());

  const toggle = (path: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <>
      <TreeStyle />
      <figure className="docs-tree" data-tree-kind="file-explorer" data-docs-file-explorer="" data-code-surface="true" style={FILE_TREE_VARS}>
        {title ? <TreeHead icon={TREE_ICONS.folder} title={title} /> : null}
        <div className="docs-tree__rows" onMouseOver={onColorGroupHover} onMouseLeave={onColorGroupHover} role="tree" aria-label={title ?? "Files"} data-diff={diff ? "" : undefined}>
          {rows.length === 0 ? (
            <div className="docs-tree__empty">(no entries)</div>
          ) : (
            visible.map((row, index) => (
              <ExplorerRowView
                key={row.key}
                row={row}
                diff={diff}
                seam={seams[index] ?? false}
                open={!collapsed.has(row.node.path)}
                onToggle={toggle}
              />
            ))
          )}
        </div>
        {folds && (
          <button
            type="button"
            className="docs-tree__more"
            data-diff={diff ? "" : undefined}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? TREE_ICONS.chevronUp : TREE_ICONS.chevronDown}
            <span>{expanded ? `Show first ${limit} rows` : `Show all ${rows.length} rows`}</span>
          </button>
        )}
      </figure>
    </>
  );
}
