// Judge adapters by name. Each one takes the judge prompt, the page packet and the reply's JSON Schema, and returns
// the judge's raw text and its token use. judgePage (a whole page) and judgeLanePage (one lane's blocks) validate
// the text and retry once on a bad reply.
import { createHash } from "node:crypto";
import { readdirSync, existsSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { TSchema } from "@sinclair/typebox";
import { tilePng, type Box } from "./images";
import type { PageBlock } from "./render";
import {
  PAGE_CATEGORIES, JudgeReplySchema, laneBlockTypes, laneReplySchema, parseJudgeReply, parseLaneReply,
  type Brief, type Criterion, type JudgeReply, type Lane, type LaneReply,
} from "./schema";
import { REPO, authSettings, cleanEnv, freezeSources, sourcePaths } from "./write";

export interface Packet { brief: Brief; png: string; markdown: string; blocks: PageBlock[] }
/** A lane packet lists only the lane's blocks, with each block's place in the PNG when the render measured it. */
export interface LanePacket extends Packet { lane: Lane; criteria: Criterion[]; boxes?: Record<string, Box> }
/** One judge call's token use. `input` counts every prompt token, `cached` the part read from a cache. */
export interface JudgeUsage { input: number; cached: number; output: number; total: number; costUsd?: number }
interface JudgeOutput { text: string; usage?: JudgeUsage }
type Adapter = (prompt: string, packet: Packet, workDir: string, schema: TSchema) => Promise<JudgeOutput>;

const tokens = (input: number, cached: number, output: number, costUsd?: number): JudgeUsage => ({ input, cached, output, total: input + output, ...(costUsd === undefined ? {} : { costUsd }) });

/** The sections every packet shares: the brief, the sources and the PNG. The packet never carries a target score. */
function briefSections(packet: Packet): string[] {
  const { brief: b } = packet;
  return [
    `# Packet`,
    `## The Brief`,
    `- Title: ${b.title}`,
    `- Reader: ${b.reader}`,
    `- The page must: ${b.prompt}`,
    `- Block types the brief asks for: ${b.blockTypes.join(", ")}`,
    `## Source Files`,
    ...sourcePaths(b).map((p) => `- ${p}`),
    `## Rendered Page`,
    `The PNG is ${packet.png}.`,
  ];
}

/** The judge brief, then this page's packet. */
export async function judgePrompt(packet: Packet): Promise<string> {
  const brief = await readFile(join(import.meta.dir, "judge-brief.md"), "utf8");
  return [
    brief,
    ...briefSections(packet),
    `## Blocks to Score`,
    ...packet.blocks.map((block) => `- \`${block.id}\` (${block.type}): ${block.text}`),
    `## Page Markdown`,
    packet.markdown,
  ].join("\n\n");
}

/** The lane judge brief, then the packet with the lane's criteria and the lane's blocks on this page. */
export async function laneJudgePrompt(packet: LanePacket): Promise<string> {
  const brief = await readFile(join(import.meta.dir, "lane-judge-brief.md"), "utf8");
  const place = (id: string) => {
    const box = packet.boxes?.[id];
    return box ? `, at y ${Math.round(box.y)} to ${Math.round(box.y + box.height)} px in the PNG` : "";
  };
  return [
    brief,
    ...briefSections(packet),
    `## The Lane`,
    `This lane is \`${packet.lane}\`. It judges the blocks of type ${laneBlockTypes(packet.lane).map((t) => `\`${t}\``).join(", ")}.`,
    `## Criteria`,
    ["| Group | Criterion | The question |", "|---|---|---|", ...packet.criteria.map((c) => `| ${c.group} | \`${c.id}\` | ${c.question} |`)].join("\n"),
    `## Blocks to Judge`,
    ...packet.blocks.map((block) => `- \`${block.id}\` (${block.type})${place(block.id)}: ${block.text}`),
    `## Page Markdown`,
    packet.markdown,
  ].join("\n\n");
}

/** Runs a judge CLI. Its whole stderr goes to `<workDir>/<cli>-stderr.txt`, because the tail alone can be a base64 image. */
async function run(cmd: string[], options: { cwd: string; stdin: string; workDir: string; env?: Record<string, string>; timeoutMs?: number }): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd: options.cwd, env: cleanEnv(options.env), stdin: new Blob([options.stdin]), stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), options.timeoutMs ?? 30 * 60_000);
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  const log = join(options.workDir, `${cmd[0]}-stderr.txt`);
  await writeFile(log, stderr);
  if (code !== 0) {
    const lines = stderr.split("\n").filter((l) => /error|fail/i.test(l) && l.length < 500).slice(-5).join("\n");
    throw new Error(`${cmd[0]} exited ${code}: ${lines || "(no error line)"} (full stderr in ${log})`);
  }
  return stdout;
}

