"use client";

import { DOCS_COLORS } from "@codecaine-ai/docs-model";
import {
  DocsMdxBlock,
  type DocsMdxParsedBlock,
} from "../base";
import {
  TREE_ICONS,
  TreeGuides,
  TreeHead,
  TreeMark,
  TreeStyle,
  depthStyle,
  elbowGuides,
  treeVars,
  type TreeGuide,
  onColorGroupHover,
} from "../outline-rows/tree-rows";
import {
  buildFileTree,
  colorAttrs,
  colorScope,
  colorSeams,
  relativeFromPath,
  sortFileTreeNodes,
  type FileTreeEntry,
  type FileTreeNode,
  type TreeColorScope,
} from "./tree-model";

export type { FileTreeChange, FileTreeEntry } from "./tree-model";

type FileTreeData = {
  id?: string;
  entries: FileTreeEntry[];
};

type FileTreeRow = {
  node: FileTreeNode;
  depth: number;
  guides: TreeGuide[];
  /** The row's group color, its own or a colored ancestor's. */
  scope: TreeColorScope;
};

function flattenFileTree(
  nodes: Iterable<FileTreeNode>,
  ancestorsLast: readonly boolean[],
  inherited: TreeColorScope,
  out: FileTreeRow[],
): FileTreeRow[] {
  const sorted = sortFileTreeNodes(nodes);
  for (const [index, node] of sorted.entries()) {
    const last = index === sorted.length - 1;
    const scope = colorScope(node, inherited);
    out.push({ node, depth: ancestorsLast.length, guides: elbowGuides(ancestorsLast, last), scope });
    flattenFileTree(node.children.values(), [...ancestorsLast, last], scope, out);
  }
  return out;
}

function hasChange(rows: readonly FileTreeRow[]): boolean {
  return rows.some((row) => row.node.change !== undefined);
}

/**
 * The file tree's style-rail knobs (`--docs-file-tree-*`, the "File tree"
 * pane; defaults in docs-workbench theme/semantic.css), mapped onto the shared
 * trees row system's `--tr-*` variables. Each fallback equals the knob's
 * light default, so the block renders identically where semantic.css is
 * absent (static export). The file explorer reads the same knobs.
 *
 * Each diff state is ONE rail knob writing three vars: the name ink (`-fg`),
 * the gutter glyph (`-marker`) and the row wash hue (`-tint`). The wash is
 * the tint at `--docs-file-tree-change-tint` percent over the panel — a
 * unitless number multiplied by 1% here, since a rail colour override is an
 * opaque hex and the row has to stay a soft tint.
 */
export const FILE_TREE_VARS = treeVars({
  "--tr-bg": "var(--docs-file-tree-bg,var(--docs-panel,#f8f8f7))",
  "--tr-border": "var(--docs-file-tree-border,var(--docs-rule,#e6e5e3))",
  "--tr-border-width": "var(--docs-file-tree-border-width,1px)",
  "--tr-radius": "var(--docs-file-tree-radius,var(--radius,2px))",
  "--tr-pad-y": "var(--docs-file-tree-pad-y,8px)",
  "--tr-pad-x": "var(--docs-file-tree-pad-x,12px)",
  "--tr-text-size": "var(--docs-file-tree-text-size,13px)",
  "--tr-row": "var(--docs-file-tree-line-height,28px)",
  "--tr-ink": "var(--docs-file-tree-file-fg,var(--docs-ink,#1f1f1f))",
  "--tr-folder-fg": "var(--docs-file-tree-folder-fg,var(--docs-ink,#1f1f1f))",
  "--tr-folder-weight": "var(--docs-file-tree-folder-weight,400)",
  "--tr-file-fg": "var(--docs-file-tree-file-fg,var(--docs-ink,#1f1f1f))",
  "--tr-file-weight": "var(--docs-file-tree-file-weight,400)",
  "--tr-group-weight": "var(--docs-file-tree-group-weight,600)",
  "--tr-note-fg": "var(--docs-file-tree-note-fg,var(--docs-muted,#666562))",
  "--tr-note-size": "var(--docs-file-tree-note-text-size,13.5px)",
  "--tr-guide": "var(--docs-file-tree-guide-fg,var(--docs-guide,color-mix(in srgb,#9b9a97 45%,#e6e5e3)))",
  "--tr-muted": "var(--docs-file-tree-muted-fg,var(--docs-muted,#666562))",
  "--tr-added-name": "var(--docs-file-tree-added-fg,var(--docs-diff-add,#26744f))",
  "--tr-added-fg": "var(--docs-file-tree-added-marker,var(--docs-diff-add,#26744f))",
  "--tr-added-bg":
    "color-mix(in srgb,var(--docs-file-tree-added-tint,var(--docs-c-green-solid,#287c55)) calc(var(--docs-file-tree-change-tint,8) * 1%),transparent)",
  "--tr-removed-name": "var(--docs-file-tree-removed-fg,var(--docs-diff-del,#c62121))",
  "--tr-removed-fg": "var(--docs-file-tree-removed-marker,var(--docs-diff-del,#c62121))",
  "--tr-removed-bg":
    "color-mix(in srgb,var(--docs-file-tree-removed-tint,var(--docs-c-red-solid,#e03e3e)) calc(var(--docs-file-tree-change-tint,8) * 1%),transparent)",
  "--tr-modified-name": "var(--docs-file-tree-modified-fg,var(--docs-diff-mod,#805f01))",
  "--tr-modified-fg": "var(--docs-file-tree-modified-marker,var(--docs-diff-mod,#805f01))",
  "--tr-modified-bg":
    "color-mix(in srgb,var(--docs-file-tree-modified-tint,var(--docs-c-yellow-solid,#dfab01)) calc(var(--docs-file-tree-change-tint,8) * 1%),transparent)",
  "--tr-renamed-name": "var(--docs-file-tree-renamed-fg,var(--docs-diff-mod,#805f01))",
  "--tr-renamed-fg": "var(--docs-file-tree-renamed-marker,var(--docs-diff-mod,#805f01))",
  "--tr-renamed-bg":
    "color-mix(in srgb,var(--docs-file-tree-renamed-tint,var(--docs-c-yellow-solid,#dfab01)) calc(var(--docs-file-tree-change-tint,8) * 1%),transparent)",
});

