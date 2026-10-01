// Read-only views of a document's tree that judgment rules and the Jev engine share.
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { deltaToMarkdownInline } from "@codecaine-ai/docs-model/delta-markdown";

/** A block's inline text as markdown, so bold labels and code spans stay visible. */
export const blockMarkdown = (block: DocBlock | undefined): string => block ? deltaToMarkdownInline(block.text).trim() : "";

/** Parent of every non-root block. */
export function parentIndex(doc: DocDocument): Map<string, string> {
  const parents = new Map<string, string>();
  for (const block of Object.values(doc.blocks)) for (const child of block.children ?? []) parents.set(child, block.id);
  return parents;
}

const cache = new WeakMap<DocDocument, Map<string, string>>();
export function parentOf(doc: DocDocument, id: string): string | undefined {
  let parents = cache.get(doc);
  if (!parents) cache.set(doc, parents = parentIndex(doc));
  return parents.get(id);
}

/** The siblings of a block, in order, including the block itself. */
export function siblings(doc: DocDocument, id: string): string[] {
  const parent = parentOf(doc, id);
  return parent ? doc.blocks[parent]?.children ?? [] : [];
}

/** The unbroken run of sibling list items that contains a list item, in order. */
export function listRun(doc: DocDocument, id: string): string[] {
  const all = siblings(doc, id);
  const at = all.indexOf(id);
  if (at < 0 || doc.blocks[id]?.type !== "list-item") return [];
  let start = at, end = at;
  while (start > 0 && doc.blocks[all[start - 1]!]?.type === "list-item") start--;
  while (end < all.length - 1 && doc.blocks[all[end + 1]!]?.type === "list-item") end++;
  return all.slice(start, end + 1);
}

/** The block right after this one among its siblings. */
export function nextSibling(doc: DocDocument, id: string): string | undefined {
  const all = siblings(doc, id);
  const at = all.indexOf(id);
  return at >= 0 ? all[at + 1] : undefined;
}

/** The sibling right before this one. */
export function previousSibling(doc: DocDocument, id: string): string | undefined {
  const all = siblings(doc, id);
  const at = all.indexOf(id);
  return at > 0 ? all[at - 1] : undefined;
}

/** Text of the nearest heading before the block, walking up through its ancestors. */
export function nearestHeading(doc: DocDocument, id: string): string | undefined {
  let current: string | undefined = id;
  while (current && current !== doc.root) {
    const all = siblings(doc, current);
    for (let i = all.indexOf(current) - 1; i >= 0; i--) {
      const block = doc.blocks[all[i]!];
      if (block?.type === "heading") return blockMarkdown(block);
    }
    current = parentOf(doc, current);
  }
  return undefined;
}

/** A list item's sub-bullets as an indented markdown outline. */
export function outline(doc: DocDocument, ids: readonly string[], depth = 0): string[] {
  return ids.flatMap((id) => {
    const block = doc.blocks[id];
    if (!block) return [];
    const line = `${"  ".repeat(depth)}${block.type === "list-item" ? "- " : ""}${blockMarkdown(block)}`;
    return [line, ...outline(doc, block.children ?? [], depth + 1)];
  });
}