const jsonLines = (text: string): any[] => text.split("\n").flatMap((line) => { try { return line.trim() ? [JSON.parse(line)] : []; } catch { return []; } });

/**
 * A CODEX_HOME that holds only the user's model provider and its auth, so the Sol judge, like the Claude judges,
 * gets no user AGENTS.md, skills, plugins or MCP servers. The user's ~/.agents skills are turned off by path.
 */
async function codexJudgeHome(): Promise<string> {
  const home = join(REPO, ".tmp/quality-climb/codex-judge-home");
  await mkdir(home, { recursive: true });
  const user = Bun.TOML.parse(await readFile(join(homedir(), ".codex/config.toml"), "utf8").catch(() => "")) as Record<string, any>;
  const lines: string[] = ["[skills.bundled]", "enabled = false"];
  const name = user.model_provider as string | undefined;
  const provider = name ? user.model_providers?.[name] : undefined;
  if (name && provider) {
    lines.unshift(`model_provider = ${JSON.stringify(name)}`);
    lines.push(`[model_providers.${JSON.stringify(name)}]`);
    for (const [key, value] of Object.entries(provider)) if (typeof value !== "object") lines.push(`${key} = ${JSON.stringify(value)}`);
    if (provider.auth) {
      lines.push(`[model_providers.${JSON.stringify(name)}.auth]`);
      for (const [key, value] of Object.entries(provider.auth)) lines.push(`${key} = ${JSON.stringify(value)}`);
    }
  }
  const agentSkills = join(homedir(), ".agents/skills");
  const skills = existsSync(agentSkills) ? readdirSync(agentSkills).map((d) => join(agentSkills, d, "SKILL.md")).filter(existsSync) : [];
  for (const path of skills) lines.push("[[skills.config]]", `path = ${JSON.stringify(path)}`, "enabled = false");
  await writeFile(join(home, "config.toml"), `${lines.join("\n")}\n`, { mode: 0o600 });
  return home;
}

export const MUSE = { model: "muse-wonder-full-1.0", effort: "high" } as const;

/**
 * An XDG_CONFIG_HOME whose muse/settings.json holds only the user's provider, endpoint and a catalog entry for the
 * judge model, and links the user's auth. The Muse judge gets no user AGENTS.md, skills or MCP servers.
 */
async function museJudgeHome(): Promise<string> {
  const home = join(REPO, ".tmp/quality-climb/muse-judge-home");
  await mkdir(join(home, "muse"), { recursive: true });
  const userDir = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "muse");
  const user = JSON.parse(await readFile(join(userDir, "settings.json"), "utf8").catch(() => "{}"));
  const entry = (user.model_catalog ?? []).find((m: { model_id: string }) => m.model_id === MUSE.model) ?? { ...(user.model_catalog?.[0] ?? {}), model_id: MUSE.model, display_label: "Muse Wonder Full 1.0" };
  const settings = { schema_version: user.schema_version ?? 1, provider: user.provider ?? "meta", model: MUSE.model, model_catalog: [{ ...entry, is_default: true }], ...(user.endpoint_transport ? { endpoint_transport: user.endpoint_transport } : {}) };
  await writeFile(join(home, "muse/settings.json"), JSON.stringify(settings, null, 2), { mode: 0o600 });
  if (!existsSync(join(home, "muse/auth.json")) && existsSync(join(userDir, "auth.json"))) await symlink(join(userDir, "auth.json"), join(home, "muse/auth.json"));
  return home;
}

/** A one-decimal score from 9.0 to 10.0, fixed by the seed and the index. */
const fakeScore = (seed: Buffer, i: number) => 9 + (seed[i % seed.length]! % 11) / 10;

/** Deterministic scores from the brief id, all from 9.0 to 10.0, and one finding. For tests and dry rounds. */
const fake: Adapter = async (_prompt, packet, _workDir, schema) => {
  const seed = createHash("sha256").update(String(packet.brief.id)).digest();
  const categories = Object.fromEntries(PAGE_CATEGORIES.map((c, i) => [c, fakeScore(seed, i)]));
  const finding = { target: "craft", severity: "low", finding: `Fake judge finding for brief ${packet.brief.id}.` };
  const criteria = (schema as unknown as { properties: Record<string, { properties?: Record<string, unknown> }> }).properties.criteria?.properties;
  if (criteria) return { text: JSON.stringify({ criteria: Object.fromEntries(Object.keys(criteria).map((id, i) => [id, fakeScore(seed, i + 8)])), categories, findings: [finding] }) };
  return { text: JSON.stringify({ categories, blocks: packet.blocks.map((b, i) => ({ id: b.id, score: fakeScore(seed, i + 8) })), findings: [finding] }) };
};

