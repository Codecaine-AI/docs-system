"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { FILE_TREE_VARS, RenamedFrom } from "../file-tree/FileTreeDocsBlock";
import { sortFileTreeNodes, type FileTreeNode } from "../file-tree/tree-model";
import {
  TREE_ICONS,
  TreeGuides,
  TreeHead,
  TreeMark,
  TreeStyle,
  depthStyle,
  pipeGuides,
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
};

/**
 * A folder chain compacts while the folder carries no note/change of its own
 * and holds exactly one child that is itself a folder.
 */
function compactChain(node: FileTreeNode): { names: string[]; last: FileTreeNode } {
  const names = [node.name];
  let last = node;
  while (!last.change && !last.note && last.children.size === 1) {
    const only = last.children.values().next().value as FileTreeNode;
    if (!only.isDir) break;
    names.push(only.name);
    last = only;
  }
  return { names, last };
}

function explorerRows(
  nodes: Iterable<FileTreeNode>,
  depth: number,
  collapsed: ReadonlySet<string>,
  out: ExplorerRow[],
): ExplorerRow[] {
  for (const node of sortFileTreeNodes(nodes)) {
    const { names, last } = node.isDir ? compactChain(node) : { names: [node.name], last: node };
    out.push({ key: last.path, depth, names, node: last });
    if (last.isDir && !collapsed.has(last.path)) {
      explorerRows(last.children.values(), depth + 1, collapsed, out);
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
  open,
  onToggle,
}: {
  row: ExplorerRow;
  diff: boolean;
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
 * diff gutter glyph + row tint as the change signal, and wrapped notes in one
 * aligned column. A head shows only when a title is set (family tile +
 * title). Past `maxRows` visible rows the list folds behind one quiet
 * "Show all" row. Reads the file tree's `--docs-file-tree-*` knobs.
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
  const rows = explorerRows(roots.values(), 0, collapsed, []);
  const folds = rows.length > limit;
  const visible = folds && !expanded ? rows.slice(0, limit) : rows;
  // The gutter belongs to the whole tree, so folding never shifts the rows.
  const diff = treeHasChange(roots.values());
  // The panel shrinks to its rows (.docs-tree is fit-content), so folding a
  // folder or "Show first N rows" would make it jump narrower under the
  // pointer. Ratchet instead: the widest it has been is its floor (capped
  // at the lane), so it can grow as rows open but never shrinks on a click.
  const figureRef = useRef<HTMLElement>(null);
  const widestRef = useRef(0);
  useLayoutEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    const width = figure.getBoundingClientRect().width;
    if (width <= widestRef.current) return;
    widestRef.current = width;
    figure.style.minWidth = `min(${Math.ceil(width)}px, 100%)`;
  });

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
      <figure ref={figureRef} className="docs-tree" data-tree-kind="file-explorer" data-docs-file-explorer="" data-code-surface="true" style={FILE_TREE_VARS}>
        {title ? <TreeHead icon={TREE_ICONS.folder} title={title} /> : null}
        <div className="docs-tree__rows" role="tree" aria-label={title ?? "Files"} data-diff={diff ? "" : undefined}>
          {rows.length === 0 ? (
            <div className="docs-tree__empty">(no entries)</div>
          ) : (
            visible.map((row) => (
              <ExplorerRowView
                key={row.key}
                row={row}
                diff={diff}
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
