import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { mdxAdapterDescriptor, stringProp } from "../../render/descriptor-helpers";
import { FileTreeDocsBlock } from "./FileTreeDocsBlock";

const FILE_TREE_CHANGES = ["added", "removed", "modified", "renamed"] as const;

function fileTreeEntries(block: DocBlock): Array<Record<string, unknown>> {
  const raw = block.props.entries;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string",
    )
    .map((entry) => ({
      path: entry.path,
      ...(typeof entry.note === "string" && entry.note.trim() ? { note: entry.note } : {}),
      ...(FILE_TREE_CHANGES.includes(entry.change as (typeof FILE_TREE_CHANGES)[number])
        ? { change: entry.change }
        : {}),
      ...(typeof entry.from === "string" && entry.from.trim() ? { from: entry.from } : {}),
    }));
}

export const descriptors: DocBlockDescriptor[] = [
  mdxAdapterDescriptor({
    type: "file-tree",
    block: new FileTreeDocsBlock(),
    data: (block) => ({
      id: block.id,
      title: stringProp(block, "title"),
      entries: fileTreeEntries(block),
    }),
  }),
];
