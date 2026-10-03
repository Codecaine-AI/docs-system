/**
 * `docs style`: Tier 1 counts, sweeps, the A-B report, review batches and decisions, and the apply
 * that writes approved changes. Run it from the docs-system folder. The docs root defaults to
 * "docs", and the corpus to the name of the folder above it. Only `apply` and `restore` write to a
 * corpus. The sweep pipeline and the service adapters load lazily, so `lint` never touches BAML,
 * Jev, or docs-server.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { lintRules } from "@codecaine-ai/docs-model/lint";
import { loadCorpus } from "./sweep/corpus";
import { pickPilotPages } from "./sweep/pilot";
import { coreRule } from "./sweep/core-rules";
import { scopeFor, type Scope } from "./sweep/scope";
import { lintPage, pageStats } from "./sweep/tier1";
import type { ReviewOverlay } from "./report";
import type { R1File, R2File } from "./sweep/review";
import type { EditorAnswer, EditorJob } from "./sweep/editor";
import type { Judge, Rewriter, RuleLayer, StyleFinding, SweepEvent, SweepPage, SweepResult, Verifier } from "./types";

/**
 * Meaning-verifier samples per change. One sample missed 1 of the 14 labelled meaning failures in
 * calibration; two samples (any "different" rejects) caught all 14 and rejected 9% of improved rows.
 */
const VERIFIER_SAMPLES = 2;

const USAGE = [
  "Usage:",
  "  docs style lint [--json] [--root <dir>] [--corpus <name>]",
  "  docs style sweep [--pilot | --pages <a,b> | --all] [--only-pages <file>] [--no-judge] [--no-rewrite] [--no-verify]",
  "                   [--out <dir>] [--concurrency <n>] [--root <dir>] [--corpus <name>]",
  "  docs style report <sweep.json> [--out <file.html>] [--review <a.json,b.json>]",
  "  docs style batches <sweep.json> [--out <dir>] [--size <n>]",
  "  docs style decide --r1 <a.json,b.json> --r2 <c.json> --out <decisions.json>",
  "  docs style apply <sweep.json> --decisions <decisions.json> [--root <dir>] [--corpus <name>] [--backup-dir <dir>]",
  "                   [--touched <file>] [--dry-run]",
  "  docs style restore --backup-dir <dir>",
  "  docs style export-jobs --out <jobs.jsonl | dir> [--root <dir>] [--corpus <name>] [--only-pages <file>]",
  "                         [--rules <id,id>] [--no-judge]",
  "  docs style import-answers --jobs <jobs.jsonl> --answers <answers.jsonl> --out <sweep.json> [--root <dir>]",
  "                            [--corpus <name>] [--no-judge] [--no-verify] [--concurrency <n>]",
  "  docs style stage",
  "",
  "sweep runs Tier 1 and the autofixes on every page, and Tiers 2 and 3 on the selected pages",
  "(default --pilot). It writes <out>/sweep.json, by default under .tmp/style-sweep/.",
  "--only-pages sweeps only the pages its file lists, one page path or doc.json path per line,",
  "and runs every tier on them unless --pilot or --pages narrows that.",
  "The corpus defaults to the name of the folder above the docs root, such as docs-system.",
  "apply writes only changes that R1 approved and R2 checked, backs up each page first, and skips",
  "a page that changed since the sweep or has uncommitted edits the rollout did not make.",
  "export-jobs writes one editor job per block with a finding the sweep does not rewrite.",
  "import-answers checks each editor answer like a model rewrite (bullets allowed) and writes a",
  "sweep.json that batches, decide, apply, and report read.",
].join("\n");

/** Flags that take a value, so their values are not read as positional arguments. */
const VALUE_FLAGS = new Set([
  "--root",
  "--pages",
  "--out",
  "--concurrency",
  "--review",
  "--corpus",
  "--size",
  "--r1",
  "--r2",
  "--decisions",
  "--backup-dir",
  "--touched",
  "--only-pages",
  "--rules",
  "--jobs",
  "--answers",
]);

