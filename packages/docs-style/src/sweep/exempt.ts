import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import type { CorpusExemptions } from "../profile";

/** The exempt heading that stands for the whole page. */
const WHOLE_PAGE = "*";

/**
 * True when the whole page is exempt, so even its title-level findings are dropped: an exempt
 * section with the heading "*", or a corpus that no tier may read.
 */
export function isExemptPage(path: string, exemptions: CorpusExemptions): boolean {
  if (exemptions.corpus?.tiers === "all") return true;
  return exemptions.sections.some((section) => section.page === path && section.heading === WHOLE_PAGE);
}

/** The blocks of a page that no tier may touch: the union of its exempt sections. */
export function exemptBlockIds(path: string, doc: DocDocument, exemptions: CorpusExemptions): Set<string> {
  if (exemptions.corpus?.tiers === "all") return new Set(Object.keys(doc.blocks));
  const exempt = new Set<string>();
  for (const section of exemptions.sections)
    if (section.page === path) for (const id of sectionBlockIds(doc, section.heading)) exempt.add(id);
  return exempt;
}

/**
 * The blocks of one section: each heading whose text is `heading`, every following sibling up to
 * the next heading of the same or a higher level, and all their descendants. "*" is every block.
 */
export function sectionBlockIds(doc: DocDocument, heading: string): Set<string> {
  if (heading === WHOLE_PAGE) return new Set(Object.keys(doc.blocks));
  const section = new Set<string>();
  const add = (id: string) => {
    if (section.has(id)) return;
    section.add(id);
    doc.blocks[id]?.children.forEach(add);
  };
  for (const parent of Object.values(doc.blocks)) {
    // The level of the matching heading whose section is open, if one is.
    let open: number | undefined;
    for (const id of parent.children) {
      const block = doc.blocks[id];
      if (block?.type === "heading") {
        if (open !== undefined && levelOf(block) <= open) open = undefined;
        if (plainText(block) === heading) open = levelOf(block);
      }
      if (open !== undefined) add(id);
    }
  }
  return section;
}

function levelOf(heading: DocBlock): number {
  return typeof heading.props.level === "number" ? heading.props.level : 1;
}

function plainText(block: DocBlock): string {
  return (block.text ?? []).map((span) => span.insert).join("").trim();
}
