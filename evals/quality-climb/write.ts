// The fixed writer: one Claude Code run per brief (Opus 5.5, medium effort) that writes one new page
// in a scratch corpus through this worktree's docs MCP only, plus Read on the brief's source files as of SOURCE_REF.
import { existsSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { $ } from "bun";
import type { Brief } from "./schema";

export const REPO = resolve(import.meta.dir, "../..");
export const WRITER = { model: "claude-opus-5-5", effort: "medium" } as const;
const WRITER_TIMEOUT_MS = 45 * 60_000;

export interface WriterMetrics {
  briefId: number;
  model: string;
  effort: string;
  exitCode: number | null;
  isError: boolean;
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  tokens: { input: number; output: number; cacheCreation: number; cacheRead: number; total: number };
  costUsd: number;
  durationMs: number;
  numTurns: number;
  result: string;
}

/** The parent session's environment without the variables that tie a child `claude` to this session (they make it hang). */
export function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && !/^CLAUDE_CODE_|^CLAUDECODE$/.test(key)) env[key] = value;
  return { ...env, ...extra };
}

/**
 * A settings file holding only the user's API auth, so a child `claude` can run with `--setting-sources ""`:
 * no user CLAUDE.md, hooks, plugins or skills reach the writer or the Opus judge.
 */
export async function authSettings(dir: string): Promise<string[]> {
  const user = JSON.parse(await readFile(join(homedir(), ".claude/settings.json"), "utf8").catch(() => "{}"));
  const auth: Record<string, unknown> = {};
  if (user.apiKeyHelper) auth.apiKeyHelper = user.apiKeyHelper;
  if (user.env?.ANTHROPIC_BASE_URL) auth.env = { ANTHROPIC_BASE_URL: user.env.ANTHROPIC_BASE_URL };
  if (Object.keys(auth).length === 0) return [];
  const file = join(dir, "claude-auth.json");
  await writeFile(file, JSON.stringify(auth), { mode: 0o600 });
  return ["--settings", file];
}

/**
 * The environment that runs the docs MCP and daemon of `root` (this worktree by default) in their own state folder.
 * The daemon reads sibling Core repos at docs-mcp/../../.. (canvas, sequence, annotations). A worktree outside
 * a Core checkout gets that layout as symlinks to its own repo and its external/ submodules.
 */
export async function docsMcpEnv(stateDir: string, root = REPO): Promise<Record<string, string>> {
  const env: Record<string, string> = { CODECAINE_DOCS_STATE_DIR: stateDir };
  if (existsSync(join(root, "../canvas/packages/canvas"))) return env;
  const core = join(root, ".tmp/quality-climb/core-layout");
  await mkdir(core, { recursive: true });
  const links: Record<string, string> = { "docs-system": root, canvas: "external/canvas", sequence: "external/sequence", annotations: "external/annotations" };
  // Writers start at once, so another one can make a link between the check and the symlink call.
  for (const [name, target] of Object.entries(links)) {
    if (!existsSync(join(core, name))) await symlink(resolve(root, target), join(core, name)).catch((error) => { if (error.code !== "EEXIST") throw error; });
  }
  return { ...env, CODECAINE_DOCS_PACKAGE_ROOT: join(core, "docs-system/packages/docs-mcp") };
}

/**
 * The round 0 commit. Writers and judges read every repo source from it, so the climb's own commits never
 * change what a brief describes. It shares the lint-ref snapshot folder.
 */
export const SOURCE_REF = "8003057f06cdadef049ee61ec8817ee943ee4198";
export const SOURCE_ROOT = join(REPO, ".tmp/quality-climb/lint-rules", SOURCE_REF);

/** Every source as an absolute path. Repo sources are relative to the repo root at SOURCE_REF. Absolute sources stay as they are. */
export const sourcePaths = (brief: Brief) => brief.sources.map((s) => resolve(SOURCE_ROOT, s));

/** Unpacks each repo source of `briefs` that the snapshot lacks from SOURCE_REF. */
export async function freezeSources(briefs: Brief[]): Promise<void> {
  const missing = [...new Set(briefs.flatMap((b) => b.sources).filter((s) => !isAbsolute(s) && !existsSync(join(SOURCE_ROOT, s))))];
  if (missing.length === 0) return;
  await mkdir(SOURCE_ROOT, { recursive: true });
  await $`git -C ${REPO} archive ${SOURCE_REF} ${missing} | tar -x -f - -C ${SOURCE_ROOT}`.quiet();
}
export const pagePath = (pageDir: string, brief: Brief) => join(pageDir, "corpus/docs", brief.slug, "doc.json");

