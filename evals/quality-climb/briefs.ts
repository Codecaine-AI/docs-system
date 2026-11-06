// The brief set of a round: the repo's briefs.json, plus the briefs in the file that QUALITY_CLIMB_LOCAL_BRIEFS
// names. Local briefs read sources from outside this public repo, so the repo never names their paths, and
// nothing publishes a local brief's page. Each round page folder records its brief in page.json, so assets.ts
// knows a local page from the folder itself and not only from the environment at publish time.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import briefsJson from "./briefs.json";
import { SETS, type Brief, type BriefSet } from "./schema";

export type RoundBrief = Brief & { local?: true };

export const LOCAL_BRIEFS_ENV = "QUALITY_CLIMB_LOCAL_BRIEFS";

/** A slug names folders under the round dir, and the writer removes one before a retry: lowercase words and hyphens only. */
export function checkSlugs<T extends { id: number; slug: string }>(briefs: T[]): T[] {
  const bad = briefs.filter((b) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.slug));
  if (bad.length) throw new Error(`Brief ${bad.map((b) => `${b.id} slug "${b.slug}"`).join(", ")}: a slug holds only lowercase letters, digits and single hyphens.`);
  return briefs;
}

/** The repo briefs merged with the local briefs, in id order. A local brief whose id or slug is taken is an error. */
export function loadBriefs(localPath = process.env[LOCAL_BRIEFS_ENV]): RoundBrief[] {
  const repo = briefsJson as Brief[];
  if (!localPath) return checkSlugs(repo);
  const local = (JSON.parse(readFileSync(localPath, "utf8")) as Brief[]).map((b): RoundBrief => ({ ...b, local: true }));
  const clash = local.filter((l) => repo.some((r) => r.id === l.id || r.slug === l.slug));
  if (clash.length) throw new Error(`${localPath}: brief ${clash.map((b) => b.id).join(", ")} repeats an id or slug in briefs.json.`);
  return checkSlugs([...repo, ...local].sort((a, b) => a.id - b.id));
}

/** What round.ts records in a page folder about the brief that made it. assets.ts publishes a page only when local is false. */
export interface PageProvenance { briefId: number; slug: string; set: BriefSet; local: boolean }

export const PROVENANCE_FILE = "page.json";

export const provenanceOf = (b: RoundBrief): PageProvenance => ({ briefId: b.id, slug: b.slug, set: b.set, local: b.local === true });

/** A lane round's page folder: .tmp/quality-climb/lanes/<lane>/round-<n>/<set>/<NN>-<slug>. */
const LANE_PAGE = /(?:^|\/)\.tmp\/quality-climb\/lanes\/[^/]+\/round-[^/]+\/(climb|held-out)\/(\d+)-([^/]+)\/?$/;

/** The provenance a page folder recorded, or null when it recorded none, or a page.json that is unparsable or incomplete. */
export function readProvenance(pageDir: string): PageProvenance | null {
  const file = join(pageDir, PROVENANCE_FILE);
  if (existsSync(file)) {
    // A page.json that does not parse, or parses to null, records nothing, so the page is refused, even in a lane.
    let p: Partial<PageProvenance> | null;
    try { p = JSON.parse(readFileSync(file, "utf8")) as Partial<PageProvenance> | null; } catch { return null; }
    const ok = !!p && typeof p.local === "boolean" && typeof p.briefId === "number" && typeof p.slug === "string" && (SETS as readonly string[]).includes(p.set as string);
    return ok ? (p as PageProvenance) : null;
  }
  // Lane rounds written before page.json existed have none. A lane's briefs come only from
  // evals/quality-climb/lanes/<lane>/briefs.json (or another --lanes-dir in the repo), never from
  // QUALITY_CLIMB_LOCAL_BRIEFS, so a lane page with no page.json is never local.
  const lane = LANE_PAGE.exec(pageDir);
  return lane ? { briefId: Number(lane[2]), slug: lane[3]!, set: lane[1] as BriefSet, local: false } : null;
}