/** GPT-6.1 Sol through Codex in a bare CODEX_HOME, with the PNG attached and the reply held to the JSON schema. */
const sol: Adapter = async (prompt, packet, workDir, schema) => {
  const schemaFile = join(workDir, "judge-schema.json");
  const reply = join(workDir, "sol-reply.txt");
  await writeFile(schemaFile, JSON.stringify(schema));
  const out = await run(["codex", "exec", "-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="high"', "-c", 'service_tier="fast"', "--enable", "fast_mode",
    "-s", "read-only", "--skip-git-repo-check", "-C", workDir, "--output-schema", schemaFile, "-o", reply, "--json", `--image=${packet.png}`, "-"],
  // The judge starts in its own work dir, so repo files such as the gate target are not in its working tree.
  { cwd: workDir, stdin: prompt, workDir, env: { CODEX_HOME: await codexJudgeHome() } });
  await writeFile(join(workDir, "sol-events.jsonl"), out);
  const usage = jsonLines(out).map((e) => e.usage).filter((u) => u && typeof u.input_tokens === "number");
  const sum = (key: string) => usage.reduce((a, u) => a + (u[key] ?? 0), 0);
  return { text: await readFile(reply, "utf8"), usage: usage.length ? tokens(sum("input_tokens"), sum("cached_input_tokens"), sum("output_tokens")) : undefined };
};

