// Judge adapters by name. Each one takes the judge prompt and the page packet and returns the judge's raw text.
// judgePage validates the text against the schema and retries once on a bad reply.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PAGE_CATEGORIES, JudgeReplySchema, parseJudgeReply, type Brief, type JudgeReply } from "./schema";
import type { PageBlock } from "./render";
import { REPO, authSettings, cleanEnv, sourcePaths } from "./write";

export interface Packet { brief: Brief; png: string; markdown: string; blocks: PageBlock[] }
type Adapter = (prompt: string, packet: Packet, workDir: string) => Promise<string>;

/** The judge brief, then this page's packet. The packet never carries a target score. */
export async function judgePrompt(packet: Packet): Promise<string> {
  const brief = await readFile(join(import.meta.dir, "judge-brief.md"), "utf8");
  const { brief: b } = packet;
  return [
    brief,
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
    `## Blocks to Score`,
    ...packet.blocks.map((block) => `- \`${block.id}\` (${block.type}): ${block.text}`),
    `## Page Markdown`,
    packet.markdown,
  ].join("\n\n");
}

async function run(cmd: string[], options: { cwd: string; stdin: string; timeoutMs?: number }): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd: options.cwd, env: cleanEnv(), stdin: new Blob([options.stdin]), stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), options.timeoutMs ?? 30 * 60_000);
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  if (code !== 0) throw new Error(`${cmd[0]} exited ${code}: ${stderr.slice(-2000)}`);
  return stdout;
}

/** Deterministic scores from the brief id: every block 9 or 10, one finding. For tests and dry rounds. */
const fake: Adapter = async (_prompt, packet) => {
  const seed = createHash("sha256").update(String(packet.brief.id)).digest();
  return JSON.stringify({
    categories: Object.fromEntries(PAGE_CATEGORIES.map((c, i) => [c, 9 + (seed[i]! % 2)])),
    blocks: packet.blocks.map((b, i) => ({ id: b.id, score: 9 + (seed[(i + 8) % seed.length]! % 2) })),
    findings: [{ target: "craft", severity: "low", finding: `Fake judge finding for brief ${packet.brief.id}.` }],
  });
};

/** GPT-6.1 Sol through Codex, with the PNG attached and the reply held to the JSON schema. */
const sol: Adapter = async (prompt, packet, workDir) => {
  const schema = join(workDir, "judge-schema.json");
  const reply = join(workDir, "sol-reply.txt");
  await writeFile(schema, JSON.stringify(JudgeReplySchema));
  await run(["codex", "exec", "-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="high"', "--enable", "fast_mode",
    "-s", "read-only", "--skip-git-repo-check", "-C", REPO, "--output-schema", schema, "-o", reply, `--image=${packet.png}`, "-"],
  { cwd: REPO, stdin: prompt });
  return readFile(reply, "utf8");
};

/** Opus 5.5 at high effort through Claude Code, with Read on the PNG and the source files and nothing else. */
const opus: Adapter = async (prompt, packet, workDir) => {
  const dirs = [...new Set([dirname(packet.png), ...sourcePaths(packet.brief).map((p) => dirname(p))])];
  const out = await run(["claude", "-p", "--model", "claude-opus-5-5", "--effort", "high",
    "--setting-sources", "", ...(await authSettings(workDir)), "--strict-mcp-config",
    "--tools", "Read", "--allowedTools", "Read", "--permission-mode", "dontAsk", "--add-dir", ...dirs,
    "--disable-slash-commands", "--no-session-persistence", "--output-format", "json"],
  { cwd: workDir, stdin: prompt });
  const result = JSON.parse(out);
  if (result.is_error) throw new Error(`opus judge error: ${result.result}`);
  return String(result.result);
};

const later = (name: string, checkpoint: string): Adapter => async () => {
  throw new Error(`Judge ${name} is not wired yet. TODO(${checkpoint}): add its adapter when its stage joins.`);
};

export const JUDGES: Record<string, Adapter> = {
  fake, sol, opus,
  muse: later("muse (Muse Wonder 1.0, stage 2)", "cp4"),
  fable: later("fable (Fable 5.1, stage 3)", "cp5"),
  gemini: later("gemini (Gemini 4 Argon, stage 3 jester)", "cp5"),
};

/** Scores one page with one judge, saves scores/<judge>.json beside the page, and retries once on a bad reply. */
export async function judgePage(judge: string, packet: Packet, pageDir: string): Promise<JudgeReply> {
  const adapter = JUDGES[judge];
  if (!adapter) throw new Error(`Unknown judge ${judge}. Use one of: ${Object.keys(JUDGES).join(", ")}`);
  const workDir = join(pageDir, "scores", `${judge}-work`);
  await mkdir(workDir, { recursive: true });
  const ids = packet.blocks.map((b) => b.id);
  let prompt = await judgePrompt(packet);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await adapter(prompt, packet, workDir);
    await writeFile(join(workDir, `reply-${attempt}.txt`), text);
    const parsed = parseJudgeReply(text, ids);
    if (parsed.ok) {
      await writeFile(join(pageDir, "scores", `${judge}.json`), JSON.stringify(parsed.reply, null, 2));
      return parsed.reply;
    }
    prompt = `${prompt}\n\n# Your Last Reply Was Rejected\n\n${parsed.error}\n\nReply again with one JSON object in the reply format, and nothing else.`;
  }
  throw new Error(`Judge ${judge} gave no valid reply for brief ${packet.brief.id}. See ${workDir}.`);
}
