import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { publishable } from "./assets";
import { LOCAL_BRIEFS_ENV, loadBriefs } from "./briefs";
import { BLOCK_GROUPS, SETS, type Brief } from "./schema";
import { freezeSources, sourcePaths } from "./write";

const repo = resolve(import.meta.dir, "../..");
const localPath = process.env[LOCAL_BRIEFS_ENV];
// With the local briefs file, the round's full set of 10. Without it, the 8 briefs this public repo holds.
const briefs = loadBriefs(localPath);
const uncovered = (set: string) => {
  const covered = new Set(briefs.filter((b) => b.set === set).flatMap((b) => b.blockTypes));
  return BLOCK_GROUPS.filter((g) => !covered.has(g));
};

test("the repo holds briefs 1 to 5, 7, 8 and 10, and the local briefs file makes the set of 10", () => {
  expect(loadBriefs("").map((b) => b.id)).toEqual([1, 2, 3, 4, 5, 7, 8, 10]);
  if (localPath) {
    expect(briefs.map((b) => b.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(briefs.filter((b) => b.set === "climb").map((b) => b.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(briefs.filter((b) => b.local).map((b) => b.id)).toEqual([6, 9]);
  }
  expect(new Set(briefs.map((b) => b.slug)).size).toBe(briefs.length);
});

test("every in-scope block-type group appears in at least one climb brief and one held-out brief", () => {
  if (localPath) {
    for (const set of SETS) expect(uncovered(set)).toEqual([]);
    return;
  }
  // The repo set alone covers the climb set. Brief 9 is the only held-out brief with a callout or a table.
  expect(uncovered("climb")).toEqual([]);
  expect(uncovered("held-out")).toEqual(["callout", "structured-table"]);
});

test("no repo brief names a path outside this repo", () => {
  const outside = loadBriefs("").flatMap((b) => [...b.sources, b.rewrites]).filter((p) => !resolve(repo, p).startsWith(`${repo}/`));
  expect(outside).toEqual([]);
});

test("a local brief is marked local, is never publishable, and cannot reuse a repo id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "quality-climb-briefs-"));
  try {
    const local: Brief = { ...loadBriefs("")[0]!, id: 11, slug: "local-page" };
    await writeFile(join(dir, "ok.json"), JSON.stringify([local]));
    const merged = loadBriefs(join(dir, "ok.json"));
    expect(merged.find((b) => b.id === 11)?.local).toBe(true);
    expect(publishable(merged, "climb").map((b) => b.id)).not.toContain(11);
    await writeFile(join(dir, "clash.json"), JSON.stringify([{ ...local, id: 1 }]));
    expect(() => loadBriefs(join(dir, "clash.json"))).toThrow("repeats an id or slug");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("every source file a brief names exists at the round 0 commit", async () => {
  await freezeSources(briefs);
  const missing = briefs.flatMap(sourcePaths).filter((p) => !existsSync(p));
  expect(missing).toEqual([]);
});
