/**
 * Writes approved changes to a corpus, and undoes such a write. These are the only writes this
 * package makes to docs. Each write is guarded:
 * - The page must hash to what the sweep read.
 * - The page must have no uncommitted edit that the rollout did not make.
 * - Its doc.json is copied to the backup folder first.
 * - The ops go through docs-server's typed write path with the page's hash as the precondition.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, copyFile, constants, mkdir, readdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateDocDocument } from "@codecaine-ai/docs-model";
import type { SweepResult } from "../types";
import { docHash, planStage } from "./stage";

/** The session the rollout's writes carry, so docs-server's draft locks can tell them apart. */
const SESSION = "ste-rollout";

export interface ApplyOptions {
  result: SweepResult;
  /** The change keys to apply, from decide. */
  approved: ReadonlySet<string>;
  docsRoot: string;
  /** Each page's doc.json is copied here before it is written. apply-report.json goes here too. */
  backupDir: string;
  /**
   * The pages the rollout wrote. Such a page may have uncommitted changes. A line is an absolute
   * doc.json path (apply writes these), or a page path relative to the docs folder of the project
   * that holds the rollout folder, `<project>/.tmp/ste-rollout/touched.txt`.
   */
  touchedFile: string;
  dryRun?: boolean;
  log?(line: string): void;
}

export interface AppliedPage {
  page: string;
  /** The absolute doc.json path. */
  doc: string;
  keys: string[];
  ops: number;
  backup: string;
  /** SHA-256 of the doc.json bytes before and right after the write. Restore needs afterHash. */
  beforeHash: string;
  afterHash: string;
}

export interface ApplyReport {
  docsRoot: string;
  backupDir: string;
  corpus?: string;
  sweepStartedAt: string;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  applied: AppliedPage[];
  /** A dry run's pages: what a real run would write. */
  wouldApply: { page: string; keys: string[]; ops: number }[];
  skipped: { page: string; reason: string; keys: string[] }[];
  /** Approved changes that their page's write leaves out. */
  held: { key: string; reason: string }[];
}

export const APPLY_REPORT = "apply-report.json";

/**
 * Applies the approved changes page by page. apply-report.json in the backup folder is rewritten
 * after every page, so a run that stops halfway still records every page it wrote. A dry run
 * writes nothing at all: it only returns the report.
 */
export async function applyApproved(options: ApplyOptions): Promise<ApplyReport> {
  const log = options.log ?? (() => {});
  const docsRoot = await realpath(options.docsRoot);
  const backupDir = path.resolve(options.backupDir);
  if (!options.dryRun) {
    // One folder per run: a reused folder would mix two runs' backups and lose one run's report.
    if ((await readdir(backupDir).catch(() => [])).length) throw new Error(`The backup folder is not empty: ${backupDir}`);
    await mkdir(backupDir, { recursive: true });
  }
  const report: ApplyReport = {
    docsRoot,
    backupDir,
    ...(options.result.config.corpus ? { corpus: options.result.config.corpus } : {}),
    sweepStartedAt: options.result.startedAt,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    dryRun: !!options.dryRun,
    applied: [],
    wouldApply: [],
    skipped: [],
    held: [],
  };
  const saveReport = async () => {
    if (!options.dryRun) await writeFile(path.join(backupDir, APPLY_REPORT), `${JSON.stringify(report, null, 2)}\n`);
  };
  const dirty = gitDirtyFiles(docsRoot);
  const touched = await readTouched(options.touchedFile);
  const skip = (page: string, reason: string, keys: string[]) => {
    report.skipped.push({ page, reason, keys });
    log(`skipped ${page || "."}: ${reason}`);
  };

  for (const page of options.result.pages) {
    const keys = [...options.approved].filter((key) => key.startsWith(`${page.path}#`)).sort();
    if (!keys.length) continue;
    const doc = path.join(docsRoot, page.path, "doc.json");
    let raw: string;
    try {
      raw = await readFile(doc, "utf8");
    } catch (error) {
      skip(page.path, `cannot read doc.json: ${messageOf(error)}`, keys);
      continue;
    }
    const loaded = parseDoc(raw);
    if (!loaded) {
      skip(page.path, "doc.json is not a valid page", keys);
      continue;
    }
    if (!page.baseHash || docHash(loaded) !== page.baseHash) {
      skip(page.path, "changed since sweep", keys);
      continue;
    }
    if (dirty?.has(doc) && !touched.has(doc)) {
      skip(page.path, "uncommitted changes that the rollout did not make", keys);
      continue;
    }
    let plan: ReturnType<typeof planStage>;
    try {
      plan = planStage(loaded, page, options.approved);
    } catch (error) {
      skip(page.path, messageOf(error), keys);
      continue;
    }
    report.held.push(...plan.held);
    if (!plan.ops.length) {
      skip(page.path, "no approved change can be staged", keys);
      continue;
    }
    if (options.dryRun) {
      report.wouldApply.push({ page: page.path, keys: plan.staged, ops: plan.ops.length });
      log(`would apply ${page.path || "."}: ${count(plan.staged.length, "change")}, ${count(plan.ops.length, "op")}`);
      continue;
    }

    const backup = path.join(backupDir, page.path, "doc.json");
    await mkdir(path.dirname(backup), { recursive: true });
    // Never overwrite a backup: an older backup is the only copy of an older state.
    await copyFile(doc, backup, constants.COPYFILE_EXCL);
    const beforeHash = sha256(raw);
    let refusal: string | undefined;
    try {
      const { applyDocOpsToBundle } = await import("@codecaine-ai/docs-server");
      // normalize: false keeps the write to the approved changes alone (no title-heading cleanup).
      const written = await applyDocOpsToBundle(docsRoot, page.path || "doc.json", plan.ops, page.baseHash, SESSION, {
        lintPhase: "draft",
        normalize: false,
      });
      if (!written.ok) refusal = `the write was refused (${written.status}): ${written.detail}`;
    } catch (error) {
      refusal = `the write failed: ${messageOf(error)}`;
    }
    // Trust the file, not the result: a write that failed late may still have changed it.
    const afterHash = sha256(await readFile(doc, "utf8"));
    if (afterHash === beforeHash) {
      await unlink(backup);
      skip(page.path, refusal ?? "the write changed nothing", keys);
      continue;
    }
    if (!touched.has(doc)) {
      await mkdir(path.dirname(options.touchedFile), { recursive: true });
      await appendFile(options.touchedFile, `${doc}\n`);
      touched.add(doc);
    }
    report.applied.push({ page: page.path, doc, keys: plan.staged, ops: plan.ops.length, backup, beforeHash, afterHash });
    await saveReport();
    log(`applied ${page.path || "."}: ${count(plan.staged.length, "change")}, ${count(plan.ops.length, "op")}${refusal ? ` (${refusal})` : ""}`);
  }

  report.finishedAt = new Date().toISOString();
  await saveReport();
  return report;
}

