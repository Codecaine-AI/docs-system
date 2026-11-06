// Checks the per-lane brief files of the per-component quality climb: evals/quality-climb/lanes/<lane>/briefs.json.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import repoBriefs from "./briefs.json";
import { BLOCK_GROUPS, SETS, type Brief } from "./schema";

const repo = resolve(import.meta.dir, "../..");
const lanesDir = join(import.meta.dir, "lanes");
const LANES = [
  "rich-text", "code", "pseudocode", "file-tree", "file-explorer", "call-stack",
  "component-tree", "state-shape", "interaction-surface", "structured-table", "process-outline", "stack",
] as const;
const KEYS = ["id", "set", "slug", "title", "reader", "prompt", "sources", "blockTypes", "rewrites"].sort();
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const GROUPS = new Set<string>(BLOCK_GROUPS);

const lanes = LANES.map((lane) => ({
  lane,
  briefs: JSON.parse(readFileSync(join(lanesDir, lane, "briefs.json"), "utf8")) as Brief[],
}));
const all = lanes.flatMap(({ briefs }) => briefs);

/** Every way one brief breaks the Brief shape, as readable strings. */
function shapeErrors(b: Brief): string[] {
  const errors: string[] = [];
  const keys = Object.keys(b).sort();
  if (JSON.stringify(keys) !== JSON.stringify(KEYS)) errors.push(`keys ${keys.join(",")}`);
  if (!Number.isInteger(b.id)) errors.push("id is not an integer");
  if (!(SETS as readonly string[]).includes(b.set)) errors.push(`set "${b.set}"`);
  if (typeof b.slug !== "string" || !SLUG.test(b.slug)) errors.push(`slug "${b.slug}"`);
  for (const field of ["title", "reader", "prompt"] as const) {
    if (typeof b[field] !== "string" || !b[field].trim()) errors.push(`${field} is empty`);
  }
  if (typeof b.rewrites !== "string") errors.push("rewrites is not a string");
  if (!Array.isArray(b.sources) || b.sources.length < 1 || b.sources.length > 4) errors.push("sources: 1 to 4 paths");
  if (!Array.isArray(b.blockTypes) || b.blockTypes.length < 1 || b.blockTypes.length > 2) errors.push("blockTypes: 1 or 2 types");
  else {
    for (const t of b.blockTypes) if (!GROUPS.has(t)) errors.push(`blockTypes "${t}" is not a block group`);
    if (new Set(b.blockTypes).size !== b.blockTypes.length) errors.push("blockTypes repeats a type");
  }
  return errors;
}

test("each of the 12 lanes has a brief file, and no other lane folder exists", () => {
  expect(readdirSync(lanesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()).toEqual([...LANES].sort());
});

test("ids are unique across every lane, start at 100 and do not reuse a whole-page brief id", () => {
  const ids = all.map((b) => b.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Math.min(...ids)).toBe(100);
  const taken = new Set((repoBriefs as Brief[]).map((b) => b.id));
  expect(ids.filter((id) => taken.has(id))).toEqual([]);
});

describe.each(lanes)("lane $lane", ({ lane, briefs }) => {
  test("every brief has the Brief shape", () => {
    expect(briefs.map((b) => ({ id: b.id, errors: shapeErrors(b) })).filter((r) => r.errors.length)).toEqual([]);
  });

  test("12 briefs: 4 climb and 8 held-out", () => {
    expect(briefs.length).toBe(12);
    expect(briefs.filter((b) => b.set === "climb").length).toBe(4);
    expect(briefs.filter((b) => b.set === "held-out").length).toBe(8);
  });

  test("slugs are unique in the lane", () => {
    expect(new Set(briefs.map((b) => b.slug)).size).toBe(briefs.length);
  });

  test("the lane type is the first block type", () => {
    expect(briefs.filter((b) => b.blockTypes[0] !== lane).map((b) => b.id)).toEqual([]);
  });

  test("every source and rewrites path exists in this repo", () => {
    const paths = briefs.flatMap((b) => [...b.sources, ...(b.rewrites ? [b.rewrites] : [])]);
    const outside = paths.filter((p) => !resolve(repo, p).startsWith(`${repo}/`));
    const missing = paths.filter((p) => !existsSync(resolve(repo, p)));
    expect({ outside, missing }).toEqual({ outside: [], missing: [] });
  });

  test("no two briefs share a main source file", () => {
    const main = briefs.map((b) => b.sources[0]);
    expect(main.filter((p, i) => main.indexOf(p) !== i)).toEqual([]);
  });

  test("held-out briefs reuse no source of a climb brief", () => {
    const climb = new Set(briefs.filter((b) => b.set === "climb").flatMap((b) => b.sources));
    const reused = briefs.filter((b) => b.set === "held-out").flatMap((b) => b.sources.filter((s) => climb.has(s)).map((s) => `${b.id}: ${s}`));
    expect(reused).toEqual([]);
  });

  test("no prompt mentions scores or judges", () => {
    expect(briefs.filter((b) => /scor|judg/i.test(b.prompt)).map((b) => b.id)).toEqual([]);
  });
});
