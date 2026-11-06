import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE_CRITERIA, loadLane } from "./lanes";

const fixtures = join(import.meta.dir, "fixtures/lanes");
const base = (await Bun.file(BASE_CRITERIA).json()) as { id: string }[];
const brief = (id: number, set: string, blockTypes: string[]) => ({ id, set, slug: `page-${id}`, title: "T", reader: "R", prompt: "P", sources: [], blockTypes, rewrites: "none" });

/** A lanes dir holding one lane folder with these files. */
async function lanesDir(lane: string, files: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), "qc-lanes-"));
  await mkdir(join(dir, lane));
  for (const [name, value] of Object.entries(files)) await writeFile(join(dir, lane, name), JSON.stringify(value));
  return dir;
}

test("a lane scores the base criteria, then its own, and keeps both sets of briefs", () => {
  const lane = loadLane("state-shape", fixtures);
  expect(lane.criteria.map((c) => c.id)).toEqual([...base.map((c) => c.id), "field-types", "nesting"]);
  expect(lane.briefs.map((b) => [b.id, b.set])).toEqual([[101, "climb"], [102, "held-out"]]);
});

test("a lane whose council has not written criteria.json scores the base criteria only", async () => {
  const dir = await lanesDir("code", { "briefs.json": [brief(1, "climb", ["code"])] });
  expect(loadLane("code", dir).criteria.map((c) => c.id)).toEqual(base.map((c) => c.id));
});

test.each([
  ["an unknown lane", "callout", {}, "Unknown lane callout"],
  ["a lane with no briefs", "code", {}, "has no briefs"],
  ["a brief that does not ask for the lane's block", "code", { "briefs.json": [brief(1, "climb", ["rich-text"])] }, 'needs a set of climb or held-out, a sources list, and "code"'],
  ["a brief outside both sets", "code", { "briefs.json": [brief(1, "train", ["code"])] }, "needs a set"],
  ["a lane criterion that repeats a base id", "code", { "briefs.json": [brief(1, "climb", ["code"])], "criteria.json": [{ id: "craft", question: "Q?", group: "Code" }] }, "criterion id craft is used twice"],
  ["a criterion without a group", "code", { "briefs.json": [brief(1, "climb", ["code"])], "criteria.json": [{ id: "wrap", question: "Q?" }] }, "A criterion is {id, question, group}"],
])("refuses %s", async (_name, lane, files, message) => {
  const dir = await lanesDir(lane, files);
  expect(() => loadLane(lane, dir)).toThrow(message);
});