/** A Claude model at high effort through Claude Code, with Read on the PNG and the source files and nothing else. */
const claude = (model: string): Adapter => async (prompt, packet, workDir) => {
  const dirs = [...new Set([dirname(packet.png), ...sourcePaths(packet.brief).map((p) => dirname(p))])];
  const out = await run(["claude", "-p", "--model", model, "--effort", "high",
    "--setting-sources", "", ...(await authSettings(workDir)), "--strict-mcp-config",
    "--tools", "Read", "--allowedTools", "Read", "--permission-mode", "dontAsk", "--add-dir", ...dirs,
    "--disable-slash-commands", "--no-session-persistence", "--output-format", "json"],
  { cwd: workDir, stdin: prompt, workDir });
  const result = JSON.parse(out);
  if (result.is_error) throw new Error(`${model} judge error: ${result.result}`);
  const u = result.usage ?? {};
  const cached = u.cache_read_input_tokens ?? 0;
  return { text: String(result.result), usage: tokens((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + cached, cached, u.output_tokens ?? 0, result.total_cost_usd) };
};

/**
 * Muse Wonder Full 1.0 at high effort through `muse exec`, in a bare config home, with the PNG attached, read-only
 * file tools, no shell, web or writes, and the reply held to the JSON schema. The CLI refuses an image of about
 * 6 million pixels or more, so a tall page goes as tiles, top to bottom.
 */
const muse: Adapter = async (prompt, packet, workDir, schema) => {
  const schemaFile = join(workDir, "judge-schema.json");
  const promptFile = join(workDir, "prompt.md");
  await writeFile(schemaFile, JSON.stringify(schema));
  const images = await tilePng(packet.png, join(workDir, "tiles"));
  const note = images.length > 1 ? `\n\nThe PNG is attached as ${images.length} images, in order from the top of the page down. Each image repeats the last 32 px of the one before it.` : "";
  await writeFile(promptFile, prompt + note);
  const out = await run(["muse", "exec", "--model", MUSE.model, "--reasoning-effort", MUSE.effort, ...images.flatMap((i) => ["--image", i]),
    "--workspace", workDir, "--output-schema", schemaFile, "--disable-web-tools", "--disable-write", "--disable-shell",
    "--no-foreign-personal-context", "--disable-reminders", "--disable-request-user-input", "--approval-mode", "never",
    "--json", "--prompt-file", promptFile],
  { cwd: workDir, stdin: "", workDir, env: { XDG_CONFIG_HOME: await museJudgeHome() } });
  await writeFile(join(workDir, "muse-events.jsonl"), out);
  const events = jsonLines(out);
  const terminal = events.filter((e) => e.payload?.kind === "run_terminal").at(-1)?.payload;
  if (!terminal || terminal.terminal !== "completed") throw new Error(`muse judge ended ${terminal?.terminal ?? "with no terminal event"}: ${terminal?.reason ?? ""}`);
  const models = events.filter((e) => e.payload?.kind === "run_usage").at(-1)?.payload?.models ?? [];
  const sum = (key: string) => models.reduce((a: number, m: Record<string, number>) => a + (m[key] ?? 0), 0);
  return { text: String(terminal.text), usage: models.length ? tokens(sum("input_tokens"), sum("cached_tokens"), sum("output_tokens")) : undefined };
};

const later = (name: string, checkpoint: string): Adapter => async () => {
  throw new Error(`Judge ${name} is not wired yet. TODO(${checkpoint}): add its adapter when its stage joins.`);
};

export const JUDGES: Record<string, Adapter> = {
  fake, sol, muse,
  opus: claude("claude-opus-5-5"),
  fable: claude("claude-fable-5-1"),
  gemini: later("gemini (Gemini 4 Argon, stage 3 jester)", "cp5"),
};

/** The score file of one judge's sample of one page, counted from 1. */
export const scoreFile = (pageDir: string, judge: string, sample: number) => join(pageDir, "scores", `${judge}.${sample}.json`);
/** The work dir of one judge's sample of one page. It holds the replies and usage.json. */
export const workDirOf = (pageDir: string, judge: string, sample: number) => join(pageDir, "scores", `${judge}.${sample}-work`);

/**
 * Scores one page with one judge as sample `sample`, saves scores/<judge>.<sample>.json beside the page and
 * usage.json in the work dir, and retries once on a bad reply.
 */
async function judgeWith<T>(judge: string, packet: Packet, pageDir: string, sample: number, prompt: string, schema: TSchema,
  parse: (text: string) => { ok: true; reply: T } | { ok: false; error: string }): Promise<T> {
  const adapter = JUDGES[judge];
  if (!adapter) throw new Error(`Unknown judge ${judge}. Use one of: ${Object.keys(JUDGES).join(", ")}`);
  await freezeSources([packet.brief]);
  const workDir = workDirOf(pageDir, judge, sample);
  await mkdir(workDir, { recursive: true });
  const calls: (JudgeUsage & { wallMs: number })[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = performance.now();
    const output = await adapter(prompt, packet, workDir, schema);
    calls.push({ ...(output.usage ?? tokens(0, 0, 0)), wallMs: Math.round(performance.now() - started) });
    await writeFile(join(workDir, "usage.json"), JSON.stringify({ judge, calls }, null, 2));
    await writeFile(join(workDir, `reply-${attempt}.txt`), output.text);
    const parsed = parse(output.text);
    if (parsed.ok) {
      await writeFile(scoreFile(pageDir, judge, sample), JSON.stringify(parsed.reply, null, 2));
      return parsed.reply;
    }
    prompt = `${prompt}\n\n# Your Last Reply Was Rejected\n\n${parsed.error}\n\nReply again with one JSON object in the reply format, and nothing else.`;
  }
  throw new Error(`Judge ${judge} gave no valid reply for brief ${packet.brief.id}. See ${workDir}.`);
}

/** Scores a whole page: the 8 categories and each listed block. */
export async function judgePage(judge: string, packet: Packet, pageDir: string, sample = 1): Promise<JudgeReply> {
  const ids = packet.blocks.map((b) => b.id);
  return judgeWith(judge, packet, pageDir, sample, await judgePrompt(packet), JudgeReplySchema, (text) => parseJudgeReply(text, ids));
}

/** The hash of the criteria ids and questions a lane reply was scored against. */
export const criteriaHash = (criteria: Criterion[]) => createHash("sha256").update(JSON.stringify(criteria.map((c) => [c.id, c.question]))).digest("hex");
/** The file beside a lane score file that holds the criteriaHash it was scored against. */
export const criteriaFile = (pageDir: string, judge: string, sample: number) => join(pageDir, "scores", `${judge}.${sample}.criteria`);

/**
 * Scores the lane's blocks on a page against each criterion, and the page's 8 categories as a guard. Saves the
 * criteria hash beside the score file, so cachedLaneReply reuses the reply only while the criteria stay the same.
 */
export async function judgeLanePage(judge: string, packet: LanePacket, pageDir: string, sample = 1): Promise<LaneReply> {
  const reply = await judgeWith(judge, packet, pageDir, sample, await laneJudgePrompt(packet), laneReplySchema(packet.criteria), (text) => parseLaneReply(text, packet.criteria));
  await writeFile(criteriaFile(pageDir, judge, sample), criteriaHash(packet.criteria));
  return reply;
}

/**
 * A saved lane reply, or null when it must be judged again: no score file, a criteria hash that is missing or names
 * other ids or questions, or scores for other criterion ids than `criteria`.
 */
export async function cachedLaneReply(pageDir: string, judge: string, sample: number, criteria: Criterion[]): Promise<LaneReply | null> {
  const file = scoreFile(pageDir, judge, sample);
  const hash = await readFile(criteriaFile(pageDir, judge, sample), "utf8").catch(() => null);
  if (!existsSync(file) || hash !== criteriaHash(criteria)) return null;
  const reply = JSON.parse(await readFile(file, "utf8")) as LaneReply;
  const scored = Object.keys(reply.criteria ?? {}).sort();
  const ids = criteria.map((c) => c.id).sort();
  return scored.length === ids.length && scored.every((id, i) => id === ids[i]) ? reply : null;
}
