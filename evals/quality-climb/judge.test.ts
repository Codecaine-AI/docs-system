import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { $ } from "bun";
import { tmpdir } from "node:os";
import { join } from "node:path";
import briefs from "./briefs.json";
import { judgeLanePage, judgePage, judgePrompt, laneJudgePrompt, type LanePacket, type Packet } from "./judge";
import { loadLane } from "./lanes";
import { parseJudgeReply, parseLaneReply, PAGE_CATEGORIES, type Brief } from "./schema";
import { REPO, SOURCE_REF, SOURCE_ROOT, docsMcpEnv, freezeSources, parseTranscript, sourcePaths } from "./write";

const packet: Packet = {
  brief: (briefs as Brief[])[0]!,
  png: "/tmp/page.png",
  markdown: "# Docs Model\n\nText.",
  blocks: [{ id: "intro", type: "paragraph", group: "rich-text", text: "Text." }, { id: "shape", type: "state-shape", group: "state-shape", text: "" }],
};
const reply = (blocks: { id: string; score: number }[], category = 8) => JSON.stringify({ categories: Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, category])), blocks, findings: [] });
const fixtureLane = loadLane("state-shape", join(import.meta.dir, "fixtures/lanes"));
const lanePacket: LanePacket = {
  ...packet, blocks: [packet.blocks[1]!], lane: "state-shape", criteria: fixtureLane.criteria, boxes: { shape: { x: 40, y: 820.4, width: 700, height: 390 } },
};
const laneReply = (criteria: Record<string, number>) => JSON.stringify({ criteria, categories: Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, 9])), findings: [] });
const allCriteria = (score: number) => Object.fromEntries(fixtureLane.criteria.map((c) => [c.id, score]));

test("a judge reply must be JSON that scores every listed block once", () => {
  expect(parseJudgeReply(reply([{ id: "intro", score: 8 }, { id: "shape", score: 7 }]), ["intro", "shape"]).ok).toBe(true);
  expect(parseJudgeReply("```json\n" + reply([{ id: "intro", score: 8 }]) + "\n```", ["intro"]).ok).toBe(true);
  expect(parseJudgeReply("Scores: 8", ["intro"])).toMatchObject({ ok: false });
  expect(parseJudgeReply(reply([{ id: "intro", score: 8 }]), ["intro", "shape"])).toMatchObject({ ok: false, error: expect.stringContaining("Missing [shape]") });
  expect(parseJudgeReply(reply([{ id: "intro", score: 11 }]), ["intro"])).toMatchObject({ ok: false });
});

test.each([
  [9.4, true], [10, true], [1, true], [9.45, false], [0.9, false], [10.1, false],
])("a score of %p is valid: %p", (score, ok) => {
  expect(parseJudgeReply(reply([{ id: "intro", score }], score), ["intro"]).ok).toBe(ok);
  expect(parseLaneReply(laneReply(allCriteria(score)), fixtureLane.criteria).ok).toBe(ok);
});

test("a decimal score comes back on the 0.1 step, so float noise never reaches the gate", () => {
  const parsed = parseJudgeReply(reply([{ id: "intro", score: 9.299999999999999 }], 9.700000000000001), ["intro"]);
  expect(parsed).toMatchObject({ ok: true, reply: { categories: { accuracy: 9.7 }, blocks: [{ id: "intro", score: 9.3 }] } });
});

test("a lane reply scores each criterion once, and no criterion the lane lacks", () => {
  expect(parseLaneReply(laneReply(allCriteria(9.1)), fixtureLane.criteria).ok).toBe(true);
  const { nesting: _, ...missing } = allCriteria(9.1);
  expect(parseLaneReply(laneReply(missing), fixtureLane.criteria)).toMatchObject({ ok: false, error: expect.stringContaining("nesting") });
  expect(parseLaneReply(laneReply({ ...allCriteria(9.1), extra: 9 }), fixtureLane.criteria)).toMatchObject({ ok: false });
});

test("the lane prompt lists every criterion, only the lane's blocks with their place in the PNG, and never a target score", async () => {
  const prompt = await laneJudgePrompt(lanePacket);
  for (const c of fixtureLane.criteria) expect(prompt).toContain(`| ${c.group} | \`${c.id}\` | ${c.question} |`);
  expect(prompt).toContain("- `shape` (state-shape), at y 820 to 1210 px in the PNG");
  expect(prompt).not.toContain("`intro` (paragraph)");
  expect(prompt).toContain("/tmp/page.png");
  expect(prompt).not.toMatch(/9\.5|target score|threshold/i);
});

