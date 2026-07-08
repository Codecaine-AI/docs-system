"use client";

import { deltaToMarkdownInline, deltaToPlainTextInline } from "./delta-markdown";
import type { DocBlock, DocDocument } from "./doc-schema";

/**
 * Runtime-only markdown projection of a DocDocument (M2, D8/D20/D26).
 *
 * `projectToMarkdown` is a PURE function: it walks the in-memory document
 * tree and returns a markdown string. It never touches the filesystem —
 * there is no committed or gitignored markdown mirror, ever (D8/D20/D26).
 * Callers (the `docs render`/`docs grep` CLI, the backend `/docs/project`
 * endpoint) are responsible for deciding what to do with the returned
 * string (print it, grep it, send it over HTTP) — this module writes
 * nothing.
 *
 * ## Block type -> markdown conventions (documented here; keep this comment in
 * sync with the switch below — it is the single source of truth for the
 * projection format):
 *
 * - `heading` -> `#`..`######` per `props.level` (default 2, clamped 1-6).
 * - `paragraph` -> a plain text line (root's own paragraph "shell" is
 *   skipped the same way DocBlockRenderer skips the root's own chrome —
 *   only its children are projected at the top level).
 * - `list-item` -> `-` bullet, or `1.` if `props.ordered === true`, indented
 *   2 spaces per nesting depth. Depth is the list-item's own nesting depth
 *   under other list-items (siblings share a depth; a list-item nested
 *   inside another list-item is depth+1).
 * - `code` -> a fenced code block, ```` ```<language> ```` using
 *   `props.language` when present. When `props.annotations` is present
 *   (`Array<{ lines, label?, note }>`), the fence is followed by one line
 *   per annotation: `> **L<lines>[ (<label>)]:** <note>`, e.g.
 *   `> **L4-9 (Validation):** Rejects orphan children.`
 * - `quote` -> `>`-prefixed blockquote line(s).
 * - `divider` -> a `---` line.
 * - `callout` -> `> **<label>[: <title>]** — body` where the label is
 *   `props.kind` when present (free-form chip, e.g. "Requirement"),
 *   otherwise the uppercased `props.tone` (default "INFO"). E.g.
 *   `> **Decision: Normalized block tree** — body text` or
 *   `> **INFO: Heads up** — body text`. Always greppable on the leading
 *   `> **<label>` token (e.g. `grep '> \*\*Decision'`). Legacy semantic
 *   blocks coerce to callouts carrying their old type as `kind` (see
 *   doc-schema.ts), so this one projection covers them all.
 * - `structured-table` -> optional `**<title>**` bold line, then a markdown
 *   pipe table built from `props.columns: string[]` / `props.rows:
 *   string[][]` (header row, `---` separator row, one line per row).
 * - `interaction-surface` -> optional `**<title>**` bold line, then a bare
 *   fenced ``` block with one signature line per operation in
 *   `props.operations` (document order):
 *   `name(param: type, optional?: type) -> returns` — params render
 *   `name[?][: type]` (the `?` marks `required === false`), ` -> returns`
 *   appears only when `returns` is present, a `  # description` suffix
 *   appends when present, and a `[kind] ` prefix appears only for
 *   query/event operations (actions are the default and render bare).
 * - `mermaid` -> a labeled blockquote:
 *   `> **Mermaid: <title>** — <body>`.
 * - `file-tree` -> optional `**<title>**` bold line, then a literal
 *   tree-command rendering inside a bare fenced ``` block: a nested tree
 *   derived from the v2 entry paths (`{ path, note?, change?, from? }`) with
 *   `├──`/`└──`/`│` guides. Directories come from path prefixes (an explicit
 *   trailing-`/` entry is respected as a directory) and render with a
 *   trailing `/`. Each line is prefixed by a change marker when the entry
 *   carries one — `+ ` added, `- ` removed, `~ ` modified, `> ` renamed
 *   (rendered as `{from} -> {name}`); when ANY entry carries a marker, the
 *   unmarked lines are padded with two spaces so the guides stay aligned.
 *   Notes append as `  # note`. Deterministic: children sort directories
 *   first, then alphabetically (codepoint order).
 * - `canvas` -> an HTML-comment reference line:
 *   `<!-- canvas: <src> [view=<view>] [title="<title>"] -->` — chosen over
 *   a markdown image (`![canvas](src)`) because a canvas is not an image
 *   asset; the comment form greps cleanly on `<!-- canvas:` without being
 *   misread as a broken image link by markdown tooling.
 * - `image` -> standard markdown image `![alt](src)` with an optional
 *   `*caption*` line beneath when `props.caption` is present.
 * - `video` -> a labeled blockquote in the callout family's shape:
 *   `> **Video[: <title>]** — <url ?? src>[ — <caption>]` (external `url`
 *   wins over the bundle-relative `src` when both are present). Chosen over
 *   a markdown image/link because the target is not an image asset and may
 *   be a bare provider URL; the leading `> **Video` token greps cleanly
 *   (e.g. `grep '> \*\*Video'`).
 *
 * Every block type's `text` (delta spans) projects through
 * `deltaToMarkdownInline` (reference marks render plain per D35 — see
 * delta-markdown.ts). Children are projected depth-first, in document
 * order, after the block's own line(s), except `list-item` which projects
 * children as nested indented list lines.
 */

