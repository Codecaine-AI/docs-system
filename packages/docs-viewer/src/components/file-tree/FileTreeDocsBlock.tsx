"use client";

import { FolderTreeIcon } from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import {
  DocsMdxBlock,
  type DocsMdxParsedBlock,
} from "../base";

export type FileTreeChange = "added" | "removed" | "modified" | "renamed";

export type FileTreeEntry = {
  /** "/"-separated path, no leading "./"; a trailing "/" marks an explicit directory. */
  path: string;
  /** Muted `# note` comment rendered after the name. */
  note?: string;
  /** Diff state; tints the row and adds a +/-/~/> gutter marker. */
  change?: FileTreeChange;
  /** Old path, rendered muted/struck before the new name when change is "renamed". */
  from?: string;
};

type FileTreeData = {
  id?: string;
  title?: string;
  entries: FileTreeEntry[];
};

const FILE_TREE_CHANGES: readonly FileTreeChange[] = [
  "added",
  "removed",
  "modified",
  "renamed",
];

function isFileTreeChange(value: unknown): value is FileTreeChange {
  return FILE_TREE_CHANGES.includes(value as FileTreeChange);
}

/**
 * One node of the nested tree built from the flat entry paths. Directories
 * are derived from path prefixes (or authored explicitly with a trailing
 * "/"); derived directories never carry change/note state — only explicit
 * entries do (`entryPath` marks a node an entry authored directly).
 */
type FileTreeNode = {
  name: string;
  isDir: boolean;
  /** Normalized full path ("/"-joined segments; directories keep a trailing "/"). */
  path: string;
  /** Set when this node was authored as an entry (not just derived as a prefix). */
  entryPath?: string;
  note?: string;
  change?: FileTreeChange;
  from?: string;
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
 * created on demand; an explicit entry attaches its note/change/from to its
 * own node. A node authored as a file is promoted to a directory if a later
 * entry nests beneath it.
 */
function buildFileTree(entries: FileTreeEntry[]): {
  roots: Map<string, FileTreeNode>;
  entryCount: number;
} {
  const roots = new Map<string, FileTreeNode>();
  let entryCount = 0;
  for (const entry of entries) {
    const { segments, isDir } = normalizePath(entry.path);
    if (segments.length === 0) continue;
    entryCount += 1;
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
      }
      // Keep dir paths trailing-"/"-suffixed once known to be a directory.
      if (node.isDir && node.entryPath && !node.entryPath.endsWith("/")) {
        node.entryPath = `${node.entryPath}/`;
      }
      level = node.children;
    }
  }
  return { roots, entryCount };
}

/**
 * Sort order at every level: directories first, then codepoint-ascending
 * name. Keep in sync with docs-model's `projectFileTree` markdown projection
 * so the read surface and the agent projection agree on ordering.
 */
