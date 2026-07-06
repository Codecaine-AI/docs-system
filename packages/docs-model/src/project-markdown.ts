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
 * ## Flavour -> markdown conventions (documented here; keep this comment in
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
 *   `props.language` when present.
 * - `quote` -> `>`-prefixed blockquote line(s).
 * - `divider` -> a `---` line.
 * - `callout` -> `> **[TONE]** _optional title_ — body`, e.g.
 *   `> **INFO:** **Heads up** — body text`. Tone uppercased from
 *   `props.tone` (default "info").
 * - `decision`/`constraint`/`assumption`/`observation`/`outcome`/
 *   `requirement`/`implementation`/`testing` (semantic/engineering
 *   flavours) -> a labeled blockquote:
 *   `> **Decision (accepted): Normalized block tree** — body text`
 *   The convention is `> **<Label>[ (<status/severity/confidence>)][:
 *   <title>]** — <body>` — always greppable on the leading
 *   `> **<Label>` token (e.g. `grep '> \*\*Decision'`).
 * - `agent-contract` -> `> **Agent Contract: <agent>** — body` plus
 *   `tools:`/`approvals:` sub-lines when present.
 * - `file-tree` -> a fenced ```` ```text ```` block listing `path — note`
 *   per entry (falls back to bare path when note is absent).
 * - `canvas` -> an HTML-comment reference line:
 *   `<!-- canvas: <src> [view=<view>] [title="<title>"] -->` — chosen over
 *   a markdown image (`![canvas](src)`) because a canvas is not an image
 *   asset; the comment form greps cleanly on `<!-- canvas:` without being
 *   misread as a broken image link by markdown tooling.
 * - `image` -> standard markdown image `![alt](src)` with an optional
 *   `*caption*` line beneath when `props.caption` is present.
 * - `attachment` -> standard markdown link `[name](src)`.
 *
 * Every flavour's `text` (delta spans) projects through
 * `deltaToMarkdownInline` (reference marks render plain per D35 — see
 * delta-markdown.ts). Children are projected depth-first, in document
 * order, after the block's own line(s), except `list-item` which projects
 * children as nested indented list lines.
 */

const CALLOUT_LIKE_SEMANTIC_FLAVOURS = new Set([
  "decision",
  "constraint",
  "assumption",
  "observation",
  "outcome",
  "requirement",
  "implementation",
  "testing",
]);

const SEMANTIC_LABELS: Record<string, string> = {
  decision: "Decision",
  constraint: "Constraint",
  assumption: "Assumption",
  observation: "Observation",
  outcome: "Outcome",
  requirement: "Requirement",
  implementation: "Implementation",
  testing: "Testing",
};

/** Which props key (if any) supplies the semantic flavour's status-like qualifier. */
const SEMANTIC_STATUS_PROP: Record<string, string | undefined> = {
  decision: "status",
  constraint: "severity",
  assumption: "confidence",
  observation: undefined,
  outcome: undefined,
  requirement: undefined,
  implementation: undefined,
  testing: undefined,
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
  const label = SEMANTIC_LABELS[block.flavour] ?? block.flavour;
  const statusProp = SEMANTIC_STATUS_PROP[block.flavour];
  const status = statusProp ? stringProp(block, statusProp) : undefined;
  const title = stringProp(block, "title");
  const body = deltaToMarkdownInline(block.text);

  let head = `**${label}`;
  if (status) head += ` (${status})`;
  if (title) head += `: ${title}`;
  head += "**";
  if (body) head += ` — ${body}`;
  return blockquotePrefix(head);
}

function projectCallout(block: DocBlock): string {
  const tone = (stringProp(block, "tone") ?? "info").toUpperCase();
  const title = stringProp(block, "title");
  const body = deltaToMarkdownInline(block.text);

  let head = `**${tone}:**`;
  if (title) head += ` **${title}**`;
  if (body) head += title ? ` — ${body}` : ` ${body}`;
  return blockquotePrefix(head);
}

function projectAgentContract(block: DocBlock): string {
  const agent = stringProp(block, "agent");
  const title = stringProp(block, "title");
  const tools = stringProp(block, "tools");
  const approvals = stringProp(block, "approvals");
  const body = deltaToMarkdownInline(block.text);

  const lines: string[] = [];
  let head = "**Agent Contract";
  if (agent) head += `: ${agent}`;
  head += "**";
  if (title) head += ` — ${title}`;
  lines.push(head);
  if (body) lines.push(body);
  if (tools) lines.push(`tools: ${tools}`);
  if (approvals) lines.push(`approvals: ${approvals}`);
  return blockquotePrefix(lines.join("\n"));
}

function fileTreeEntries(block: DocBlock): Array<{ path: string; note?: string }> {
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
    }));
}

function projectFileTree(block: DocBlock): string {
  const title = stringProp(block, "title");
  const entries = fileTreeEntries(block);
  const lines = entries.map((entry) => (entry.note ? `${entry.path} — ${entry.note}` : entry.path));
  const body = lines.join("\n");
  const header = title ? `${title}\n` : "";
  return "```text\n" + header + body + "\n```";
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

function projectAttachment(block: DocBlock): string {
  const src = stringProp(block, "src") ?? "";
  const name = stringProp(block, "name") ?? src ?? "attachment";
  return `[${name}](${src})`;
}

/** Renders a single block's own line(s) — NOT its children (handled by the caller/walker). */
function projectBlockOwnLines(block: DocBlock): string | null {
  switch (block.flavour) {
    case "heading": {
      const level = headingLevel(block);
      return `${"#".repeat(level)} ${deltaToMarkdownInline(block.text)}`;
    }
    case "paragraph":
      return block.text && block.text.length > 0 ? deltaToMarkdownInline(block.text) : null;
    case "code": {
      const language = stringProp(block, "language") ?? "";
      return "```" + language + "\n" + deltaToPlainTextInline(block.text) + "\n```";
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
    case "attachment":
      return projectAttachment(block);
    case "agent-contract":
      return projectAgentContract(block);
    case "file-tree":
      return projectFileTree(block);
    case "list-item":
      // Handled specially by the walker (needs depth + ordered numbering).
      return null;
    default:
      if (CALLOUT_LIKE_SEMANTIC_FLAVOURS.has(block.flavour)) {
        return projectSemanticBlock(block);
      }
      // Unknown/unhandled flavour: fall back to its plain text, if any.
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

    if (block.flavour === "list-item") {
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
      if (child?.flavour === "list-item") {
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
