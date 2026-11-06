// One round of the quality climb: write, render, judge, then gate.
//   bun evals/quality-climb/round.ts --round <n> [--set climb|held-out|all] [--judges fake|sol,opus] [--briefs 1,2]
//     [--stage 1|2|3] [--counting sol,opus] [--samples sol=3,opus=1] [--baseline 0] [--lint-ref <git ref>]
//     [--system-root <path>] [--skip-tests] [--concurrency 3] [--lane <type> [--lanes-dir <path>]] [--frozen-from <round dir>]
// --stage picks the counting judges and their samples from the judge ladder (STAGES in gate.ts). --judges, --counting
// and --samples override it. With neither --stage nor --judges, the round runs stage 1.
// A judge that --samples and the stage do not name scores each page once. The gate reads the median of a judge's samples.
// --lane climbs one component: briefs from lanes/<type>/briefs.json, criteria from lanes/base-criteria.json plus
// lanes/<type>/criteria.json, output in .tmp/quality-climb/lanes/<type>/round-<n>/. --lanes-dir names another folder
// of lane folders, such as fixtures/lanes.
// --frozen-from re-renders and scores the pages that an earlier round dir wrote, with no new write, so a viewer-only
// change is scored without writer noise. It takes each page from <round dir>/<set>/<NN>-<slug>/.
// --system-root names another Docs System checkout whose docs MCP, export and render make the pages. The harness,
// the briefs and the judges stay this worktree's.
// Set QUALITY_CLIMB_LOCAL_BRIEFS to the local briefs file to run the full brief set of a whole-page round (see briefs.ts).
// Writes the round dir and prints the builder-facing gate result. A step whose output already exists is skipped,
// so a crashed round resumes where it stopped.
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";
import { loadBriefs } from "./briefs";
import {
  STAGES, added, builderReport, costGuard, evaluateGate, evaluateLaneGate, laneBuilderReport, lintGuard, parseTestLog, parseTypeErrors, testsGuard,
  type FailureSets, type LanePageScore, type LaneScores, type PageScore, type Stage, type WriterCost,
} from "./gate";
import type { Box } from "./images";
import { cachedLaneReply, judgeLanePage, judgePage, scoreFile, workDirOf, type JudgeUsage, type LanePacket, type Packet } from "./judge";
import { loadLane } from "./lanes";
import { lintRules, renderPage, type LintSummary, type PageBlock } from "./render";
import { groupOf, laneBlockTypes, type Brief, type JudgeReply, type LaneReply } from "./schema";
import { REPO, authSettings, copyWrittenPage, docsMcpEnv, writePage, type WriterMetrics } from "./write";

const { values: opt } = parseArgs({ options: {
  round: { type: "string" }, set: { type: "string", default: "all" }, judges: { type: "string" }, stage: { type: "string" },
  briefs: { type: "string" }, counting: { type: "string" }, samples: { type: "string" }, baseline: { type: "string", default: "0" },
  "lint-ref": { type: "string" }, "system-root": { type: "string" }, "skip-tests": { type: "boolean", default: false }, concurrency: { type: "string", default: "3" },
  lane: { type: "string" }, "lanes-dir": { type: "string" }, "frozen-from": { type: "string" },
} });
if (!opt.round) throw new Error("Pass --round <n>.");
if (!["climb", "held-out", "all"].includes(opt.set!)) throw new Error("--set must be climb, held-out or all.");
if (opt.stage && !(opt.stage in STAGES)) throw new Error(`--stage must be one of: ${Object.keys(STAGES).join(", ")}.`);

const systemRoot = opt["system-root"] ? resolve(opt["system-root"]) : REPO;
if (!existsSync(join(systemRoot, "packages/docs-mcp/src/cli.ts"))) throw new Error(`--system-root ${systemRoot} holds no packages/docs-mcp.`);
const lane = opt.lane ? loadLane(opt.lane, opt["lanes-dir"] ? resolve(opt["lanes-dir"]) : undefined) : null;
const criteriaIds = lane?.criteria.map((c) => c.id) ?? [];
const frozenFrom = opt["frozen-from"] ? resolve(opt["frozen-from"]) : null;
if (frozenFrom && !existsSync(frozenFrom)) throw new Error(`--frozen-from ${frozenFrom} does not exist.`);
const roundsDir = lane ? join(REPO, ".tmp/quality-climb/lanes", lane.lane) : join(REPO, ".tmp/quality-climb");
const roundDir = (round: string) => join(roundsDir, `round-${round}`);
const dir = roundDir(opt.round);

