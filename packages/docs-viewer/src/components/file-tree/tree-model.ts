"use client";

/**
 * Shared tree model for the file tree and the file explorer: the flat entries become a
 * nested node tree (directories derived from path prefixes), sorted
 * dirs-first then codepoint-ascending.
 */

import { isDocsColor, type DocsColor } from "@codecaine-ai/docs-model";

export type FileTreeChange = "added" | "removed" | "modified" | "renamed";

export type FileTreeEntry = {
  /** "/"-separated path, no leading "./"; a trailing "/" marks an explicit directory. */
  path: string;
  /** Muted note, rendered in one aligned column after the names. */
  note?: string;
  /** Diff state; adds a +/−/~/> gutter glyph and a soft row tint. */
  change?: FileTreeChange;
  /** Old path, rendered struck (relative to the new folder) before the new name when change is "renamed". */
  from?: string;
  /** Group color: on a directory it covers the row and its whole subtree; on a file, just the row. */
  color?: DocsColor;
};

export const FILE_TREE_CHANGES: readonly FileTreeChange[] = [
  "added",
  "removed",
  "modified",
  "renamed",
];

export function isFileTreeChange(value: unknown): value is FileTreeChange {
  return FILE_TREE_CHANGES.includes(value as FileTreeChange);
}

/**
 * One node of the nested tree built from the flat entry paths. Directories
 * are derived from path prefixes (or authored explicitly with a trailing
 * "/"); derived directories never carry change/note state — only explicit
 * entries do (`entryPath` marks a node an entry authored directly).
 */
export type FileTreeNode = {
  name: string;
  isDir: boolean;
  /** Normalized full path ("/"-joined segments; directories keep a trailing "/"). */
  path: string;
  /** Set when this node was authored as an entry (not just derived as a prefix). */
  entryPath?: string;
  note?: string;
  change?: FileTreeChange;
  from?: string;
  /** The node's own group color (inherited colors are resolved per row, see `colorScope`). */
  color?: DocsColor;
  children: Map<string, FileTreeNode>;
};

/** Splits a raw entry path into clean segments; trailing "/" = explicit dir. */
function normalizePath(raw: string): { segments: string[]; isDir: boolean } {
  const trimmed = raw.trim();
  const isDir = trimmed.endsWith("/");
  const segments = trimmed
    .replace(/^\.\//, "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return { segments, isDir };
}

/**
 * Builds the nested tree from flat entries. Intermediate directories are
 * created on demand; an explicit entry attaches its note/change/from/color to
 * its own node. A node authored as a file is promoted to a directory if a later
 * entry nests beneath it.
 */
export function buildFileTree(entries: FileTreeEntry[]): {
  roots: Map<string, FileTreeNode>;
} {
  const roots = new Map<string, FileTreeNode>();
  for (const entry of entries) {
    const { segments, isDir } = normalizePath(entry.path);
    if (segments.length === 0) continue;
    let level = roots;
    let prefix = "";
    for (const [index, segment] of segments.entries()) {
      const last = index === segments.length - 1;
      prefix = prefix ? `${prefix}/${segment}` : segment;
      let node = level.get(segment);
      if (!node) {
        node = {
          name: segment,
          isDir: !last || isDir,
          path: prefix,
          children: new Map(),
        };
        level.set(segment, node);
      }
      if (!last) {
        // Prefix segments are directories by construction.
        node.isDir = true;
      } else {
        node.isDir = node.isDir || isDir || node.children.size > 0;
        node.entryPath = node.isDir ? `${node.path}/` : node.path;
        if (typeof entry.note === "string" && entry.note.trim()) node.note = entry.note.trim();
        if (isFileTreeChange(entry.change)) node.change = entry.change;
        if (typeof entry.from === "string" && entry.from.trim()) {
          node.from = entry.from.trim().replace(/^\.\//, "");
        }
        if (isDocsColor(entry.color)) node.color = entry.color;
      }
      // Keep dir paths trailing-"/"-suffixed once known to be a directory.
      if (node.isDir && node.entryPath && !node.entryPath.endsWith("/")) {
        node.entryPath = `${node.entryPath}/`;
      }
      level = node.children;
    }
  }
  return { roots };
}

/**
 * The old path of a rename as seen from the new name's folder: a rename in
 * place shows the old basename (`render.ts`), a move shows the way back
 * (`../waterfall/lib.ts`). Both paths are root-relative.
 */
export function relativeFromPath(from: string, to: string): string {
  const fromSegments = from.split("/").filter(Boolean);
  const toDir = to.split("/").filter(Boolean).slice(0, -1);
  let shared = 0;
  while (
    shared < toDir.length &&
    shared < fromSegments.length - 1 &&
    toDir[shared] === fromSegments[shared]
  ) {
    shared += 1;
  }
  const up = toDir.length - shared;
  return [...Array.from({ length: up }, () => ".."), ...fromSegments.slice(shared)].join("/");
}

/**
 * Sort order at every level: directories first, then codepoint-ascending
 * name. Keep in sync with docs-model's `projectFileTree` markdown projection
 * so the read surface and the agent projection agree on ordering.
 */
export function sortFileTreeNodes(nodes: Iterable<FileTreeNode>): FileTreeNode[] {
  return Array.from(nodes).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/**
 * A row's resolved group color and the path of the node that set it (its
 * nearest colored ancestor-or-self). Undefined outside every colored subtree.
 */
export type TreeColorScope = { color: DocsColor; source: string } | undefined;

/** A node's own color opens a new scope; otherwise the inherited scope carries on. */
export function colorScope(node: FileTreeNode, inherited: TreeColorScope): TreeColorScope {
  return node.color ? { color: node.color, source: node.path } : inherited;
}

/**
 * Seams over the rows as rendered, top to bottom: a colored row directly
 * below a colored row of a different source, so adjacent bands read apart.
 */
export function colorSeams(scopes: readonly TreeColorScope[]): boolean[] {
  return scopes.map((scope, index) => {
    const above = index > 0 ? scopes[index - 1] : undefined;
    return !!scope && !!above && above.source !== scope.source;
  });
}

export type TreeColorAttrs = {
  "data-color"?: DocsColor;
  "data-color-head"?: "";
  "data-color-seam"?: "";
  "data-color-source"?: string;
};

/** The row's color data attributes: the band color, its head row, and a seam above it. */
export function colorAttrs(scope: TreeColorScope, head: boolean, seam: boolean): TreeColorAttrs {
  if (!scope) return {};
  return {
    "data-color": scope.color,
    "data-color-source": scope.source,
    ...(head ? { "data-color-head": "" as const } : {}),
    ...(seam ? { "data-color-seam": "" as const } : {}),
  };
}
