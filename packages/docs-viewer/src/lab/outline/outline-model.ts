import {
  deltaToPlainTextInline,
  docBlockOrder,
  type DocDocument,
} from "@codecaine-ai/docs-model";

export type DocOutlineSection = {
  blockId: string;
  label: string;
  depth: number;
};

/** Derives the document's H1/H2 outline in depth-first document order. */
export function deriveDocOutline(
  doc: DocDocument,
  opts: { maxLevel?: number } = {},
): DocOutlineSection[] {
  const maxLevel = opts.maxLevel ?? 2;
  const sections: DocOutlineSection[] = [];

  for (const blockId of docBlockOrder(doc)) {
    const block = doc.blocks[blockId];
    if (!block || block.type !== "heading") continue;

    const level = block.props.level;
    if (typeof level !== "number" || level > maxLevel) continue;

    sections.push({
      blockId,
      label: deltaToPlainTextInline(block.text).trim() || "Untitled section",
      depth: level,
    });
  }

  return sections;
}