function sortFileTreeNodes(nodes: Iterable<FileTreeNode>): FileTreeNode[] {
  return Array.from(nodes).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

type FileTreeRow = {
  node: FileTreeNode;
  /** The `tree`-style guide prefix ("│   ", "├── ", "└── ") for this row. */
  guide: string;
};

function flattenFileTree(
  nodes: Iterable<FileTreeNode>,
  prefix: string,
  out: FileTreeRow[],
): FileTreeRow[] {
  const sorted = sortFileTreeNodes(nodes);
  for (const [index, node] of sorted.entries()) {
    const last = index === sorted.length - 1;
    out.push({ node, guide: `${prefix}${last ? "└── " : "├── "}` });
    flattenFileTree(node.children.values(), `${prefix}${last ? "    " : "│   "}`, out);
  }
  return out;
}

/** Row tint + gutter marker + name accent per diff state (dark: variants throughout). */
const CHANGE_STYLES: Record<
  FileTreeChange,
  { row: string; marker: string; markerChar: string; name: string }
> = {
  added: {
    row: "bg-emerald-500/10",
    marker: "text-emerald-600 dark:text-emerald-400",
    markerChar: "+",
    name: "text-emerald-700 dark:text-emerald-300",
  },
  removed: {
    row: "bg-rose-500/10",
    marker: "text-rose-600 dark:text-rose-400",
    markerChar: "-",
    name: "text-rose-700 line-through dark:text-rose-300",
  },
  modified: {
    row: "bg-amber-500/10",
    marker: "text-amber-600 dark:text-amber-400",
    markerChar: "~",
    name: "text-amber-700 dark:text-amber-300",
  },
  renamed: {
    row: "bg-sky-500/10",
    marker: "text-sky-600 dark:text-sky-400",
    markerChar: ">",
    name: "text-sky-700 dark:text-sky-300",
  },
};

function FileTreeRowView({ row }: { row: FileTreeRow }) {
  const { node, guide } = row;
  const change = node.change ? CHANGE_STYLES[node.change] : null;
  return (
    <div
      className={cn("flex min-w-0 items-center px-3", change?.row)}
      data-docs-file-tree-entry={node.entryPath}
      data-docs-file-tree-change={node.change}
    >
      <span
        className={cn("w-4 shrink-0 select-none", change?.marker)}
        aria-hidden={change ? undefined : "true"}
      >
        {change ? change.markerChar : " "}
      </span>
      <span className="whitespace-pre text-muted-foreground/70" aria-hidden="true">
        {guide}
      </span>
      {node.change === "renamed" && node.from && (
        <>
          <span className="whitespace-pre text-muted-foreground line-through">{node.from}</span>
          <span className="whitespace-pre text-muted-foreground">{" → "}</span>
        </>
      )}
      <span
        className={cn(
          "whitespace-pre",
          node.isDir ? "font-medium text-foreground" : "text-foreground",
          change?.name,
        )}
      >
        {node.name}
        {node.isDir && "/"}
      </span>
      {node.note && (
        <span
          className="ml-2 min-w-0 max-w-[48ch] truncate text-muted-foreground"
          title={node.note}
        >
          {"# "}
          {node.note}
        </span>
      )}
    </div>
  );
}

export class FileTreeDocsBlock extends DocsMdxBlock<FileTreeData> {
  readonly tag = "FileTree";
  readonly type = "file-tree";
  readonly targetKind = "file-tree";
  readonly label = "File Tree";
  readonly agentDescription =
    "A `tree`-command-style file/module tree with a diff story, rendered from typed props: { title?: string; entries: Array<{ path: string (\"/\"-separated, no leading \"./\"; a trailing \"/\" marks an explicit directory); note?: string; change?: \"added\"|\"removed\"|\"modified\"|\"renamed\"; from?: string (old path, for renamed) }> }. Directories are derived from path prefixes and sort before files (then alphabetical); `note` renders as a muted `# note` comment after the name; `change` tints the row and adds a +/-/~/> gutter marker; renamed entries render `from → name` with the old path struck through. Derived directories carry no change state — only explicit entries do.";

  render(block: DocsMdxParsedBlock<FileTreeData>) {
    const { data } = block;
    const { roots, entryCount } = buildFileTree(data.entries);
    const rows = flattenFileTree(roots.values(), "", []);
    return (
      <section
        className="not-prose my-4 overflow-hidden rounded-md border bg-muted/20"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="flex flex-wrap items-center gap-2 border-b bg-amber-500/10 px-3 py-2">
          <FolderTreeIcon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
            File Tree
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <Badge variant="outline">
            {entryCount} {entryCount === 1 ? "entry" : "entries"}
          </Badge>
          {data.id && (
            <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
          )}
        </div>
        <div className="p-3">
          <div className="overflow-x-auto rounded-md border bg-background py-2 font-mono text-xs leading-6">
            {rows.length === 0 ? (
              <div className="px-3 text-muted-foreground">(no entries)</div>
            ) : (
              <>
                <div className="flex items-center px-3 text-muted-foreground" aria-hidden="true">
                  <span className="w-4 shrink-0 select-none"> </span>
                  <span className="whitespace-pre">.</span>
                </div>
                {rows.map((row) => (
                  <FileTreeRowView key={row.node.path} row={row} />
                ))}
              </>
            )}
          </div>
        </div>
      </section>
    );
  }
}