export interface RestoreReport {
  backupDir: string;
  startedAt: string;
  finishedAt: string;
  restored: { page: string; doc: string }[];
  conflicts: { page: string; doc: string; reason: string }[];
}

/**
 * Puts back every page an apply wrote, from its backup. A page is restored only when its doc.json
 * still holds exactly the bytes the apply wrote. Anything else is a conflict, left as it is.
 */
export async function restoreBackups(backupDir: string, log: (line: string) => void = () => {}): Promise<RestoreReport> {
  const dir = path.resolve(backupDir);
  const applied = JSON.parse(await readFile(path.join(dir, APPLY_REPORT), "utf8")) as ApplyReport;
  const report: RestoreReport = { backupDir: dir, startedAt: new Date().toISOString(), finishedAt: "", restored: [], conflicts: [] };
  const conflict = (page: string, doc: string, reason: string) => {
    report.conflicts.push({ page, doc, reason });
    log(`conflict ${page || "."}: ${reason}`);
  };
  const { atomicWriteFile } = await import("@codecaine-ai/docs-server");
  for (const entry of applied.applied ?? []) {
    let current: string;
    try {
      current = await readFile(entry.doc, "utf8");
    } catch (error) {
      conflict(entry.page, entry.doc, `cannot read doc.json: ${messageOf(error)}`);
      continue;
    }
    if (sha256(current) !== entry.afterHash) {
      conflict(entry.page, entry.doc, "changed since apply");
      continue;
    }
    const backup = await readFile(entry.backup, "utf8");
    if (sha256(backup) !== entry.beforeHash) {
      conflict(entry.page, entry.doc, "the backup does not match the hash the apply recorded");
      continue;
    }
    await atomicWriteFile(entry.doc, backup);
    report.restored.push({ page: entry.page, doc: entry.doc });
    log(`restored ${entry.page || "."}`);
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(dir, "restore-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

/**
 * The absolute paths of files git reports as modified, staged, or untracked under `docsRoot`.
 * Undefined when `docsRoot` is not in a git repository, so there is nothing to check.
 */
export function gitDirtyFiles(docsRoot: string): Set<string> | undefined {
  const top = spawnSync("git", ["-C", docsRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (top.status !== 0) return undefined;
  const repo = top.stdout.trim();
  const scope = path.relative(repo, docsRoot) || ".";
  const status = spawnSync("git", ["-C", repo, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", scope], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  // A failed status must stop the apply: without it, a dirty page would look clean.
  if (status.status !== 0) throw new Error(`git status failed in ${repo}: ${status.stderr.trim()}`);
  const dirty = new Set<string>();
  const entries = status.stdout.split("\0");
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (entry.length < 4) continue;
    dirty.add(path.join(repo, entry.slice(3)));
    // A rename or copy is followed by its source path, which is not a status entry.
    if (entry[0] === "R" || entry[0] === "C") i += 1;
  }
  return dirty;
}

/** The absolute doc.json paths that touched.txt lists. See ApplyOptions.touchedFile for its lines. */
async function readTouched(file: string): Promise<Set<string>> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return new Set();
  }
  const projectDocs = path.resolve(path.dirname(file), "..", "..", "docs");
  const docsRoot = await realpath(projectDocs).catch(() => projectDocs);
  return new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (!path.isAbsolute(line)) return path.join(docsRoot, line, "doc.json");
        return line.endsWith(".json") ? line : path.join(line, "doc.json");
      }),
  );
}

function parseDoc(raw: string) {
  try {
    const validated = validateDocDocument(JSON.parse(raw));
    return validated.ok ? validated.document : undefined;
  } catch {
    return undefined;
  }
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim();
}
