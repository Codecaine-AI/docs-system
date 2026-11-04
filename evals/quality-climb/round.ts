// One round of the quality climb: write, render, judge, then gate.
//   bun evals/quality-climb/round.ts --round <n> [--set climb|held-out|all] [--judges fake|sol,opus] [--briefs 1,2]
//     [--counting sol,opus] [--baseline 0] [--lint-ref <git ref>] [--skip-tests] [--concurrency 3]
// Writes .tmp/quality-climb/round-<n>/ and prints the builder-facing gate result. A step whose output already
// exists is skipped, so a crashed round resumes where it stopped.
import { existsSync, unlinkSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";
import briefsJson from "./briefs.json";
import { added, builderReport, costGuard, evaluateGate, lintGuard, parseTestLog, parseTypeErrors, testsGuard, type FailureSets, type PageScore, type WriterCost } from "./gate";
import { judgePage, type Packet } from "./judge";
import { lintRules, renderPage, type LintSummary, type PageBlock } from "./render";
import { groupOf, type Brief, type JudgeReply } from "./schema";
import { REPO, authSettings, docsMcpEnv, writePage, type WriterMetrics } from "./write";

const { values: opt } = parseArgs({ options: {
  round: { type: "string" }, set: { type: "string", default: "all" }, judges: { type: "string", default: "sol,opus" },
  briefs: { type: "string" }, counting: { type: "string" }, baseline: { type: "string", default: "0" },
  "lint-ref": { type: "string" }, "skip-tests": { type: "boolean", default: false }, concurrency: { type: "string", default: "3" },
} });
if (!opt.round) throw new Error("Pass --round <n>.");
if (!["climb", "held-out", "all"].includes(opt.set!)) throw new Error("--set must be climb, held-out or all.");

const roundDir = (round: string) => join(REPO, ".tmp/quality-climb", `round-${round}`);
const dir = roundDir(opt.round);
const judges = opt.judges!.split(",");
// The Gemini jester never counts toward a gate.
const counting = opt.counting ? opt.counting.split(",") : judges.filter((j) => j !== "gemini");
const wanted = opt.briefs?.split(",").map(Number);
const briefs = (briefsJson as Brief[]).filter((b) => (opt.set === "all" || b.set === opt.set) && (!wanted || wanted.includes(b.id)));
if (briefs.length === 0) throw new Error("No brief matches --set and --briefs.");
const pageDir = (round: string, b: Brief) => join(roundDir(round), b.set, `${String(b.id).padStart(2, "0")}-${b.slug}`);
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8"));

const stateDir = join(dir, "docs-state");
await mkdir(stateDir, { recursive: true });
// Two runs of one round share its pages and its docs daemon: the second run refuses to start.
const lock = join(dir, "round.lock");
const holder = existsSync(lock) ? Number(await readFile(lock, "utf8")) : 0;
if (holder && holder !== process.pid && (() => { try { return process.kill(holder, 0); } catch { return false; } })()) {
  throw new Error(`Round ${opt.round} is already running in process ${holder}.`);
}
await writeFile(lock, String(process.pid));
process.on("exit", () => { try { unlinkSync(lock); } catch { /* already gone */ } });
const settings = await authSettings(dir);
const rules = await lintRules(opt["lint-ref"]);
const log = (line: string) => console.error(`[round ${opt.round}] ${line}`);

// The tests guard runs beside the writers: it does not depend on the pages. Each round records its failing
// tests and type errors in checks.json, and the guard fails only on ones the baseline round's checks.json lacks.
async function runChecks() {
  const run = async (args: string[], log: string) => {
    const out = await $`bun ${args}`.cwd(REPO).quiet().nothrow();
    const text = out.stdout.toString() + out.stderr.toString();
    await appendFile(join(dir, log), text);
    return { exitCode: out.exitCode, text };
  };
  for (const log of ["test.log", "typecheck.log", "harness-test.log", "rerun.log"]) await rm(join(dir, log), { force: true });
  const [test, typecheck, harness] = await Promise.all([
    run(["run", "test"], "test.log"), run(["run", "typecheck"], "typecheck.log"), run(["test", "evals/quality-climb"], "harness-test.log"),
  ]);
  // A non-zero exit with no parsed failure is itself a failure, so a crashed run never reads as clean.
  const orExit = (found: string[], exitCode: number, script: string) => found.length || exitCode === 0 ? found : [`(bun run ${script} exited ${exitCode})`];
  const current: FailureSets = { tests: orExit(parseTestLog(test.text), test.exitCode, "test"), typeErrors: orExit(parseTypeErrors(typecheck.text), typecheck.exitCode, "typecheck") };
  const baselineFile = join(roundDir(opt.baseline!), "checks.json");
  const baseline = opt.baseline !== opt.round && existsSync(baselineFile) ? await readJson<FailureSets>(baselineFile) : null;
  // Rerun each file with a new failing test once, one file at a time, so only a repeat failure counts.
  const fresh = baseline ? added(current.tests, baseline.tests) : [];
  const files = [...new Set(fresh.map((t) => t.split(" > ")[0]!))];
  const failedAgain: string[] = [];
  for (const file of files) {
    if (!file || !existsSync(join(REPO, file))) { failedAgain.push(...fresh.filter((t) => t.startsWith(`${file} > `) || t === file)); continue; }
    failedAgain.push(...parseTestLog((await run(["test", `./${file}`], "rerun.log")).text));
  }
  await writeFile(join(dir, "checks.json"), JSON.stringify({ ...current, harnessExitCode: harness.exitCode, baseline: baseline ? opt.baseline : null, rerunFiles: files, failedAgain }, null, 2));
  return { harnessExitCode: harness.exitCode, current, baseline, failedAgain };
}
const checks = opt["skip-tests"] ? Promise.resolve(null) : runChecks();

// Renders share one SPA build, so they run one at a time and only the first rebuilds it.
let renderChain: Promise<unknown> = Promise.resolve();
let rebuilt = false;

async function runBrief(b: Brief) {
  const page = pageDir(opt.round!, b);
  await mkdir(page, { recursive: true });
  if (!existsSync(join(page, "metrics.json"))) { log(`brief ${b.id}: writing`); await writePage(b, page, stateDir, settings); }
  if (!existsSync(join(page, "page.png"))) {
    const render = renderChain.then(() => { log(`brief ${b.id}: rendering`); const r = renderPage(b, page, rules, !rebuilt); rebuilt = true; return r; });
    renderChain = render.catch(() => {});
    await render;
  }
  const packet: Packet = { brief: b, png: join(page, "page.png"), markdown: await readFile(join(page, "page.md"), "utf8"), blocks: await readJson<PageBlock[]>(join(page, "blocks.json")) };
  const scores: PageScore[] = [];
  for (const judge of judges) {
    const file = join(page, "scores", `${judge}.json`);
    const reply = existsSync(file) ? await readJson<JudgeReply>(file) : (log(`brief ${b.id}: judging with ${judge}`), await judgePage(judge, packet, page));
    scores.push({ judge, set: b.set, briefId: b.id, reply, groups: Object.fromEntries(packet.blocks.map((block) => [block.id, groupOf(block.type)!])) });
  }
  return { scores, lint: await readJson<LintSummary>(join(page, "lint.json")), metrics: await readJson<WriterMetrics>(join(page, "metrics.json")) };
}

/** Runs `work` over `items` with at most `limit` at once, and keeps every failure instead of stopping at the first. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await work(items[i]!).then((value) => ({ status: "fulfilled", value }) as const, (reason) => ({ status: "rejected", reason }) as const); }
  }));
  return results;
}

const settled = await pool(briefs, Number(opt.concurrency), runBrief);
await $`bun ${join(REPO, "packages/docs-mcp/src/cli.ts")} stop`.env({ ...process.env, ...(await docsMcpEnv(stateDir)) } as Record<string, string>).quiet().nothrow();
const failed = settled.flatMap((s, i) => s.status === "rejected" ? [{ set: briefs[i]!.set, text: `run brief ${briefs[i]!.id}: ${s.reason instanceof Error ? s.reason.message : s.reason}` }] : []);
const done = settled.flatMap((s) => s.status === "fulfilled" ? [s.value] : []);

const cost = (m: WriterMetrics): WriterCost => ({ set: briefs.find((b) => b.id === m.briefId)!.set, briefId: m.briefId, toolCalls: m.toolCalls, tokens: m.tokens.total });
async function baselineCosts(): Promise<WriterCost[] | null> {
  if (opt.baseline === opt.round) return done.map((d) => cost(d.metrics));
  const files = briefs.map((b) => join(pageDir(opt.baseline!, b), "metrics.json")).filter(existsSync);
  return files.length ? Promise.all(files.map(async (f) => cost(await readJson<WriterMetrics>(f)))) : null;
}

const guards = [
  testsGuard(await checks),
  lintGuard(done.map((d) => ({ set: d.scores[0]?.set ?? "climb", briefId: d.metrics.briefId, blocking: d.lint.blocking })), rules.label),
  costGuard(done.map((d) => cost(d.metrics)), await baselineCosts()),
];
const pages = done.flatMap((d) => d.scores);
const gate = evaluateGate(pages, counting, guards);
if (failed.length) { gate.pass = false; gate.failures.unshift(...failed); }
const report = builderReport(gate, pages);
// gate.json is the full result for the gate folder. report.json is all the builder may read.
await writeFile(join(dir, "gate.json"), JSON.stringify({ round: opt.round, judges, counting, briefs: briefs.map((b) => b.id), rules: rules.label, ...gate }, null, 2));
await writeFile(join(dir, "report.json"), JSON.stringify({ round: opt.round, judges, counting, ...report }, null, 2));

console.log(`Round ${opt.round}: gate ${report.pass ? "PASSED" : "FAILED"} (${briefs.length} briefs, judges ${judges.join(", ")}, counting ${counting.join(", ")})`);
for (const [judge, sets] of Object.entries(report.scores)) for (const [set, s] of Object.entries(sets)) {
  console.log(`  ${judge} ${set}: ${Object.entries(s.categories).map(([c, v]) => `${c} ${v.mean.toFixed(2)}`).join(", ")}`);
}
for (const guard of report.guards) {
  console.log(`  guard ${guard.name}: ${guard.pass ? "pass" : "FAIL"} (${guard.detail})`);
  for (const item of guard.items) console.log(`    - ${item}`);
  if (guard.heldOutItems) console.log(`    - ${guard.heldOutItems} held-out item(s)`);
}
for (const failure of report.failures) console.log(`  - ${failure}`);
if (report.heldOutFailures) console.log(`  - ${report.heldOutFailures} held-out check(s) below the gate`);
console.log(`Report: ${join(dir, "report.json")}`);
process.exitCode = failed.length ? 1 : 0;
