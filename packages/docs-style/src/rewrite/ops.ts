/**
 * A restored rewrite to doc ops. A one-block rewrite is an in-place updateBlock. A lead plus
 * bullets is a structural rewrite: the lead replaces the block text and each bullet becomes a new
 * list item. The ops apply with applyOps from docs-model in the order they are returned.
 */
import type { DeltaSpan, DocDocument, DocOp } from "@codecaine-ai/docs-model";
import type { RewrittenBlock } from "./protect";

/**
 * - paragraph: the bullets become list items right after the paragraph, in its parent.
 * - list-item: the bullets become child items, before the existing children.
 * - A depth-2 bullet becomes a child of the depth-1 bullet above it.
 * Returns [] when the rewrite cannot apply: a missing block, an empty lead, or bullets on a block
 * that cannot hold them, such as a callout. The caller treats [] as an error.
 */
export function rewriteToOps(
  doc: DocDocument,
  blockId: string,
  blocks: RewrittenBlock[],
  newId: (n: number) => string,
): DocOp[] {
  const block = doc.blocks[blockId];
  const [lead, ...rest] = blocks;
  if (!block || !lead || !hasText(lead.spans)) return [];
  const ops: DocOp[] = [{ type: "updateBlock", blockId, text: lead.spans }];
  const bullets = rest.filter((bullet) => hasText(bullet.spans));
  if (bullets.length === 0) return ops;

  let place: { parentId: string; index: number };
  if (block.type === "paragraph") {
    const parent = Object.values(doc.blocks).find((candidate) => candidate.children.includes(blockId));
    if (!parent) return [];
    place = { parentId: parent.id, index: parent.children.indexOf(blockId) + 1 };
  } else if (block.type === "list-item") {
    place = { parentId: blockId, index: 0 };
  } else {
    return [];
  }

  const nextId = freshIds(doc, newId);
  let item: { id: string; children: number } | undefined;
  for (const bullet of bullets) {
    const id = nextId();
    if (bullet.depth >= 2 && item) {
      ops.push(listItem(id, item.id, item.children++, bullet.spans));
    } else {
      ops.push(listItem(id, place.parentId, place.index++, bullet.spans));
      item = { id, children: 0 };
    }
  }
  return ops;
}

function listItem(blockId: string, parentId: string, index: number, text: DeltaSpan[]): DocOp {
  return { type: "insertBlock", blockId, parentId, index, blockType: "list-item", props: {}, text };
}

function hasText(spans: DeltaSpan[]): boolean {
  return spans.some((span) => span.insert.trim().length > 0);
}

/** newId(0), newId(1), ... skipping any ID the document or this rewrite already uses. */
function freshIds(doc: DocDocument, newId: (n: number) => string): () => string {
  const used = new Set(Object.keys(doc.blocks));
  let n = 0;
  return () => {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const id = newId(n++);
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
    throw new Error("rewriteToOps: newId keeps returning block IDs that already exist");
  };
}
