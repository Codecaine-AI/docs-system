import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";
import briefs from "./briefs.json";
import { BLOCK_GROUPS, type Brief } from "./schema";
import { REPO, SOURCE_REF, SOURCE_ROOT, docsMcpEnv, freezeSources, pagePath, parseTranscript, sourcePaths, writeAll, writtenPageDir } from "./write";

const repoBriefs = briefs as Brief[];

test("the repo holds briefs 1 to 5, 7, 8 and 10, with unique slugs and no path outside this repo", () => {
  expect(repoBriefs.map((b) => b.id)).toEqual([1, 2, 3, 4, 5, 7, 8, 10]);
  expect(new Set(repoBriefs.map((b) => b.slug)).size).toBe(repoBriefs.length);
  expect(repoBriefs.flatMap((b) => [...b.sources, b.rewrites]).filter((p) => !resolve(REPO, p).startsWith(`${REPO}/`))).toEqual([]);
  // Brief 9, a local brief, is the only held-out brief with a callout or a table.
  const uncovered = (set: string) => BLOCK_GROUPS.filter((g) => !repoBriefs.filter((b) => b.set === set).some((b) => b.blockTypes.includes(g)));
  expect(uncovered("climb")).toEqual([]);
  expect(uncovered("held-out")).toEqual(["callout", "structured-table"]);
});

test("every source file a brief names exists at the round 0 commit", async () => {
  await freezeSources(repoBriefs);
  expect(repoBriefs.flatMap(sourcePaths).filter((p) => !existsSync(p))).toEqual([]);
});

test("a brief's repo sources resolve to the round 0 snapshot, not the worktree, and an absolute source stays", async () => {
  const brief = repoBriefs.find((b) => b.id === 3)!;
  await freezeSources([brief]);
  const paths = sourcePaths(brief);
  expect(paths).toEqual(brief.sources.map((s) => join(SOURCE_ROOT, s)));
  for (const [i, path] of paths.entries()) {
    expect(path.startsWith(`${REPO}/packages/`)).toBe(false);
    expect(await readFile(path, "utf8")).toBe(await $`git -C ${REPO} show ${SOURCE_REF}:${brief.sources[i]!}`.text());
  }
  expect(sourcePaths({ ...brief, sources: ["/elsewhere/doc.json"] })).toEqual(["/elsewhere/doc.json"]);
});

test("writers that start at once on a fresh system root share one core layout", async () => {
  const root = await mkdtemp(join(tmpdir(), "qc-system-"));
  const envs = await Promise.all([1, 2, 3].map((n) => docsMcpEnv(join(root, `state-${n}`), root)));
  expect(new Set(envs.map((e) => e.CODECAINE_DOCS_PACKAGE_ROOT))).toEqual(new Set([join(root, ".tmp/quality-climb/core-layout/docs-system/packages/docs-mcp")]));
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

test("a writer round writes each brief into <set>/<NN>-<slug> with metrics and page.json, and keeps a finished page", async () => {
  const bin = await mkdtemp(join(tmpdir(), "qc-fake-claude-"));
  const calls = join(bin, "calls.log");
  // A stand-in for claude: it writes the page the prompt names into its working corpus and reports success.
  await writeFile(join(bin, "claude"), `#!/bin/sh
slug=$(printf '%s' "$2" | sed -n 's/.*at path "\\([a-z0-9-]*\\)".*/\\1/p' | head -1)
echo "$slug" >> ${calls}
mkdir -p "docs/$slug" && echo '{}' > "docs/$slug/doc.json"
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__docs-system__docs_create"}]}}'
echo '{"type":"result","is_error":false,"num_turns":1,"duration_ms":5,"total_cost_usd":0,"result":"DONE","usage":{"input_tokens":1,"output_tokens":1}}'
`);
  await chmod(join(bin, "claude"), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    const out = await mkdtemp(join(tmpdir(), "qc-write-all-"));
    const two = [repoBriefs[0]!, { ...repoBriefs.find((b) => b.set === "held-out")!, local: true }];
    expect(await writeAll(two, out, 2)).toEqual([]);
    for (const b of two) {
      const dir = writtenPageDir(out, b);
      expect(existsSync(pagePath(dir, b))).toBe(true);
      expect(JSON.parse(await readFile(join(dir, "metrics.json"), "utf8"))).toMatchObject({ briefId: b.id, toolCalls: 1 });
      expect(JSON.parse(await readFile(join(dir, "page.json"), "utf8"))).toEqual({ briefId: b.id, slug: b.slug, set: b.set, local: "local" in b });
    }
    expect(await writeAll(two, out, 2)).toEqual([]);
    expect((await readFile(calls, "utf8")).trim().split("\n").sort()).toEqual(two.map((b) => b.slug).sort());
  } finally {
    process.env.PATH = path;
  }
}, 60_000);
