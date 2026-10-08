import { createElement } from "react";
import { DOCS_COLOR_LIST } from "@codecaine-ai/docs-model";
import { CODE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el, invalidBlockPlaceholder, stringProp } from "../../render/descriptor-helpers";
import { buildFileTree, type FileTreeEntry } from "../file-tree/tree-model";
import { FileExplorer } from "./FileExplorer";

const LABEL = "File Explorer";

/** Entries with a string path; buildFileTree tolerates the optional fields itself. */
function explorerEntries(raw: unknown): FileTreeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is FileTreeEntry =>
      !!entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string",
  );
}

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "file-explorer",
    targetKind: "file-explorer",
    label: LABEL,
    agentDescription:
      "An IDE-style file explorer rendered from typed props: { entries: { path; note?; change?: \"added\" | \"removed\" | \"modified\" | \"renamed\"; from?; color?: " +
      DOCS_COLOR_LIST +
      " }[]; title?; maxRows? }. Folders derive from path prefixes, sort first, collapse on click, and compact single-child chains; a changed entry gets a +/\u2212/~/> gutter glyph and a soft row tint (no letter badge), a note wraps in one aligned muted column, and a renamed entry shows its old path struck, relative to its new folder. A folder's color tints its name and washes its whole subtree (a descendant's own color overrides; a file's color covers its row only); a change tint wins on its row. Folder rows and the fold toggle from the keyboard. A head with the family tile and the title shows only when title is set. The list folds past maxRows rows (default 8).",
    patchOps: STRUCTURAL_OPS,
    // Path rows + a note column read at the code measure (block-layout.ts).
    layout: CODE_LEFT_BLOCK_LAYOUT,
    render: (block, ctx) => {
      if (!Array.isArray(block.props.entries)) return invalidBlockPlaceholder(block, ctx, LABEL);
      const maxRows = block.props.maxRows;
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el(
          "section",
          { className: "not-prose my-4", "data-docs-block-type": "file-explorer", "data-source-id": block.id },
          createElement(FileExplorer, {
            roots: buildFileTree(explorerEntries(block.props.entries)).roots,
            title: stringProp(block, "title")?.trim() || undefined,
            maxRows: typeof maxRows === "number" && Number.isInteger(maxRows) && maxRows > 0 ? maxRows : undefined,
          }),
        ),
        ctx.renderChildren(block),
      );
    },
  },
];
