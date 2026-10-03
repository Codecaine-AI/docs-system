/**
 * Read-only views of a page that judge states share: the heading a block sits under, and a
 * block's sentences. Jev reads markdown, so bold labels, code spans, and links stay visible.
 */
import type { DocDocument } from "@codecaine-ai/docs-model";
import { blockMarkdown } from "./markdown";
import { sentences } from "@codecaine-ai/docs-model/writing/prose";

const parentIndexes = new WeakMap<DocDocument, Map<string, string>>();
function parentOf(doc: DocDocument, id: string): string | undefined {
  let parents = parentIndexes.get(doc);
  if (!parents) {
    parents = new Map();
    for (const block of Object.values(doc.blocks)) for (const child of block.children ?? []) parents.set(child, block.id);
    parentIndexes.set(doc, parents);
  }
  return parents.get(id);
}

/** Text of the nearest heading before the block, walking up through its ancestors. "" when none. */
export function nearestHeading(doc: DocDocument, id: string): string {
  let current: string | undefined = id;
  while (current && current !== doc.root) {
    const parent = parentOf(doc, current);
    const siblings = parent ? doc.blocks[parent]?.children ?? [] : [];
    for (let i = siblings.indexOf(current) - 1; i >= 0; i--) {
      const block = doc.blocks[siblings[i]!];
      if (block?.type === "heading") return blockMarkdown(block);
    }
    current = parent;
  }
  return "";
}

/**
 * Inline markdown split into sentences, with the same rules as the prose lints. Code spans are
 * set aside first, so a period inside one never ends a sentence.
 */
export function markdownSentences(markdown: string): string[] {
  const spans: string[] = [];
  const masked = markdown.replace(/`[^`]*`/g, (span) => {
    spans.push(span);
    return "\u0000";
  });
  let next = 0;
  return sentences(masked).map((sentence) => sentence.replace(/\u0000/g, () => spans[next++] ?? ""));
}