/** The struck old path of a rename, relative to the new name's folder (full path in the title). */
export function RenamedFrom({ node }: { node: FileTreeNode }) {
  if (node.change !== "renamed" || !node.from) return null;
  return (
    <>
      <span className="docs-tree__from" title={node.from}>
        {relativeFromPath(node.from, node.path)}
      </span>
      <span className="docs-tree__arrow" aria-hidden="true">
        {"→"}
      </span>
      <span className="docs-tree__sr"> renamed to </span>
    </>
  );
}

function FileTreeRowView({ row, diff, seam }: { row: FileTreeRow; diff: boolean; seam: boolean }) {
  const { node, depth, guides } = row;
  return (
    <div
      className="docs-tree__row"
      role="listitem"
      aria-level={depth + 1}
      data-docs-file-tree-entry={node.entryPath}
      data-docs-file-tree-change={node.change}
      data-change={node.change}
      {...colorAttrs(row.scope, node.color !== undefined, seam)}
    >
      {diff && <TreeMark change={node.change} />}
      <span
        className={node.note ? "docs-tree__path" : "docs-tree__path docs-tree__path--span"}
        style={depthStyle(depth)}
      >
        <TreeGuides guides={guides} />
        <RenamedFrom node={node} />
        <span className="docs-tree__name" data-dir={node.isDir ? "" : undefined}>
          {node.name}
          {node.isDir && "/"}
        </span>
      </span>
      {node.note && <span className="docs-tree__note">{node.note}</span>}
    </div>
  );
}

export class FileTreeDocsBlock extends DocsMdxBlock<FileTreeData> {
  readonly tag = "FileTree";
  readonly type = "file-tree";
  readonly targetKind = "file-tree";
  readonly label = "File Tree";
  readonly agentDescription =
    "A `tree`-command-style file/module tree with a diff story, rendered from typed props: { entries: Array<{ path: string (\"/\"-separated, no leading \"./\"; a trailing \"/\" marks an explicit directory); note?: string; change?: \"added\"|\"removed\"|\"modified\"|\"renamed\"; from?: string (old path, for renamed); color?: " +
    DOCS_COLORS.map((color) => `"${color}"`).join("|") +
    " }> }. Directories are derived from path prefixes and sort before files (then alphabetical); `note` renders in one aligned muted column after the names; `change` adds a +/−/~/> gutter glyph and a soft row tint; renamed entries render `from → name` with the old path struck through and shown relative to the new name's folder. Derived directories carry no change state — only explicit entries do. A directory's `color` tints its name and washes its whole subtree (a descendant's own color overrides; a file's color covers its row only); a change tint wins on its row.";

  render(block: DocsMdxParsedBlock<FileTreeData>) {
    const { data } = block;
    const { roots } = buildFileTree(data.entries);
    const rows = flattenFileTree(roots.values(), [], undefined, []);
    const diff = hasChange(rows);
    const seams = colorSeams(rows.map((row) => row.scope));
    return (
      <section
        className="not-prose my-4"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <TreeStyle />
        {/* A code surface: paths are machine-checkable, so the tree reads as a
            code panel (dark in both page modes under Code panels "dark"). */}
        <figure className="docs-tree" data-tree-kind="file-tree" data-code-surface="true" style={FILE_TREE_VARS}>
          <TreeHead icon={TREE_ICONS.folder} title="File tree" />
          <div className="docs-tree__rows" onMouseOver={onColorGroupHover} onMouseLeave={onColorGroupHover} role="list" aria-label="File tree" data-diff={diff ? "" : undefined}>
            {rows.length === 0 ? (
              <div className="docs-tree__empty">(no entries)</div>
            ) : (
              rows.map((row, index) => (
                <FileTreeRowView key={row.node.path} row={row} diff={diff} seam={seams[index] ?? false} />
              ))
            )}
          </div>
        </figure>
      </section>
    );
  }
}
