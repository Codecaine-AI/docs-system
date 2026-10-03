/** Picks the pilot pages: the pages where Tiers 2 and 3 have the most to prove. */
import type { StyleFinding } from "../types";

/** A page needs this many sentences before its finding density means anything. */
const MIN_SENTENCES = 20;

/** One extra page from each of these sections, so the pilot is not all one kind of page. */
const DIVERSE_SECTIONS = [
  "00-foundation",
  "30-implementation",
  "40-guides",
  "99-appendix",
  "10-system-design/30-data-model",
] as const;

interface Scored {
  path: string;
  sentences: number;
  structure: number;
  /** Structure findings per 100 sentences. */
  density: number;
}

/**
 * The n worst pages by structure findings per 100 sentences (pages with at least 20 sentences),
 * then the worst page not yet chosen in each diverse section. Ties break on the finding count and
 * then the path, so the same results always give the same pages in the same order.
 */
export function pickPilotPages(
  results: readonly { path: string; findings: readonly StyleFinding[]; sentences: number }[],
  n = 10,
): string[] {
  const ranked = results.map(score).sort(worstFirst);
  const chosen = ranked.filter((page) => page.sentences >= MIN_SENTENCES).slice(0, n).map((page) => page.path);
  for (const section of DIVERSE_SECTIONS) {
    const open = ranked.filter((page) => inSection(page.path, section) && page.sentences > 0 && !chosen.includes(page.path));
    // A small section may have no page long enough; its worst short page still adds variety.
    const pick = open.find((page) => page.sentences >= MIN_SENTENCES) ?? open[0];
    if (pick) chosen.push(pick.path);
  }
  return chosen;
}

function score(result: { path: string; findings: readonly StyleFinding[]; sentences: number }): Scored {
  const structure = result.findings.filter((finding) => finding.layer === "structure").length;
  const density = result.sentences > 0 ? (structure / result.sentences) * 100 : 0;
  return { path: result.path, sentences: result.sentences, structure, density };
}

function worstFirst(a: Scored, b: Scored): number {
  return b.density - a.density || b.structure - a.structure || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function inSection(path: string, section: string): boolean {
  return path === section || path.startsWith(`${section}/`);
}