// Kept types that still project as a labeled blockquote (`> **Label: title**
// — body`). Retired semantic types never reach projection: validation coerces
// them to callouts (doc-schema.ts), and the callout projection carries their
// old type name as the kind label.
const CALLOUT_LIKE_SEMANTIC_TYPES = new Set(["mermaid"]);

const SEMANTIC_LABELS: Record<string, string> = {
  mermaid: "Mermaid",
};

function stringProp(block: DocBlock, key: string): string | undefined {
  const value = block.props[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberProp(block: DocBlock, key: string): number | undefined {
  const value = block.props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function headingLevel(block: DocBlock): number {
  const level = numberProp(block, "level");
  if (level && Number.isInteger(level) && level >= 1 && level <= 6) return level;
  return 2;
}

function blockquotePrefix(text: string): string {
  if (!text) return ">";
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

function projectSemanticBlock(block: DocBlock): string {
  const label = SEMANTIC_LABELS[block.type] ?? block.type;
  const title = stringProp(block, "title");
  const body = deltaToMarkdownInline(block.text);

  let head = `**${label}`;
  if (title) head += `: ${title}`;
  head += "**";
  if (body) head += ` — ${body}`;
  return blockquotePrefix(head);
}

function projectCallout(block: DocBlock): string {
  // kind (free-form label chip, incl. coerced legacy type names) wins over
  // the tone-derived label.
  const label = stringProp(block, "kind") ?? (stringProp(block, "tone") ?? "info").toUpperCase();
  const title = stringProp(block, "title");
  const body = deltaToMarkdownInline(block.text);

  let head = `**${label}`;
  if (title) head += `: ${title}`;
  head += "**";
  if (body) head += ` — ${body}`;
  return blockquotePrefix(head);
}

type CodeAnnotation = { lines: string; label?: string; note: string };

function codeAnnotations(block: DocBlock): CodeAnnotation[] {
  const raw = block.props.annotations;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as { lines?: unknown }).lines === "string" &&
        typeof (entry as { note?: unknown }).note === "string",
    )
    .map((entry) => ({
      lines: entry.lines as string,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : undefined,
      note: entry.note as string,
    }));
}

function projectStructuredTable(block: DocBlock): string {
  const title = stringProp(block, "title");
  const rawColumns = block.props.columns;
  const columns = Array.isArray(rawColumns)
    ? rawColumns.filter((column): column is string => typeof column === "string")
    : [];
  const rawRows = block.props.rows;
  const rows = Array.isArray(rawRows)
    ? rawRows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => row.map((cell) => (typeof cell === "string" ? cell : String(cell ?? ""))))
    : [];

  const tableLines: string[] = [];
  if (columns.length > 0) {
    tableLines.push(`| ${columns.join(" | ")} |`);
    tableLines.push(`| ${columns.map(() => "---").join(" | ")} |`);
    for (const row of rows) tableLines.push(`| ${row.join(" | ")} |`);
  }
  const table = tableLines.join("\n");
  if (title && table) return `**${title}**\n\n${table}`;
  return title ? `**${title}**` : table;
}

type InteractionSurfaceParam = {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
};

type InteractionSurfaceOperation = {
  name: string;
  description?: string;
  params?: InteractionSurfaceParam[];
  returns?: string;
  kind?: "action" | "query" | "event";
};

const INTERACTION_SURFACE_KINDS = ["action", "query", "event"] as const;

function isInteractionSurfaceKind(value: unknown): value is "action" | "query" | "event" {
  return typeof value === "string" && (INTERACTION_SURFACE_KINDS as readonly string[]).includes(value);
}

function interactionSurfaceOperations(block: DocBlock): InteractionSurfaceOperation[] {
  const raw = block.props.operations;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string",
    )
    .map((entry) => ({
      name: entry.name as string,
      description:
        typeof entry.description === "string" && entry.description.trim()
          ? entry.description.trim()
          : undefined,
      params: (Array.isArray(entry.params) ? entry.params : [])
        .filter(
          (param): param is Record<string, unknown> =>
            !!param && typeof param === "object" && typeof (param as { name?: unknown }).name === "string",
        )
        .map((param) => ({
          name: param.name as string,
          type: typeof param.type === "string" && param.type.trim() ? param.type.trim() : undefined,
          required: typeof param.required === "boolean" ? param.required : undefined,
          description:
            typeof param.description === "string" && param.description.trim()
              ? param.description.trim()
              : undefined,
        })),
      returns: typeof entry.returns === "string" && entry.returns.trim() ? entry.returns.trim() : undefined,
      kind: isInteractionSurfaceKind(entry.kind) ? entry.kind : undefined,
    }));
}