const stage = (opt.stage ?? (opt.judges ? undefined : "1")) as `${Stage}` | undefined;
const ladder: Record<string, number> = stage ? STAGES[Number(stage) as Stage] : { sol: 3, opus: 1 };
const judges = opt.judges ? opt.judges.split(",") : Object.keys(ladder);
// The stage names the counting judges. Without one, every judge counts but the Gemini jester.
const counting = opt.counting ? opt.counting.split(",") : stage ? Object.keys(ladder) : judges.filter((j) => j !== "gemini");
const samples: Record<string, number> = { ...ladder, ...Object.fromEntries((opt.samples ? opt.samples.split(",") : []).map((pair) => {
  const [judge, count] = pair.split("=");
  if (!judge || !/^[1-9]\d*$/.test(count ?? "")) throw new Error(`--samples takes judge=count pairs, such as sol=3,opus=1. Bad pair: ${pair}`);
  return [judge, Number(count)];
})) };
const wanted = opt.briefs?.split(",").map(Number);
const briefs = (lane?.briefs ?? loadBriefs()).filter((b) => (opt.set === "all" || b.set === opt.set) && (!wanted || wanted.includes(b.id)));
if (briefs.length === 0) throw new Error("No brief matches --set and --briefs.");
const pageName = (b: Brief) => join(b.set, `${String(b.id).padStart(2, "0")}-${b.slug}`);
const pageDir = (round: string, b: Brief) => join(roundDir(round), pageName(b));
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
const label = lane ? `${lane.lane} round ${opt.round}` : `round ${opt.round}`;
const log = (line: string) => console.error(`[${label}] ${line}`);
// Progress lines reach the builder, so a held-out page is never named in them.
const name = (b: Brief) => (b.set === "held-out" ? "a held-out page" : `brief ${b.id}`);

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

/** Each judge's samples of one page, from `cached` (a saved reply, or null) or scored now. */
async function judged<T>(b: Brief, cached: (judge: string, sample: number) => Promise<T | null>, score: (judge: string, sample: number) => Promise<T>) {
  const out: { judge: string; samples: T[] }[] = [];
  for (const judge of judges) {
    const replies: T[] = [];
    for (let sample = 1; sample <= (samples[judge] ?? 1); sample++) {
      replies.push((await cached(judge, sample)) ?? (log(`${name(b)}: judging with ${judge}, sample ${sample}`), await score(judge, sample)));
    }
    out.push({ judge, samples: replies });
  }
  return out;
}

