"use client";

import type { DocBlock } from "../../doc-schema";
import type { ComponentBundle } from "../types";

type FileTreeChange = "added" | "removed" | "modified" | "renamed";

type FileTreeEntry = { path: string; note?: string; change?: FileTreeChange; from?: string };

const FILE_TREE_CHANGE_MARKERS: Record<FileTreeChange, string> = {
  added: "+",
  removed: "-",
  modified: "~",
  renamed: ">",
};

function isFileTreeChange(value: unknown): value is FileTreeChange {
  return typeof value === "string" && value in FILE_TREE_CHANGE_MARKERS;
}

function fileTreeEntries(block: DocBlock): FileTreeEntry[] {
  const raw = block.props.entries;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string",
    )
    .map((entry) => ({
      path: entry.path as string,
      note: typeof entry.note === "string" && entry.note.trim() ? entry.note.trim() : undefined,
      change: isFileTreeChange(entry.change) ? entry.change : undefined,
      from: typeof entry.from === "string" && entry.from.trim() ? entry.from.trim() : undefined,
    }));
}

type FileTreeNode = {
  name: string;
  /** Explicit trailing-"/" entry, or has children (derived from prefixes). */
  explicitDir: boolean;
  entry?: FileTreeEntry;
  children: Map<string, FileTreeNode>;
};

/**
 * Literal tree-command rendering (see the module header for the format):
 * nested tree from /-separated paths, ├──/└──/│ guides, dirs-first stable
 * sort, change-marker line prefixes, `  # note` suffixes.
 */
function projectFileTree(block: DocBlock): string {
  const entries = fileTreeEntries(block);

  const root: FileTreeNode = { name: "", explicitDir: true, children: new Map() };
  for (const entry of entries) {
    const explicitDir = entry.path.endsWith("/");
    const segments = entry.path.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) continue;
    let node = root;
    for (const segment of segments) {
      let child = node.children.get(segment);
      if (!child) {
        child = { name: segment, explicitDir: false, children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.entry = entry;
    if (explicitDir) node.explicitDir = true;
  }

  const hasAnyMarker = entries.some((entry) => entry.change !== undefined);
  const markerFor = (entry: FileTreeEntry | undefined): string => {
    if (entry?.change) return `${FILE_TREE_CHANGE_MARKERS[entry.change]} `;
    return hasAnyMarker ? "  " : "";
  };

  const sortChildren = (node: FileTreeNode): FileTreeNode[] => {
    const isDir = (child: FileTreeNode) => child.explicitDir || child.children.size > 0;
    return [...node.children.values()].sort((a, b) => {
      const dirDelta = Number(isDir(b)) - Number(isDir(a));
      if (dirDelta !== 0) return dirDelta;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  };

  const lines: string[] = [];
  const render = (node: FileTreeNode, guide: string, childGuide: string) => {
    const isDir = node.explicitDir || node.children.size > 0;
    const name = isDir ? `${node.name}/` : node.name;
    const label =
      node.entry?.change === "renamed" && node.entry.from ? `${node.entry.from} -> ${name}` : name;
    const note = node.entry?.note ? `  # ${node.entry.note}` : "";
    lines.push(`${markerFor(node.entry)}${guide}${label}${note}`);
    const children = sortChildren(node);
    children.forEach((child, index) => {
      const last = index === children.length - 1;
      render(child, `${childGuide}${last ? "└── " : "├── "}`, `${childGuide}${last ? "    " : "│   "}`);
    });
  };
  // Top-level nodes render flat (no guide); their descendants get guides.
  for (const top of sortChildren(root)) render(top, "", "");

  return "```\n" + lines.join("\n") + "\n```";
}

export const fileTreeAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "file-tree":
      return projectFileTree(block);
    default:
      return null;
  }
};