/**
 * Signature-line rendering (see the module header for the format):
 * `[kind] name(param: type, optional?: type) -> returns  # description` —
 * the `[kind]` prefix only for query/event, ` -> returns` and
 * `  # description` only when present. One line per operation, document order.
 */
function projectInteractionSurface(block: DocBlock): string {
  const title = stringProp(block, "title");
  const lines = interactionSurfaceOperations(block).map((operation) => {
    const kindPrefix =
      operation.kind === "query" || operation.kind === "event" ? `[${operation.kind}] ` : "";
    const params = (operation.params ?? [])
      .map((param) => {
        const optional = param.required === false ? "?" : "";
        return param.type ? `${param.name}${optional}: ${param.type}` : `${param.name}${optional}`;
      })
      .join(", ");
    const returns = operation.returns ? ` -> ${operation.returns}` : "";
    const description = operation.description ? `  # ${operation.description}` : "";
    return `${kindPrefix}${operation.name}(${params})${returns}${description}`;
  });
  const fence = lines.length > 0 ? "```\n" + lines.join("\n") + "\n```" : "";
  if (title && fence) return `**${title}**\n\n${fence}`;
  return title ? `**${title}**` : fence;
}

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
  const title = stringProp(block, "title");
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

  const fence = "```\n" + lines.join("\n") + "\n```";
  return title ? `**${title}**\n\n${fence}` : fence;
}

function projectCanvas(block: DocBlock): string {
  const src = stringProp(block, "src");
  const view = stringProp(block, "view");
  const title = stringProp(block, "title");
  if (!src) return "<!-- canvas: (missing src) -->";
  let comment = `<!-- canvas: ${src}`;
  if (view) comment += ` view=${view}`;
  if (title) comment += ` title="${title}"`;
  comment += " -->";
  return comment;
}

function projectImage(block: DocBlock): string {
  const src = stringProp(block, "src") ?? "";
  const alt = stringProp(block, "alt") ?? stringProp(block, "caption") ?? "";
  const caption = stringProp(block, "caption");
  const lines = [`![${alt}](${src})`];
  if (caption) lines.push(`*${caption}*`);
  return lines.join("\n");
}

