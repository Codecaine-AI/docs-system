"use client";

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

/**
 * Every tunable value reads a `--docs-file-tree-*` token (the workbench style
 * rail's "File tree" pane; defaults in docs-workbench theme/semantic.css) with
 * a literal fallback equal to that default, so the block renders identically
 * where semantic.css is absent (static export). Class names stay complete
 * literals — Tailwind scans this source and cannot see composed strings.
 */
const CARD_CLASS =
  "overflow-x-auto rounded-[var(--docs-file-tree-radius,var(--radius,2px))] border-[length:var(--docs-file-tree-border-width,1px)] border-[color:var(--docs-file-tree-border,var(--border))] bg-[var(--docs-file-tree-bg,var(--background))] py-[var(--docs-file-tree-pad-y,8px)] font-mono text-[length:var(--docs-file-tree-text-size,12px)] leading-[var(--docs-file-tree-line-height,24px)]";
/** Horizontal card padding lives on each row so a diff tint spans the card edge to edge. */
const ROW_PAD_X_CLASS = "px-[var(--docs-file-tree-pad-x,12px)]";
/** Root dot, empty placeholder, and the struck `from` path of a rename. */
const MUTED_FG_CLASS = "text-[color:var(--docs-file-tree-muted-fg,var(--muted-foreground))]";
const GUIDE_FG_CLASS =
  "text-[color:var(--docs-file-tree-guide-fg,color-mix(in_oklab,var(--muted-foreground)_70%,transparent))]";
const FOLDER_WEIGHT_CLASS = "[font-weight:var(--docs-file-tree-folder-weight,500)]";
const FILE_WEIGHT_CLASS = "[font-weight:var(--docs-file-tree-file-weight,400)]";
const FOLDER_FG_CLASS = "text-[color:var(--docs-file-tree-folder-fg,var(--foreground))]";
const FILE_FG_CLASS = "text-[color:var(--docs-file-tree-file-fg,var(--foreground))]";
const NOTE_CLASS =
  "ml-2 min-w-0 max-w-[48ch] truncate text-[length:var(--docs-file-tree-note-text-size,12px)] text-[color:var(--docs-file-tree-note-fg,var(--muted-foreground))]";

/**
 * Row tint + gutter marker + name accent per diff state. Each state is ONE
 * rail knob writing three vars (name `-fg`, gutter `-marker`, row `-tint`);
 * their defaults are three shades of one hue (and differ light/dark), so the
 * fallbacks carry `dark:` variants. The row wash is the tint colour at
 * `--docs-file-tree-change-tint` percent — a unitless number multiplied by 1%
 * at the use site, since rail colour overrides are opaque hex.
 */
const CHANGE_STYLES: Record<
  FileTreeChange,
  { row: string; marker: string; markerChar: string; name: string }
> = {
  added: {
    row: "bg-[color-mix(in_oklab,var(--docs-file-tree-added-tint,var(--color-emerald-500))_calc(var(--docs-file-tree-change-tint,10)*1%),transparent)]",
    marker:
      "text-[color:var(--docs-file-tree-added-marker,var(--color-emerald-600))] dark:text-[color:var(--docs-file-tree-added-marker,var(--color-emerald-400))]",
    markerChar: "+",
    name: "text-[color:var(--docs-file-tree-added-fg,var(--color-emerald-700))] dark:text-[color:var(--docs-file-tree-added-fg,var(--color-emerald-300))]",
  },
  removed: {
    row: "bg-[color-mix(in_oklab,var(--docs-file-tree-removed-tint,var(--color-rose-500))_calc(var(--docs-file-tree-change-tint,10)*1%),transparent)]",
    marker:
      "text-[color:var(--docs-file-tree-removed-marker,var(--color-rose-600))] dark:text-[color:var(--docs-file-tree-removed-marker,var(--color-rose-400))]",
    markerChar: "-",
    name: "text-[color:var(--docs-file-tree-removed-fg,var(--color-rose-700))] line-through dark:text-[color:var(--docs-file-tree-removed-fg,var(--color-rose-300))]",
  },
  modified: {
    row: "bg-[color-mix(in_oklab,var(--docs-file-tree-modified-tint,var(--color-amber-500))_calc(var(--docs-file-tree-change-tint,10)*1%),transparent)]",
    marker:
      "text-[color:var(--docs-file-tree-modified-marker,var(--color-amber-600))] dark:text-[color:var(--docs-file-tree-modified-marker,var(--color-amber-400))]",
    markerChar: "~",
    name: "text-[color:var(--docs-file-tree-modified-fg,var(--color-amber-700))] dark:text-[color:var(--docs-file-tree-modified-fg,var(--color-amber-300))]",
  },
  renamed: {
    row: "bg-[color-mix(in_oklab,var(--docs-file-tree-renamed-tint,var(--color-sky-500))_calc(var(--docs-file-tree-change-tint,10)*1%),transparent)]",
    marker:
      "text-[color:var(--docs-file-tree-renamed-marker,var(--color-sky-600))] dark:text-[color:var(--docs-file-tree-renamed-marker,var(--color-sky-400))]",
    markerChar: ">",
    name: "text-[color:var(--docs-file-tree-renamed-fg,var(--color-sky-700))] dark:text-[color:var(--docs-file-tree-renamed-fg,var(--color-sky-300))]",
  },
};

