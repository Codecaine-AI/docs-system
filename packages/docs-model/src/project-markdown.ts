"use client";

import { agentViewFor } from "./components";
import { deltaToMarkdownInline } from "./delta-markdown";
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
 * sync with the per-type projections in `components/<name>/agent-view.ts` —
 * they are the single source of truth for the projection format):
 *
 * - `heading` -> `#`..`######` per `props.level` (default 2, clamped 1-6).
 * - `paragraph` -> a plain text line (root's own paragraph "shell" is
 *   skipped the same way DocBlockRenderer skips the root's own wrapper —
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
 * - `file-tree` -> a literal tree-command rendering inside a bare fenced
 *   ``` block: a nested tree
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

/** Defensive projection for an unregistered type (unreachable after validation). */
function projectUnknownBlock(block: DocBlock): string | null {
  return block.text && block.text.length > 0 ? deltaToMarkdownInline(block.text) : null;
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

    const context = block.type === "list-item"
      ? { listDepth, listIndex }
      : { listDepth: 0, listIndex: 0 };
    const view = (() => {
      try {
        return agentViewFor(block.type);
      } catch {
        return null;
      }
    })();
    const ownLines = view ? view(block, context) : projectUnknownBlock(block);
    if (ownLines !== null) lines.push(ownLines);

    if (block.type === "list-item") {
      walkChildren(block.children, listDepth + 1);
      return;
    }

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

  // Mirror DocBlockRenderer: the root's own wrapper is skipped, only its
  // children are projected.
  walkChildren(root.children, 0);

  return lines.join("\n\n") + (lines.length > 0 ? "\n" : "");
}