async function runBrief(b: Brief) {
  const page = pageDir(opt.round!, b);
  await mkdir(page, { recursive: true });
  if (!existsSync(join(page, "metrics.json"))) {
    if (frozenFrom) { log(`${name(b)}: copying the frozen page`); await copyWrittenPage(b, join(frozenFrom, pageName(b)), page, systemRoot); }
    else { log(`${name(b)}: writing`); await writePage(b, page, stateDir, settings, systemRoot); }
  }
  if (!existsSync(join(page, "page.png"))) {
    const render = renderChain.then(() => { log(`${name(b)}: rendering`); const r = renderPage(b, page, rules, !rebuilt, systemRoot); rebuilt = true; return r; });
    renderChain = render.catch(() => {});
    await render;
  }
  const packet: Packet = { brief: b, png: join(page, "page.png"), markdown: await readFile(join(page, "page.md"), "utf8"), blocks: await readJson<PageBlock[]>(join(page, "blocks.json")) };
  const pageScores: PageScore[] = [];
  const laneScores: LanePageScore[] = [];
  if (lane) {
    const types = laneBlockTypes(lane.lane);
    const lanePacket: LanePacket = {
      ...packet, blocks: packet.blocks.filter((block) => types.includes(block.type)), lane: lane.lane, criteria: lane.criteria,
      boxes: existsSync(join(page, "boxes.json")) ? await readJson<Record<string, Box>>(join(page, "boxes.json")) : undefined,
    };
    if (lanePacket.blocks.length === 0) throw new Error(`${name(b)} has no ${lane.lane} block, so the lane judges have nothing to score.`);
    // A saved lane reply counts only while the lane's criteria are the ones it was scored against.
    const cached = (judge: string, sample: number) => cachedLaneReply(page, judge, sample, lane.criteria);
    for (const s of await judged<LaneReply>(b, cached, (judge, sample) => judgeLanePage(judge, lanePacket, page, sample))) laneScores.push({ ...s, set: b.set, briefId: b.id });
  } else {
    const groups = Object.fromEntries(packet.blocks.map((block) => [block.id, groupOf(block.type)!]));
    const cached = async (judge: string, sample: number) => existsSync(scoreFile(page, judge, sample)) ? readJson<JudgeReply>(scoreFile(page, judge, sample)) : null;
    for (const s of await judged<JudgeReply>(b, cached, (judge, sample) => judgePage(judge, packet, page, sample))) pageScores.push({ ...s, set: b.set, briefId: b.id, groups });
  }
  return { pageScores, laneScores, lint: await readJson<LintSummary>(join(page, "lint.json")), metrics: await readJson<WriterMetrics>(join(page, "metrics.json")) };
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
await $`bun ${join(systemRoot, "packages/docs-mcp/src/cli.ts")} stop`.env({ ...process.env, ...(await docsMcpEnv(stateDir, systemRoot)) } as Record<string, string>).quiet().nothrow();
const failed = settled.flatMap((s, i) => s.status === "rejected" ? [{ set: briefs[i]!.set, text: `run brief ${briefs[i]!.id}: ${s.reason instanceof Error ? s.reason.message : s.reason}` }] : []);
const done = settled.flatMap((s) => s.status === "fulfilled" ? [s.value] : []);

const cost = (m: WriterMetrics): WriterCost => ({ set: briefs.find((b) => b.id === m.briefId)!.set, briefId: m.briefId, toolCalls: m.toolCalls, tokens: m.tokens.total });
async function baselineCosts(): Promise<WriterCost[] | null> {
  if (opt.baseline === opt.round) return done.map((d) => cost(d.metrics));
  const files = briefs.map((b) => join(pageDir(opt.baseline!, b), "metrics.json")).filter(existsSync);
  return files.length ? Promise.all(files.map(async (f) => cost(await readJson<WriterMetrics>(f)))) : null;
}

/** Each judge's calls, tokens and wall time over this round's pages, from the usage.json of each sample it scored. */
function judgeUsage() {
  const totals: Record<string, { samples: number; calls: number; wallMs: number; input: number; cached: number; output: number; total: number; costUsd: number }> = {};
  for (const b of briefs) for (const judge of judges) for (let sample = 1; sample <= (samples[judge] ?? 1); sample++) {
    const file = join(workDirOf(pageDir(opt.round!, b), judge, sample), "usage.json");
    if (!existsSync(file)) continue;
    const { calls } = JSON.parse(readFileSync(file, "utf8")) as { calls: (JudgeUsage & { wallMs: number })[] };
    const t = (totals[judge] ??= { samples: 0, calls: 0, wallMs: 0, input: 0, cached: 0, output: 0, total: 0, costUsd: 0 });
    t.samples++;
    for (const c of calls) { t.calls++; t.wallMs += c.wallMs; t.input += c.input; t.cached += c.cached; t.output += c.output; t.total += c.total; t.costUsd += c.costUsd ?? 0; }
  }
  return totals;
}

const guards = [
  testsGuard(await checks),
  lintGuard(done.map((d) => ({ set: briefs.find((b) => b.id === d.metrics.briefId)!.set, briefId: d.metrics.briefId, blocking: d.lint.blocking })), rules.label),
  costGuard(done.map((d) => cost(d.metrics)), await baselineCosts()),
];
const usage = judgeUsage();
const meta = { round: opt.round, lane: lane?.lane ?? null, stage: stage ? Number(stage) : null, judges, counting, samples, frozenFrom };

if (lane) {
  const pages = done.flatMap((d) => d.laneScores);
  const baselineGate = join(roundDir(opt.baseline!), "gate.json");
  const baseline = opt.baseline !== opt.round && existsSync(baselineGate) ? (await readJson<{ scores: LaneScores }>(baselineGate)).scores : null;
  const gate = evaluateLaneGate(pages, counting, criteriaIds, guards, baseline);
  if (failed.length) { gate.pass = false; gate.failures.unshift(...failed); }
  const report = laneBuilderReport(gate, pages, criteriaIds);
  await writeFile(join(dir, "gate.json"), JSON.stringify({ ...meta, criteria: lane.criteria, briefs: briefs.map((b) => b.id), rules: rules.label, systemRoot, usage, ...gate }, null, 2));
  await writeFile(join(dir, "report.json"), JSON.stringify({ ...meta, criteria: lane.criteria, usage, ...report }, null, 2));
  console.log(`Lane ${lane.lane} round ${opt.round}: gate ${report.pass ? "PASSED" : "FAILED"} (${briefs.length} briefs, judges ${judges.join(", ")}, counting ${counting.join(", ")})`);
  for (const [judge, sets] of Object.entries(report.scores)) for (const [set, s] of Object.entries(sets)) {
    console.log(`  ${judge} ${set} criteria: ${Object.entries(s.criteria).map(([c, v]) => `${c} ${v.mean.toFixed(2)}`).join(", ")}`);
    console.log(`  ${judge} ${set} page categories: ${Object.entries(s.categories).map(([c, v]) => `${c} ${v.mean.toFixed(2)}`).join(", ")}`);
  }
  printTail(report);
} else {
  const pages = done.flatMap((d) => d.pageScores);
  const gate = evaluateGate(pages, counting, guards);
  if (failed.length) { gate.pass = false; gate.failures.unshift(...failed); }
  const report = builderReport(gate, pages);
  // gate.json is the full result for the gate folder. report.json is all the builder may read.
  await writeFile(join(dir, "gate.json"), JSON.stringify({ ...meta, briefs: briefs.map((b) => b.id), rules: rules.label, systemRoot, usage, ...gate }, null, 2));
  await writeFile(join(dir, "report.json"), JSON.stringify({ ...meta, usage, ...report }, null, 2));
  console.log(`Round ${opt.round}: gate ${report.pass ? "PASSED" : "FAILED"} (${briefs.length} briefs, judges ${judges.join(", ")}, counting ${counting.join(", ")})`);
  for (const [judge, sets] of Object.entries(report.scores)) for (const [set, s] of Object.entries(sets)) {
    console.log(`  ${judge} ${set}: ${Object.entries(s.categories).map(([c, v]) => `${c} ${v.mean.toFixed(2)}`).join(", ")}`);
  }
  printTail(report);
}

function printTail(report: { guards: { name: string; pass: boolean; detail: string; items: string[]; heldOutItems: number }[]; failures: string[]; heldOutFailures: number }) {
  for (const guard of report.guards) {
    console.log(`  guard ${guard.name}: ${guard.pass ? "pass" : "FAIL"} (${guard.detail})`);
    for (const item of guard.items) console.log(`    - ${item}`);
    if (guard.heldOutItems) console.log(`    - ${guard.heldOutItems} held-out item(s)`);
  }
  for (const failure of report.failures) console.log(`  - ${failure}`);
  if (report.heldOutFailures) console.log(`  - ${report.heldOutFailures} held-out check(s) below the gate`);
  for (const [judge, u] of Object.entries(usage)) {
    console.log(`  judge ${judge}: ${u.samples} sample(s), ${u.calls} call(s), ${u.total} tokens (${u.input} in, ${u.cached} cached, ${u.output} out), ${(u.wallMs / 1000).toFixed(0)} s${u.costUsd ? `, $${u.costUsd.toFixed(2)}` : ""}`);
  }
  console.log(`Report: ${join(dir, "report.json")}`);
}
process.exitCode = failed.length ? 1 : 0;