function projectVideo(block: DocBlock): string {
  // External url wins over the bundle-relative src when both are present —
  // same precedence the video block's render surface applies.
  const target = stringProp(block, "url") ?? stringProp(block, "src");
  const title = stringProp(block, "title");
  const caption = stringProp(block, "caption");

  let head = "**Video";
  if (title) head += `: ${title}`;
  head += "**";
  if (target) head += ` — ${target}`;
  if (caption) head += ` — ${caption}`;
  return blockquotePrefix(head);
}

/** Renders a single block's own line(s) — NOT its children (handled by the caller/walker). */
function projectBlockOwnLines(block: DocBlock): string | null {
  switch (block.type) {
    case "heading": {
      const level = headingLevel(block);
      return `${"#".repeat(level)} ${deltaToMarkdownInline(block.text)}`;
    }
    case "paragraph":
      return block.text && block.text.length > 0 ? deltaToMarkdownInline(block.text) : null;
    case "code": {
      const language = stringProp(block, "language") ?? "";
      const fence = "```" + language + "\n" + deltaToPlainTextInline(block.text) + "\n```";
      const annotations = codeAnnotations(block);
      if (annotations.length === 0) return fence;
      const annotationLines = annotations.map(
        (annotation) =>
          `> **L${annotation.lines}${annotation.label ? ` (${annotation.label})` : ""}:** ${annotation.note}`,
      );
      return fence + "\n" + annotationLines.join("\n");
    }
    case "quote":
      return blockquotePrefix(deltaToMarkdownInline(block.text));
    case "divider":
      return "---";
    case "callout":
      return projectCallout(block);
    case "canvas":
      return projectCanvas(block);
    case "image":
      return projectImage(block);
    case "video":
      return projectVideo(block);
    case "file-tree":
      return projectFileTree(block);
    case "structured-table":
      return projectStructuredTable(block);
    case "interaction-surface":
      return projectInteractionSurface(block);
    case "list-item":
      // Handled specially by the walker (needs depth + ordered numbering).
      return null;
    default:
      if (CALLOUT_LIKE_SEMANTIC_TYPES.has(block.type)) {
        return projectSemanticBlock(block);
      }
      // Unknown/unhandled block type: fall back to its plain text, if any.
      return block.text && block.text.length > 0 ? deltaToMarkdownInline(block.text) : null;
  }
}

function projectListItem(block: DocBlock, depth: number, index: number): string {
  const indent = "  ".repeat(depth);
  const ordered = block.props.ordered === true;
  const bullet = ordered ? `${index + 1}.` : "-";
  return `${indent}${bullet} ${deltaToMarkdownInline(block.text)}`;
}

/**
 * Depth-first projection to markdown text. Pure — reads only the in-memory
 * DocDocument, performs no I/O of any kind (D8/D20/D26).
 */
export function projectToMarkdown(doc: DocDocument): string {
  const lines: string[] = [];

  const walk = (blockId: string, listDepth: number, listIndex: number) => {
    const block = doc.blocks[blockId];
    if (!block) return;

    if (block.type === "list-item") {
      lines.push(projectListItem(block, listDepth, listIndex));
      walkChildren(block.children, listDepth + 1);
      return;
    }

    const ownLines = projectBlockOwnLines(block);
    if (ownLines !== null) lines.push(ownLines);

    walkChildren(block.children, 0);
  };

  /**
   * Walks a sibling list, numbering list-items by their position within the
   * consecutive run of list-item siblings (a non-list-item sibling resets
   * the run) — so ordered bullets start at "1." regardless of how many
   * non-list blocks precede the run.
   */
  const walkChildren = (children: readonly string[], listDepth: number) => {
    let runIndex = 0;
    for (const childId of children) {
      const child = doc.blocks[childId];
      if (child?.type === "list-item") {
        walk(childId, listDepth, runIndex);
        runIndex += 1;
      } else {
        runIndex = 0;
        walk(childId, 0, 0);
      }
    }
  };

  const root = doc.blocks[doc.root];
  if (!root) return "";

  // Mirror DocBlockRenderer: the root's own chrome is skipped, only its
  // children are projected.
  walkChildren(root.children, 0);

  return lines.join("\n\n") + (lines.length > 0 ? "\n" : "");
}
