// A lane climbs one component on its own. Its folder lanes/<lane>/ holds briefs.json (the Brief shape, each one
// in the climb or held-out set) and criteria.json (the lane's own criteria). Every lane also scores
// lanes/base-criteria.json. A lane's council writes criteria.json, so a lane without one scores the base criteria only.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { checkSlugs, type RoundBrief } from "./briefs";
import { CriterionSchema, LANES, SETS, isLane, type Brief, type Criterion, type Lane } from "./schema";

export const LANES_DIR = join(import.meta.dir, "lanes");
export const BASE_CRITERIA = join(LANES_DIR, "base-criteria.json");

export interface LaneSpec { lane: Lane; dir: string; briefs: RoundBrief[]; criteria: Criterion[] }

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

function readCriteria(path: string): Criterion[] {
  const value = readJson(path);
  const schema = Type.Array(CriterionSchema, { minItems: 1 });
  if (!Value.Check(schema, value)) {
    const first = Value.Errors(schema, value).First();
    throw new Error(`${path}: ${first?.path || "/"} ${first?.message ?? "invalid"}. A criterion is {id, question, group}.`);
  }
  return value;
}

function readBriefs(path: string, lane: Lane): RoundBrief[] {
  const briefs = readJson(path) as Brief[];
  const bad = briefs.filter((b) => !(SETS as readonly string[]).includes(b.set) || !Array.isArray(b.sources) || !b.blockTypes?.includes(lane));
  if (bad.length) throw new Error(`${path}: brief ${bad.map((b) => b.id).join(", ")} needs a set of climb or held-out, a sources list, and "${lane}" in blockTypes.`);
  if (new Set(briefs.map((b) => b.id)).size !== briefs.length || new Set(briefs.map((b) => b.slug)).size !== briefs.length) throw new Error(`${path}: two briefs share an id or slug.`);
  return checkSlugs(briefs).sort((a, b) => a.id - b.id);
}

/** The lane's briefs and its criteria: the base criteria, then the lane's own. `lanesDir` holds the lane folders (lanes/ by default). */
export function loadLane(lane: string, lanesDir = LANES_DIR): LaneSpec {
  if (!isLane(lane)) throw new Error(`Unknown lane ${lane}. Use one of: ${LANES.join(", ")}.`);
  const dir = join(lanesDir, lane);
  if (!existsSync(join(dir, "briefs.json"))) throw new Error(`Lane ${lane} has no briefs: write ${join(dir, "briefs.json")}.`);
  const own = join(dir, "criteria.json");
  const criteria = [...readCriteria(BASE_CRITERIA), ...(existsSync(own) ? readCriteria(own) : [])];
  const repeated = criteria.map((c) => c.id).filter((id, i, ids) => ids.indexOf(id) !== i);
  if (repeated.length) throw new Error(`Lane ${lane}: criterion id ${repeated.join(", ")} is used twice across the base and lane criteria.`);
  return { lane, dir, briefs: readBriefs(join(dir, "briefs.json"), lane), criteria };
}
