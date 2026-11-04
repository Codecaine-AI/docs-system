import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import briefs from "./briefs.json";
import { judgePage, judgePrompt, type Packet } from "./judge";
import { parseJudgeReply, PAGE_CATEGORIES, type Brief } from "./schema";
import { parseTranscript } from "./write";

const packet: Packet = {
  brief: (briefs as Brief[])[0]!,
  png: "/tmp/page.png",
  markdown: "# Docs Model\n\nText.",
  blocks: [{ id: "intro", type: "paragraph", group: "rich-text", text: "Text." }, { id: "shape", type: "state-shape", group: "state-shape", text: "" }],
};
const reply = (blocks: { id: string; score: number }[]) => JSON.stringify({ categories: Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, 8])), blocks, findings: [] });

test("a judge reply must be JSON that scores every listed block once", () => {
  expect(parseJudgeReply(reply([{ id: "intro", score: 8 }, { id: "shape", score: 7 }]), ["intro", "shape"]).ok).toBe(true);
  expect(parseJudgeReply("```json\n" + reply([{ id: "intro", score: 8 }]) + "\n```", ["intro"]).ok).toBe(true);
  expect(parseJudgeReply("Scores: 8", ["intro"])).toMatchObject({ ok: false });
  expect(parseJudgeReply(reply([{ id: "intro", score: 8 }]), ["intro", "shape"])).toMatchObject({ ok: false, error: expect.stringContaining("Missing [shape]") });
  expect(parseJudgeReply(reply([{ id: "intro", score: 11 }]), ["intro"])).toMatchObject({ ok: false });
});

test("the judge prompt carries the brief, sources, PNG and blocks, and never a target score", async () => {
  const prompt = await judgePrompt(packet);
  expect(prompt).toContain(packet.brief.prompt);
  expect(prompt).toContain("packages/docs-model/src/doc-schema.ts");
  expect(prompt).toContain("/tmp/page.png");
  expect(prompt).toContain("`shape` (state-shape)");
  expect(prompt).not.toMatch(/9\.5|target score|threshold/i);
});

test("the fake judge saves a valid score file for every block", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qc-judge-"));
  const scored = await judgePage("fake", packet, dir);
  expect(scored.blocks.map((b) => b.id)).toEqual(["intro", "shape"]);
  expect(JSON.parse(await readFile(join(dir, "scores/fake.json"), "utf8"))).toEqual(scored);
  expect(await judgePage("fake", packet, dir)).toEqual(scored);
});

test("a stub judge names the checkpoint that wires it", async () => {
  await expect(judgePage("muse", packet, await mkdtemp(join(tmpdir(), "qc-judge-")))).rejects.toThrow("TODO(cp4)");
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
