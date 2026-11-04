import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import briefsJson from "./briefs.json";
import { BLOCK_GROUPS, SETS, type Brief } from "./schema";

const briefs = briefsJson as Brief[];
const repo = resolve(import.meta.dir, "../..");

test("there are 10 briefs: 1 to 6 climb, 7 to 10 held out", () => {
  expect(briefs.map((b) => b.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(briefs.filter((b) => b.set === "climb").map((b) => b.id)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(new Set(briefs.map((b) => b.slug)).size).toBe(10);
});

test("every in-scope block-type group appears in at least one climb brief and one held-out brief", () => {
  for (const set of SETS) {
    const covered = new Set(briefs.filter((b) => b.set === set).flatMap((b) => b.blockTypes));
    expect(BLOCK_GROUPS.filter((g) => !covered.has(g))).toEqual([]);
  }
});

test("every source file a brief names exists", () => {
  // Knowledge-base and Core sources live outside this repo, so this check runs only where they exist.
  const missing = briefs.flatMap((b) => b.sources.map((s) => resolve(repo, s))).filter((p) => (p.startsWith(repo) || existsSync("/Users/Ford/workspace")) && !existsSync(p));
  expect(missing).toEqual([]);
});