test("the fake lane judge saves a valid lane score file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qc-lane-judge-"));
  const scored = await judgeLanePage("fake", lanePacket, dir);
  expect(Object.keys(scored.criteria)).toEqual(fixtureLane.criteria.map((c) => c.id));
  expect(parseLaneReply(await readFile(join(dir, "scores/fake.1.json"), "utf8"), fixtureLane.criteria)).toEqual({ ok: true, reply: scored });
});

test("the judge prompt carries the brief, sources, PNG and blocks, and never a target score", async () => {
  const prompt = await judgePrompt(packet);
  expect(prompt).toContain(packet.brief.prompt);
  expect(prompt).toContain("packages/docs-model/src/doc-schema.ts");
  expect(prompt).toContain("/tmp/page.png");
  expect(prompt).toContain("`shape` (state-shape)");
  expect(prompt).not.toMatch(/9\.5|target score|threshold/i);
});

test("a brief's repo sources resolve to the round 0 snapshot, not the worktree", async () => {
  const brief = (briefs as Brief[]).find((b) => b.id === 3)!;
  await freezeSources([brief]);
  const paths = sourcePaths(brief);
  expect(paths).toEqual(brief.sources.map((s) => join(SOURCE_ROOT, s)));
  for (const [i, path] of paths.entries()) {
    expect(path.startsWith(`${REPO}/packages/`)).toBe(false);
    expect(await readFile(path, "utf8")).toBe(await $`git -C ${REPO} show ${SOURCE_REF}:${brief.sources[i]!}`.text());
  }
  const prompt = await judgePrompt({ ...packet, brief });
  expect(prompt).toContain(join(SOURCE_ROOT, "packages/docs-server/src/routes.ts"));
  expect(prompt).not.toContain(join(REPO, "packages/docs-server/src/routes.ts"));
});

test("an absolute source, such as a local brief's, stays as it is", () => {
  expect(sourcePaths({ ...packet.brief, sources: ["/elsewhere/doc.json"] })).toEqual(["/elsewhere/doc.json"]);
});

test("writers that start at once on a fresh system root share one core layout", async () => {
  const root = await mkdtemp(join(tmpdir(), "qc-system-"));
  const envs = await Promise.all([1, 2, 3].map((n) => docsMcpEnv(join(root, `state-${n}`), root)));
  expect(new Set(envs.map((e) => e.CODECAINE_DOCS_PACKAGE_ROOT))).toEqual(new Set([join(root, ".tmp/quality-climb/core-layout/docs-system/packages/docs-mcp")]));
});

test("the fake judge saves a valid score file for every block, one file per sample", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qc-judge-"));
  const scored = await judgePage("fake", packet, dir);
  expect(scored.blocks.map((b) => b.id)).toEqual(["intro", "shape"]);
  expect(JSON.parse(await readFile(join(dir, "scores/fake.1.json"), "utf8"))).toEqual(scored);
  expect(await judgePage("fake", packet, dir, 2)).toEqual(scored);
  expect(JSON.parse(await readFile(join(dir, "scores/fake.2.json"), "utf8"))).toEqual(scored);
});

test("a stub judge names the checkpoint that wires it", async () => {
  await expect(judgePage("gemini", packet, await mkdtemp(join(tmpdir(), "qc-judge-")))).rejects.toThrow("TODO(cp5)");
});

test("the writer transcript yields tool calls, tokens and cost", () => {
  const lines = [
    { type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__docs-system__docs_begin" }, { type: "text", text: "x" }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", name: "Read" }, { type: "tool_use", name: "Read" }] } },
    { type: "result", is_error: false, num_turns: 3, duration_ms: 1000, total_cost_usd: 0.5, result: "DONE", usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 } },
  ].map((l) => JSON.stringify(l)).join("\n");
  const metrics = parseTranscript(lines);
  expect(metrics).toMatchObject({ toolCalls: 3, toolCallsByName: { Read: 2, "mcp__docs-system__docs_begin": 1 }, costUsd: 0.5, isError: false, result: "DONE" });
  expect(metrics.tokens.total).toBe(100);
  expect(parseTranscript("").isError).toBe(true);
});