function writerPrompt(brief: Brief): string {
  return [
    `Write one new documentation page with the docs-system MCP tools.`,
    ``,
    `- Project: the only docs project in this workspace. Create the page at path "${brief.slug}" with the title "${brief.title}".`,
    `- Reader: ${brief.reader}.`,
    `- Brief: ${brief.prompt}`,
    `- Block types the page needs: ${brief.blockTypes.join(", ")}. Use other block types only where they fit the content better.`,
    `- Source files: read each one with the Read tool before you write. The page must match them.`,
    ...sourcePaths(brief).map((p) => `  - ${p}`),
    ``,
    `Write only through the docs-system tools. When docs_check with your task_id passes, call docs_end and reply DONE.`,
  ].join("\n");
}

/** Counts tool calls and reads the final result event of a `--output-format stream-json` transcript. */
export function parseTranscript(jsonl: string): Omit<WriterMetrics, "briefId" | "model" | "effort" | "exitCode"> {
  const byName: Record<string, number> = {};
  let result: any = null;
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let event: any;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === "assistant") for (const part of event.message?.content ?? []) if (part.type === "tool_use") byName[part.name] = (byName[part.name] ?? 0) + 1;
    if (event.type === "result") result = event;
  }
  const u = result?.usage ?? {};
  const tokens = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheCreation: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, total: 0 };
  tokens.total = tokens.input + tokens.output + tokens.cacheCreation + tokens.cacheRead;
  return {
    isError: !result || result.is_error === true,
    toolCalls: Object.values(byName).reduce((a, b) => a + b, 0),
    toolCallsByName: byName,
    tokens,
    costUsd: result?.total_cost_usd ?? 0,
    durationMs: result?.duration_ms ?? 0,
    numTurns: result?.num_turns ?? 0,
    result: typeof result?.result === "string" ? result.result : "",
  };
}

/**
 * Makes the brief's scratch corpus in `pageDir`, runs the writer, and saves writer.jsonl and metrics.json.
 * `systemRoot` is the Docs System checkout whose docs MCP and themes the writer uses (this worktree by default).
 */
export async function writePage(brief: Brief, pageDir: string, stateDir: string, settingsArgs: string[], systemRoot = REPO): Promise<WriterMetrics> {
  await freezeSources([brief]);
  const corpus = join(pageDir, "corpus");
  await mkdir(join(corpus, "docs"), { recursive: true });
  await writeFile(join(corpus, "codecaine.docs.json"), JSON.stringify({ id: `quality-climb-${brief.slug}`, name: brief.title, kind: "core", docsRoot: "docs", products: ["docs"] }, null, 2));
  // Discovery finds a project only when its docs root holds a bundle: seed an empty root page.
  const root = { schemaVersion: 1, id: "doc-quality-climb-root", title: "Quality Climb", root: "root", blocks: { root: { id: "root", type: "paragraph", props: {}, children: [] } } };
  await writeFile(join(corpus, "docs/doc.json"), JSON.stringify(root, null, 2));
  if (!existsSync(join(corpus, "themes"))) await symlink(join(systemRoot, "themes"), join(corpus, "themes"));
  const mcpConfig = join(pageDir, "mcp.json");
  await writeFile(mcpConfig, JSON.stringify({ mcpServers: { "docs-system": {
    type: "stdio", command: process.execPath,
    args: [join(systemRoot, "packages/docs-mcp/src/cli.ts"), "mcp", "--workspace", corpus],
    env: await docsMcpEnv(stateDir, systemRoot),
  } } }, null, 2));

  const sourceDirs = [...new Set(sourcePaths(brief).map((p) => dirname(p)))];
  const args = [
    "-p", writerPrompt(brief),
    "--model", WRITER.model, "--effort", WRITER.effort,
    "--setting-sources", "", ...settingsArgs,
    "--mcp-config", mcpConfig, "--strict-mcp-config",
    "--tools", "Read", "--allowedTools", "Read", "mcp__docs-system", "--permission-mode", "dontAsk",
    "--add-dir", ...sourceDirs,
    "--disable-slash-commands", "--no-session-persistence",
    "--output-format", "stream-json", "--verbose",
  ];
  const proc = Bun.spawn(["claude", ...args], { cwd: corpus, env: cleanEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), WRITER_TIMEOUT_MS);
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  await writeFile(join(pageDir, "writer.jsonl"), stdout);
  if (stderr.trim()) await writeFile(join(pageDir, "writer.stderr.txt"), stderr);
  const metrics: WriterMetrics = { briefId: brief.id, model: WRITER.model, effort: WRITER.effort, exitCode, ...parseTranscript(stdout) };
  await writeFile(join(pageDir, "metrics.json"), JSON.stringify(metrics, null, 2));
  if (!existsSync(pagePath(pageDir, brief))) throw new Error(`Writer made no page for brief ${brief.id} (exit ${exitCode}). See ${join(pageDir, "writer.jsonl")}.`);
  return metrics;
}
