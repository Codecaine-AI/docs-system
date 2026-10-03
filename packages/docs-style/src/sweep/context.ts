/**
 * The text around a block: what the rewrite model reads for meaning, and what a reviewer reads
 * beside a change. Never edited.
 */
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { blockMarkdown } from "../text";

/** A long neighbor is cut: context is for meaning, not for reading the whole page. */
const CONTEXT_CHARS = 600;

export interface BlockContext {
  heading?: string;
  previous?: string;
  next?: string;
  parent?: string;
}

function parentOf(doc: DocDocument, blockId: string): DocBlock | undefined {
  return Object.values(doc.blocks).find((block) => block.children.includes(blockId));
}

/** The nearest heading above the block, its siblings on each side, and its parent list item. */
export function blockContext(doc: DocDocument, blockId: string): BlockContext {
  const blocks = orderedBlocks(doc);
  const at = blocks.findIndex((block) => block.id === blockId);
  const heading = blocks.slice(0, Math.max(at, 0)).reverse().find((block) => block.type === "heading");
  const parent = parentOf(doc, blockId);
  const siblings = parent?.children ?? [];
  const index = siblings.indexOf(blockId);
  return {
    heading: snippet(heading),
    previous: snippet(doc.blocks[siblings[index - 1] ?? ""]),
    next: snippet(doc.blocks[siblings[index + 1] ?? ""]),
    parent: parent && parent.id !== doc.root ? snippet(parent) : undefined,
  };
}

function snippet(block: DocBlock | undefined): string | undefined {
  const text = blockMarkdown(block);
  if (!text) return undefined;
  return text.length > CONTEXT_CHARS ? `${text.slice(0, CONTEXT_CHARS)}…` : text;
}
