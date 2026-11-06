"use client";

import type { DocBlock } from "../../doc-schema";
import type { ComponentBundle } from "../types";
import { isDocsColor } from "../shared/colors";

type FileTreeChange = "added" | "removed" | "modified" | "renamed";

type FileTreeEntry = { path: string; note?: string; change?: FileTreeChange; from?: string; colored: boolean };

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
      colored: isDocsColor(entry.color),
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
export function projectFileTree(block: DocBlock): string {
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

  const isDir = (node: FileTreeNode) => node.explicitDir || node.children.size > 0;
  const sortChildren = (node: FileTreeNode): FileTreeNode[] => {
    return [...node.children.values()].sort((a, b) => {
      const dirDelta = Number(isDir(b)) - Number(isDir(a));
      if (dirDelta !== 0) return dirDelta;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  };

  // Compact folders, by the doc render's rule (docs-viewer `compactFileTree`): a folder with no note, change or
  // color merges into its only child when that child is a folder with no change, so a chain prints as one line.
  const mergesIntoChild = (node: FileTreeNode): FileTreeNode | undefined => {
    if (!isDir(node) || node.children.size !== 1 || node.entry?.note || node.entry?.change || node.entry?.colored) return undefined;
    const [child] = node.children.values();
    return child && isDir(child) && !child.entry?.change ? child : undefined;
  };

  const lines: string[] = [];
  const render = (start: FileTreeNode, guide: string, childGuide: string) => {
    let node = start;
    let joined = start.name;
    for (let child = mergesIntoChild(node); child; child = mergesIntoChild(node)) {
      joined = `${joined}/${child.name}`;
      node = child;
    }
    const name = isDir(node) ? `${joined}/` : joined;
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
