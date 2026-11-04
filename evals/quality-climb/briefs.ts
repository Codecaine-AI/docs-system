// The brief set of a round: the repo's briefs.json, plus the briefs in the file that QUALITY_CLIMB_LOCAL_BRIEFS
// names. Local briefs read sources from outside this public repo, so the repo never names their paths, and
// nothing publishes a local brief's page.
import { readFileSync } from "node:fs";
import briefsJson from "./briefs.json";
import type { Brief } from "./schema";

export type RoundBrief = Brief & { local?: true };

export const LOCAL_BRIEFS_ENV = "QUALITY_CLIMB_LOCAL_BRIEFS";

/** The repo briefs merged with the local briefs, in id order. A local brief whose id or slug is taken is an error. */
export function loadBriefs(localPath = process.env[LOCAL_BRIEFS_ENV]): RoundBrief[] {
  const repo = briefsJson as Brief[];
  if (!localPath) return repo;
  const local = (JSON.parse(readFileSync(localPath, "utf8")) as Brief[]).map((b): RoundBrief => ({ ...b, local: true }));
  const clash = local.filter((l) => repo.some((r) => r.id === l.id || r.slug === l.slug));
  if (clash.length) throw new Error(`${localPath}: brief ${clash.map((b) => b.id).join(", ")} repeats an id or slug in briefs.json.`);
  return [...repo, ...local].sort((a, b) => a.id - b.id);
}