/** Pages the rollout wrote, one absolute doc.json path per line. A listed page may be dirty in git. */
const TOUCHED = path.join(".tmp", "ste-rollout", "touched.txt");
/** Where apply backs up each page before it writes, in a new folder per run. */
const BACKUPS = path.join(".tmp", "ste-rollout", "backups");

/** Runs `docs style <command>` and returns the exit code. */
export async function styleCommand(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  try {
    if (command === "lint") return await lintCommand(args);
    if (command === "sweep") return await sweepCommand(args);
    if (command === "report") return await reportCommand(args);
    if (command === "batches") return await batchesCommand(args);
    if (command === "decide") return await decideCommand(args);
    if (command === "apply") return await applyCommand(args);
    if (command === "restore") return await restoreCommand(args);
    if (command === "export-jobs") return await exportJobsCommand(args);
    if (command === "import-answers") return await importAnswersCommand(args);
    if (command === "stage") {
      console.log("not implemented yet: stages accepted ops as proposals");
      return 2;
    }
    console.error(USAGE);
    return 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

// ---------------------------------------------------------------------------------------------
// lint
// ---------------------------------------------------------------------------------------------

interface RuleRow {
  ruleId: string;
  source: StyleFinding["source"];
  layer: RuleLayer;
  findings: number;
  pages: number;
  autofixable: number;
}

interface LintSummary {
  corpus?: string;
  totals: { pages: number; sentences: number; words: number; findings: number; structure: number; vocabulary: number; autofixable: number };
  rules: RuleRow[];
  worstPages: { path: string; structure: number; sentences: number; per100: number }[];
}

async function lintCommand(args: string[]): Promise<number> {
  const pages = await loadCorpus(rootOf(args));
  const scope = scopeFor(corpusOf(args));
  const summary = summarize(
    pages.map((page) => ({ path: page.path, findings: lintPage(page.path, page.doc, scope), ...pageStats(page.doc) })),
    scope,
  );
  console.log(args.includes("--json") ? JSON.stringify(summary, null, 2) : formatSummary(summary));
  return 0;
}

function summarize(pages: { path: string; findings: StyleFinding[]; sentences: number; words: number }[], scope: Scope): LintSummary {
  // Every registered rule gets a row, so a rule that found nothing still shows that it ran.
  const rows = new Map<string, RuleRow & { pageSet: Set<string> }>();
  const row = (ruleId: string, source: StyleFinding["source"], layer: RuleLayer) =>
    rows.get(ruleId) ?? rows.set(ruleId, { ruleId, source, layer, findings: 0, pages: 0, autofixable: 0, pageSet: new Set() }).get(ruleId)!;
  for (const rule of lintRules) row(rule.id, "core", coreRule(rule.id).layer);
  for (const rule of scope.rules) row(rule.id, "ste", rule.layer);
  for (const page of pages)
    for (const finding of page.findings) {
      const entry = row(finding.ruleId, finding.source, finding.layer);
      entry.findings += 1;
      entry.pageSet.add(page.path);
      if (finding.autofixable) entry.autofixable += 1;
    }
  const all = pages.flatMap((page) => page.findings);
  const structureOf = (findings: StyleFinding[]) => findings.filter((finding) => finding.layer === "structure").length;
  return {
    corpus: scope.corpus,
    totals: {
      pages: pages.length,
      sentences: sum(pages.map((page) => page.sentences)),
      words: sum(pages.map((page) => page.words)),
      findings: all.length,
      structure: structureOf(all),
      vocabulary: all.length - structureOf(all),
      autofixable: all.filter((finding) => finding.autofixable).length,
    },
    rules: [...rows.values()]
      .map(({ pageSet, ...rest }) => ({ ...rest, pages: pageSet.size }))
      .sort((a, b) => b.findings - a.findings || compare(a.ruleId, b.ruleId)),
    worstPages: pages
      .map((page) => {
        const structure = structureOf(page.findings);
        return { path: page.path, structure, sentences: page.sentences, per100: page.sentences ? round1((structure / page.sentences) * 100) : 0 };
      })
      .sort((a, b) => b.structure - a.structure || compare(a.path, b.path))
      .slice(0, 10),
  };
}

function formatSummary(summary: LintSummary): string {
  const active = summary.rules.filter((rule) => rule.findings > 0);
  const quiet = summary.rules.filter((rule) => rule.findings === 0).map((rule) => rule.ruleId);
  const { totals } = summary;
  const lines = [
    table(
      ["rule", "source", "layer", "findings", "pages", "autofixable"],
      active.map((rule) => [rule.ruleId, rule.source, rule.layer, n(rule.findings), n(rule.pages), n(rule.autofixable)]),
    ),
  ];
  if (quiet.length) lines.push("", `No findings: ${quiet.join(", ")}`);
  lines.push(
    "",
    "Top 10 pages by structure findings",
    table(
      ["page", "structure", "sentences", "per 100"],
      summary.worstPages.map((page) => [page.path || ".", n(page.structure), n(page.sentences), page.per100.toFixed(1)]),
    ),
    "",
    `Totals for ${summary.corpus ?? "every corpus"}: ${n(totals.pages)} pages, ${n(totals.sentences)} sentences, ${n(totals.words)} words.`,
    `Findings: ${n(totals.findings)} (${n(totals.structure)} structure, ${n(totals.vocabulary)} vocabulary). Autofixable: ${n(totals.autofixable)}.`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// sweep
// ---------------------------------------------------------------------------------------------

async function sweepCommand(args: string[]): Promise<number> {
  const corpus = corpusOf(args);
  const loaded = await loadCorpus(rootOf(args));
  const only = await onlyPages(args, loaded);
  if ("error" in only) return usageError(only.error);
  const pages = only.pages;
  const selection = selectDeepPages(args, pages, scopeFor(corpus));
  if ("error" in selection) {
    console.error(`${selection.error}\n\n${USAGE}`);
    return 2;
  }
  const concurrency = flagValue(args, "--concurrency");
  if (concurrency !== undefined && !(Number.isInteger(Number(concurrency)) && Number(concurrency) >= 1)) {
    console.error(`--concurrency must be a whole number of at least 1, not "${concurrency}".`);
    return 2;
  }
  const deepCount = selection.deepPages?.size ?? pages.length;
  log(`corpus: ${corpus}`);
  log(`deep pages (${deepCount}, ${selection.label}): ${selection.deepPages ? [...selection.deepPages].join(", ") : "all"}`);

  const judge = args.includes("--no-judge") ? undefined : await adapter("judge", async () => (await import("./judge")).createJevJudge());
  const rewriter = args.includes("--no-rewrite") ? undefined : await adapter("rewriter", async () => (await import("./rewrite")).createBamlRewriter());
  const verifier = args.includes("--no-verify") ? undefined : await adapter("verifier", async () => (await import("./verify")).createBamlVerifier({ samples: VERIFIER_SAMPLES }));
  // Claim the output folder before the run, so two sweeps never write into one folder.
  const out = await outputFolder(flagValue(args, "--out"));
  const started = Date.now();
  const { sweep } = await import("./sweep");
  const result = await sweep({
    pages,
    corpus,
    deepPages: selection.deepPages,
    judge,
    rewriter,
    verifier,
    concurrency: concurrency === undefined ? undefined : Number(concurrency),
    onEvent: progress(pages.length, (pagePath) => !selection.deepPages || selection.deepPages.has(pagePath)),
  });
  const file = path.join(out, "sweep.json");
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(formatSweep(result, Date.now() - started, file));
  return 0;
}

/** The pages --only-pages lists, or every page without it. */
async function onlyPages(args: string[], pages: SweepPage[]): Promise<{ pages: SweepPage[] } | { error: string }> {
  if (!args.includes("--only-pages")) return { pages };
  const file = flagValue(args, "--only-pages");
  if (!file) return { error: "--only-pages needs a file with one page path per line." };
  const root = rootOf(args);
  const wanted = (await readFile(file, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    // An absolute doc.json path, as touched.txt holds, names the page it is in.
    .map((line) => normalizePagePath(path.isAbsolute(line) ? path.relative(root, line) : line));
  const known = new Set(pages.map((page) => page.path));
  const unknown = wanted.filter((pagePath) => !known.has(pagePath));
  if (unknown.length) return { error: `Unknown pages in ${file}: ${unknown.join(", ")}` };
  const keep = new Set(wanted);
  return { pages: pages.filter((page) => keep.has(page.path)) };
}

/**
 * --all deepens every page, --pages names them, and --pilot (the default) picks them from Tier 1.
 * With --only-pages and no other choice, every listed page is deep.
 */
function selectDeepPages(
  args: string[],
  pages: readonly SweepPage[],
  scope: Scope,
): { deepPages?: Set<string>; label: string } | { error: string } {
  const named = flagValue(args, "--pages");
  const modes = [args.includes("--all"), args.includes("--pilot"), args.includes("--pages")].filter(Boolean).length;
  if (modes > 1) return { error: "Choose one of --pilot, --pages, or --all." };
  if (args.includes("--all") || (modes === 0 && args.includes("--only-pages"))) return { label: "all", deepPages: undefined };
  if (args.includes("--pages")) {
    if (!named) return { error: "--pages needs a comma-separated list of page paths." };
    const known = new Set(pages.map((page) => page.path));
    const wanted = named.split(",").map(normalizePagePath).filter(Boolean);
    const unknown = wanted.filter((pagePath) => !known.has(pagePath));
    if (unknown.length) return { error: `Unknown pages: ${unknown.join(", ")}` };
    return { label: "named", deepPages: new Set(wanted) };
  }
  const linted = pages.map((page) => ({ path: page.path, findings: lintPage(page.path, page.doc, scope), sentences: pageStats(page.doc).sentences }));
  return { label: "pilot", deepPages: new Set(pickPilotPages(linted)) };
}

/** Accepts "docs/a/b", "a/b/", "a/b/doc.json", and "doc.json" for the page "a/b" or the root page. */
function normalizePagePath(input: string): string {
  return input.trim().replace(/(^|\/)doc\.json$/, "").replace(/\/+$/, "").replace(/^\.\//, "").replace(/^docs\//, "");
}

/** Builds a service adapter, or reports why it cannot and lets the sweep run without that tier. */
async function adapter<T extends Judge | Rewriter | Verifier>(name: string, create: () => Promise<T>): Promise<T | undefined> {
  try {
    return await create();
  } catch (error) {
    log(`no ${name}: ${error instanceof Error ? error.message : String(error)}. The sweep runs without it.`);
    return undefined;
  }
}

/** Progress on stderr: one line per deep-page step and rewrite, one line when Tier 1 finishes. */
function progress(pageCount: number, isDeep: (pagePath: string) => boolean): (event: SweepEvent) => void {
  let linted = 0;
  let rewrites = 0;
  return (event) => {
    if (event.type === "tier" && event.tier === 1) {
      linted += 1;
      if (linted === pageCount) log(`tier 1: ${pageCount} pages linted and autofixed`);
    } else if (event.type === "tier") log(`${event.path}: tier ${event.tier}, ${event.detail}`);
    else if (event.type === "rewrite") log(`rewrite ${(rewrites += 1)}: ${event.path} ${event.blockId} ${event.status}`);
    else if (event.type === "page-done" && isDeep(event.path)) log(`done: ${event.path}`);
  };
}

function formatSweep(result: SweepResult, ms: number, file: string): string {
  const changes = result.pages.flatMap((page) => page.changes);
  const count = (kind: string, status: string) => changes.filter((c) => c.kind === kind && c.status === status).length;
  const rewrites = changes.filter((change) => change.kind === "rewrite").length;
  const structure = (findings: StyleFinding[]) => findings.filter((finding) => finding.layer === "structure").length;
  const before = sum(result.pages.map((page) => structure(page.findings.filter((finding) => finding.tier === 1))));
  const after = sum(result.pages.map((page) => structure(page.findingsAfter)));
  const words = sum(result.pages.map((page) => page.stats.words));
  const wordsAfter = sum(result.pages.map((page) => page.wordsAfter));
  const relative = displayPath(file);
  const skipped = result.config.rewriteSkipped ? [`Rewrites skipped: ${result.config.rewriteSkipped}.`] : [];
  return [
    ...skipped,
    `Sweep finished in ${duration(ms)}.`,
    `  corpus: ${result.config.corpus ?? "every corpus"}`,
    `  pages: ${n(result.pages.length)} (${n(result.config.deepPages.length)} deep)`,
    `  tiers: judge ${result.config.judge ? "on" : "off"}${result.config.judgeError ? ` (${result.config.judgeError})` : ""}, rewriter ${result.config.rewriter ? "on" : "off"}${result.config.models.length ? ` (${result.config.models.join(", ")})` : ""}`,
    `  autofixes: ${n(count("autofix", "accepted"))} accepted, ${n(count("autofix", "rejected"))} rejected, ${n(count("autofix", "error"))} errors`,
    `  rewrites: ${n(rewrites)} tried, ${n(count("rewrite", "accepted"))} accepted, ${n(count("rewrite", "rejected"))} rejected, ${n(count("rewrite", "unchanged"))} unchanged, ${n(count("rewrite", "error"))} errors`,
    `  structure findings (Tier 1): ${n(before)} -> ${n(after)}`,
    `  words: ${n(words)} -> ${n(wordsAfter)}`,
    `  wrote ${relative}`,
    `Next: bun run docs style report ${relative}`,
    `Then: bun run docs style batches ${relative}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------------------------

async function reportCommand(args: string[]): Promise<number> {
  const [input] = positionals(args);
  if (!input) {
    console.error(`report needs a sweep.json path.\n\n${USAGE}`);
    return 2;
  }
  const result = JSON.parse(await readFile(input, "utf8")) as SweepResult;
  const { renderReport } = await import("./report");
  const out = flagValue(args, "--out") ?? path.join(path.dirname(input), "report.html");
  const reviewFiles = flagValue(args, "--review")?.split(",").filter(Boolean) ?? [];
  const review = reviewFiles.length ? await readReviews(reviewFiles) : undefined;
  await writeFile(out, renderReport(result, { review }));
  console.log(`wrote ${out}`);
  return 0;
}

/**
 * Merges independent review files into one overlay. Each file holds { reviewer, summary, labels },
 * as the content reviewers write them. Later files win on a duplicate key.
 */
async function readReviews(files: readonly string[]): Promise<ReviewOverlay> {
  const parts = await Promise.all(
    files.map(async (file) => JSON.parse(await readFile(file, "utf8")) as Partial<ReviewOverlay>),
  );
  return {
    reviewer: parts.map((part) => part.reviewer).filter(Boolean).join(", "),
    summary: parts.map((part) => part.summary).filter(Boolean).join("\n\n"),
    labels: Object.assign({}, ...parts.map((part) => part.labels ?? {})),
  };
}

// ---------------------------------------------------------------------------------------------
// batches, decide, apply, restore
// ---------------------------------------------------------------------------------------------

async function batchesCommand(args: string[]): Promise<number> {
  const [input] = positionals(args);
  if (!input) return usageError("batches needs a sweep.json path.");
  const size = Number(flagValue(args, "--size") ?? "60");
  if (!Number.isInteger(size) || size < 1) return usageError(`--size must be a whole number of at least 1, not "${flagValue(args, "--size")}".`);
  const result = await readSweep(input);
  const out = path.resolve(flagValue(args, "--out") ?? path.join(path.dirname(input), "batches"));
  const { writeBatches } = await import("./sweep/review");
  const index = await writeBatches(result, out, size, path.resolve(input));
  console.log(`Wrote ${count(index.total, "accepted change")} in ${count(index.batches.length, "batch")} of up to ${size} to ${displayPath(out)}.`);
  for (const batch of index.batches) console.log(`  ${batch.file}: ${count(batch.count, "change")}, ${count(batch.pages.length, "page")}`);
  return 0;
}

async function decideCommand(args: string[]): Promise<number> {
  const r1 = flagValues(args, "--r1");
  const r2 = flagValues(args, "--r2");
  const out = flagValue(args, "--out");
  if (!r1.length || !out) return usageError("decide needs --r1 files and --out. Without --r2 files, nothing is approved.");
  const { decide, formatDecisions } = await import("./sweep/review");
  const decisions = decide(await Promise.all(r1.map((file) => readJson<R1File>(file))), await Promise.all(r2.map((file) => readJson<R2File>(file))));
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await writeFile(out, `${JSON.stringify(decisions, null, 2)}\n`);
  console.log(formatDecisions(decisions));
  console.log(`wrote ${displayPath(path.resolve(out))}`);
  return 0;
}

async function applyCommand(args: string[]): Promise<number> {
  const [input] = positionals(args);
  const decisionsFile = flagValue(args, "--decisions");
  if (!input || !decisionsFile) return usageError("apply needs a sweep.json path and --decisions.");
  const result = await readSweep(input);
  const approved = new Set((await readJson<{ approved?: string[] }>(decisionsFile)).approved ?? []);
  const corpus = flagValue(args, "--corpus") ?? result.config.corpus ?? corpusOf(args);
  if (result.config.corpus && result.config.corpus !== corpus) {
    return usageError(`The sweep is for ${result.config.corpus}, not ${corpus}.`);
  }
  const dryRun = args.includes("--dry-run");
  // A dry run writes nothing, so it claims no backup folder.
  const backupDir = flagValue(args, "--backup-dir")
    ? path.resolve(flagValue(args, "--backup-dir")!)
    : dryRun
      ? path.resolve(BACKUPS, corpus)
      : await newRunFolder(path.resolve(BACKUPS, corpus));
  const { applyApproved } = await import("./sweep/apply");
  const report = await applyApproved({
    result,
    approved,
    docsRoot: rootOf(args),
    backupDir,
    touchedFile: path.resolve(flagValue(args, "--touched") ?? TOUCHED),
    dryRun,
    log,
  });
  const changes = (pages: readonly { keys: string[] }[]) => sum(pages.map((page) => page.keys.length));
  console.log(
    [
      dryRun
        ? `Dry run: would apply ${count(changes(report.wouldApply), "change")} to ${count(report.wouldApply.length, "page")} of ${corpus}.`
        : `Applied ${count(changes(report.applied), "change")} to ${count(report.applied.length, "page")} of ${corpus}.`,
      `  approved: ${n(approved.size)}, held: ${n(report.held.length)}, pages skipped: ${n(report.skipped.length)}`,
      ...report.skipped.map((skip) => `  skipped ${skip.page || "."}: ${skip.reason}`),
      ...report.held.map((held) => `  held ${held.key}: ${held.reason}`),
      ...(dryRun
        ? ["  nothing was written"]
        : [`  report: ${displayPath(path.join(backupDir, "apply-report.json"))}`, `Undo: bun run docs style restore --backup-dir ${displayPath(backupDir)}`]),
    ].join("\n"),
  );
  return 0;
}

async function restoreCommand(args: string[]): Promise<number> {
  const backupDir = flagValue(args, "--backup-dir");
  if (!backupDir) return usageError("restore needs --backup-dir.");
  const { restoreBackups } = await import("./sweep/apply");
  const report = await restoreBackups(backupDir, log);
  console.log(`Restored ${count(report.restored.length, "page")}. Conflicts: ${n(report.conflicts.length)}.`);
  for (const conflict of report.conflicts) console.log(`  conflict ${conflict.page || "."}: ${conflict.reason}`);
  return report.conflicts.length ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// export-jobs, import-answers
// ---------------------------------------------------------------------------------------------

async function exportJobsCommand(args: string[]): Promise<number> {
  const out = flagValue(args, "--out");
  if (!out) return usageError("export-jobs needs --out, a jobs.jsonl file or a folder.");
  const root = rootOf(args);
  const corpus = corpusOf(args);
  const only = await onlyPages(args, await loadCorpus(root));
  if ("error" in only) return usageError(only.error);
  const { defaultJobRules, exportJobs } = await import("./sweep/editor");
  const scope = scopeFor(corpus);
  const listed = flagValue(args, "--rules")?.split(",").map((id) => id.trim()).filter(Boolean);
  const known = new Set([...lintRules.map((rule) => rule.id), ...scope.rules.map((rule) => rule.id)]);
  const unknown = (listed ?? []).filter((id) => !known.has(id));
  if (unknown.length) return usageError(`Unknown rules: ${unknown.join(", ")}`);
  const rules = listed ? new Set(listed) : defaultJobRules(scope.rules);
  const judge = args.includes("--no-judge") ? undefined : await adapter("judge", async () => (await import("./judge")).createJevJudge());
  const { jobs, held, exempt } = await exportJobs({ pages: only.pages, corpus, rules, judge });

  const file = path.resolve(out.endsWith(".jsonl") ? out : path.join(out, `${corpus}.jsonl`));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, jobs.map((job) => `${JSON.stringify(job)}\n`).join(""));
  // index.json lists one jobs file per corpus. A new export of a corpus replaces its entry.
  const indexFile = path.join(path.dirname(file), "index.json");
  const index = await readJson<{ corpora: { corpus: string }[] }>(indexFile).catch(() => ({ corpora: [] }));
  const entry = {
    corpus,
    file: path.basename(file),
    root,
    jobs: jobs.length,
    pages: new Set(jobs.map((job) => job.page)).size,
    held,
    exempt,
    rules: [...rules].sort(),
    createdAt: new Date().toISOString(),
  };
  index.corpora = [...index.corpora.filter((other) => other.corpus !== corpus), entry].sort((a, b) => compare(a.corpus, b.corpus));
  await writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`);
  console.log(
    [
      `Wrote ${count(jobs.length, "job")} on ${count(entry.pages, "page")} of ${corpus} to ${displayPath(file)}.`,
      `  skipped: ${count(held, "held block")}, ${count(exempt, "exempt block")}`,
      `  index: ${displayPath(indexFile)}`,
    ].join("\n"),
  );
  return 0;
}

async function importAnswersCommand(args: string[]): Promise<number> {
  const jobsFile = flagValue(args, "--jobs");
  const answersFile = flagValue(args, "--answers");
  const out = flagValue(args, "--out");
  if (!jobsFile || !answersFile || !out) return usageError("import-answers needs --jobs, --answers, and --out.");
  const concurrency = flagValue(args, "--concurrency");
  if (concurrency !== undefined && !(Number.isInteger(Number(concurrency)) && Number(concurrency) >= 1)) {
    return usageError(`--concurrency must be a whole number of at least 1, not "${concurrency}".`);
  }
  const jobs = await readJsonl<EditorJob>(jobsFile);
  const answers = await readJsonl<EditorAnswer>(answersFile);
  const corpus = flagValue(args, "--corpus") ?? jobs[0]?.corpus ?? corpusOf(args);
  const pages = await loadCorpus(rootOf(args));
  const judge = args.includes("--no-judge") ? undefined : await adapter("judge", async () => (await import("./judge")).createJevJudge());
  // Two independent answers per comparison: the change is "same" only when both find no difference.
  const verifier = args.includes("--no-verify") ? undefined : await adapter("verifier", async () => (await import("./verify")).createBamlVerifier({ samples: 2 }));
  const { importAnswers } = await import("./sweep/editor");
  const { result, problems } = await importAnswers({
    jobs,
    answers,
    pages,
    corpus,
    judge,
    verifier,
    concurrency: concurrency === undefined ? undefined : Number(concurrency),
    onAnswer: (key, status) => log(`${key}: ${status}`),
  });
  const file = path.resolve(out);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
  const changes = result.pages.flatMap((page) => page.changes);
  const status = (name: string) => changes.filter((change) => change.status === name).length;
  console.log(
    [
      `Checked ${count(changes.length, "answer")} for ${corpus}: ${n(status("accepted"))} accepted, ${n(status("rejected"))} rejected, ${n(status("unchanged"))} unchanged, ${n(status("error"))} errors.`,
      ...problems.map((problem) => `  ${problem}`),
      `  wrote ${displayPath(file)}`,
      `Next: bun run docs style batches ${displayPath(file)}`,
    ].join("\n"),
  );
  return 0;
}

/** One JSON value per line. A blank line is skipped, and a bad line names its number. */
async function readJsonl<T>(file: string): Promise<T[]> {
  const lines = (await readFile(file, "utf8")).split("\n");
  return lines.flatMap((line, i) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line) as T];
    } catch (error) {
      throw new Error(`${file}:${i + 1} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

async function readSweep(file: string): Promise<SweepResult> {
  return readJson<SweepResult>(file);
}

async function readJson<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    throw new Error(`Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function usageError(message: string): number {
  console.error(`${message}\n\n${USAGE}`);
  return 2;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function rootOf(args: string[]): string {
  return path.resolve(flagValue(args, "--root") ?? "docs");
}

/** --corpus, or the name of the project folder that holds the docs root, such as "docs-system". */
function corpusOf(args: string[]): string {
  return flagValue(args, "--corpus") ?? path.basename(path.dirname(rootOf(args)));
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  const value = index === -1 ? undefined : args[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

/** Every value of a flag that may repeat, each one split at commas. */
function flagValues(args: readonly string[], flag: string): string[] {
  return args.flatMap((arg, i) => (arg === flag && args[i + 1] && !args[i + 1]!.startsWith("--") ? args[i + 1]!.split(",") : [])).filter(Boolean);
}

function positionals(args: readonly string[]): string[] {
  return args.filter((arg, i) => !arg.startsWith("--") && !(i > 0 && VALUE_FLAGS.has(args[i - 1]!)));
}

/**
 * The folder a sweep writes to. --out is used as given. The default is a new folder per run under
 * .tmp/style-sweep/, named by the time to the second plus a random suffix. The final mkdir is not
 * recursive, so it fails on a folder that already exists, and the run never shares a folder.
 */
async function outputFolder(explicit: string | undefined): Promise<string> {
  if (explicit) {
    const dir = path.resolve(explicit);
    await mkdir(dir, { recursive: true });
    return dir;
  }
  return newRunFolder(path.resolve(".tmp", "style-sweep"));
}

/** A new folder under `parent`, named by the time to the second plus a random suffix. */
async function newRunFolder(parent: string): Promise<string> {
  await mkdir(parent, { recursive: true });
  for (let attempt = 1; ; attempt += 1) {
    const dir = path.join(parent, `${stamp(new Date())}-${randomBytes(3).toString("hex")}`);
    try {
      await mkdir(dir);
      return dir;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 5) throw error;
    }
  }
}

/** A folder-safe local timestamp: YYYY-MM-DDTHH-MM-SS. */
function stamp(date: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `${day}T${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`;
}

function table(header: string[], rows: string[][]): string {
  const widths = header.map((title, i) => Math.max(title.length, ...rows.map((row) => row[i]!.length)));
  // The first column is text and reads left-aligned. Counts read right-aligned.
  const line = (cells: string[]) => cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!))).join("  ");
  return [line(header), widths.map((width) => "-".repeat(width)).join("  "), ...rows.map(line)].join("\n");
}

function log(message: string): void {
  console.error(message);
}

/** A path under the working folder reads shorter as relative. Anything else stays absolute. */
function displayPath(file: string): string {
  return file.startsWith(`${process.cwd()}${path.sep}`) ? path.relative(process.cwd(), file) : file;
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** "1 page", "2 pages". A noun that ends in "ch" takes "es". */
function count(value: number, noun: string): string {
  return `${n(value)} ${noun}${value === 1 ? "" : noun.endsWith("ch") ? "es" : "s"}`;
}

function n(value: number): string {
  return value.toLocaleString("en-US");
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