function FileTreeRowView({ row }: { row: FileTreeRow }) {
  const { node, guide } = row;
  const change = node.change ? CHANGE_STYLES[node.change] : null;
  return (
    <div
      className={cn("flex min-w-0 items-center", ROW_PAD_X_CLASS, change?.row)}
      data-docs-file-tree-entry={node.entryPath}
      data-docs-file-tree-change={node.change}
    >
      <span
        className={cn("w-4 shrink-0 select-none", change?.marker)}
        aria-hidden={change ? undefined : "true"}
      >
        {change ? change.markerChar : " "}
      </span>
      <span className={cn("whitespace-pre", GUIDE_FG_CLASS)} aria-hidden="true">
        {guide}
      </span>
      {node.change === "renamed" && node.from && (
        <>
          <span className={cn("whitespace-pre line-through", MUTED_FG_CLASS)}>{node.from}</span>
          <span className={cn("whitespace-pre", MUTED_FG_CLASS)}>{" → "}</span>
        </>
      )}
      <span
        className={cn(
          "whitespace-pre",
          node.isDir ? FOLDER_WEIGHT_CLASS : FILE_WEIGHT_CLASS,
          // A diff state owns the name colour outright; otherwise folder/file ink.
          change ? change.name : node.isDir ? FOLDER_FG_CLASS : FILE_FG_CLASS,
        )}
      >
        {node.name}
        {node.isDir && "/"}
      </span>
      {node.note && (
        <span className={NOTE_CLASS} title={node.note}>
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
    "A `tree`-command-style file/module tree with a diff story, rendered from typed props: { entries: Array<{ path: string (\"/\"-separated, no leading \"./\"; a trailing \"/\" marks an explicit directory); note?: string; change?: \"added\"|\"removed\"|\"modified\"|\"renamed\"; from?: string (old path, for renamed) }> }. Directories are derived from path prefixes and sort before files (then alphabetical); `note` renders as a muted `# note` comment after the name; `change` tints the row and adds a +/-/~/> gutter marker; renamed entries render `from → name` with the old path struck through. Derived directories carry no change state — only explicit entries do.";

  render(block: DocsMdxParsedBlock<FileTreeData>) {
    const { data } = block;
    const { roots } = buildFileTree(data.entries);
    const rows = flattenFileTree(roots.values(), "", []);
    return (
      <section
        className="not-prose my-4"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className={CARD_CLASS}>
          {rows.length === 0 ? (
            <div className={cn(ROW_PAD_X_CLASS, MUTED_FG_CLASS)}>(no entries)</div>
          ) : (
            <>
              <div className={cn("flex items-center", ROW_PAD_X_CLASS, MUTED_FG_CLASS)} aria-hidden="true">
                <span className="w-4 shrink-0 select-none"> </span>
                <span className="whitespace-pre">.</span>
              </div>
              {rows.map((row) => (
                <FileTreeRowView key={row.node.path} row={row} />
              ))}
            </>
          )}
        </div>
      </section>
    );
  }
}
