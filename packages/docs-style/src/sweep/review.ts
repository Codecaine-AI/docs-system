/**
 * The two review steps between a sweep and an apply. Every accepted change goes to a reviewer (R1)
 * in a batch file. An auditor (R2) then re-checks R1's approvals blind. Only a change that R1
 * approves, R2 checks, and R2 does not flag is applied.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { meaningMarkdown } from "../text";
import type { BlockChange, SweepResult } from "../types";
import { changeKey } from "./stage";

/** One change as a reviewer reads it: both sides in the meaning view, plus the text around it. */
export interface BatchLine {
  /** "page#blockId", or "page#blockId@autofix" for an autofix. */
  key: string;
  page: string;
  blockId: string;
  kind: BlockChange["kind"];
  blockType: string;
  ruleIds: string[];
  /** The block before the change, with link and reference targets shown. */
  before: string;
  /** The block after the change: a lead line plus "- " bullet lines for a structural rewrite. */
  after: string;
  heading?: string;
  previous?: string;
  next?: string;
  /** The parent list item, for a nested list item. */
  parent?: string;
}

export interface BatchIndex {
  /** The sweep.json the batches came from. */
  source?: string;
  size: number;
  total: number;
  batches: { file: string; count: number; pages: string[] }[];
}

/** The review line of every accepted change, in sweep order: by page, and in each page in change order. */
export function reviewLines(result: SweepResult): BatchLine[] {
  return result.pages.flatMap((page) =>
    page.changes
      .filter((change) => change.status === "accepted" && change.produced?.length)
      .map((change): BatchLine => ({
        key: changeKey(page.path, change),
        page: page.path,
        blockId: change.blockId,
        kind: change.kind,
        blockType: change.blockType,
        ruleIds: change.ruleIds,
        // A sweep from before beforeSpans existed still has the plain markdown.
        before: change.beforeSpans ? meaningMarkdown([{ spans: change.beforeSpans, depth: 0 }]) : change.before,
        after: meaningMarkdown(change.produced!),
        ...withoutEmpty(change.context ?? {}),
      })),
  );
}

/**
 * Splits lines into batches of about `size` lines. A page stays in one batch, so a reviewer sees
 * every change to a page together. Only a page with more than `size` changes is split.
 */
export function splitBatches(lines: readonly BatchLine[], size: number): BatchLine[][] {
  const byPage = new Map<string, BatchLine[]>();
  for (const line of lines) byPage.set(line.page, [...(byPage.get(line.page) ?? []), line]);
  const batches: BatchLine[][] = [];
  let current: BatchLine[] = [];
  for (const group of byPage.values()) {
    // A page that fits in a batch is one chunk, so it starts a new batch only when it does not fit.
    for (let at = 0; at < group.length; at += size) {
      const chunk = group.slice(at, at + size);
      if (current.length && current.length + chunk.length > size) {
        batches.push(current);
        current = [];
      }
      current.push(...chunk);
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

/** Writes batch-001.jsonl, batch-002.jsonl, and so on, plus index.json, into `out`. */
export async function writeBatches(result: SweepResult, out: string, size: number, source?: string): Promise<BatchIndex> {
  const lines = reviewLines(result);
  const batches = splitBatches(lines, size);
  await mkdir(out, { recursive: true });
  const width = Math.max(3, String(batches.length).length);
  const index: BatchIndex = { ...(source ? { source } : {}), size, total: lines.length, batches: [] };
  for (const [i, batch] of batches.entries()) {
    const file = `batch-${String(i + 1).padStart(width, "0")}.jsonl`;
    await writeFile(path.join(out, file), batch.map((line) => JSON.stringify(line)).join("\n") + "\n");
    index.batches.push({ file, count: batch.length, pages: [...new Set(batch.map((line) => line.page))] });
  }
  await writeFile(path.join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

// ---------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------

/** A reviewer's file: one verdict per change key it read. */
export interface R1File {
  reviewer: string;
  decisions: Record<string, { verdict: "approve" | "reject"; label?: string; note?: string }>;
}

/** An auditor's file: the R1-approved keys it re-checked, and the ones it flags as wrong. */
export interface R2File {
  auditor: string;
  checked: string[];
  flags: Record<string, { label?: string; note?: string }>;
}

export interface DecisionMetrics {
  /** The changes the machine accepted that a reviewer read. */
  machineAccepted: number;
  r1: {
    approve: number;
    reject: number;
    /** reject / (approve + reject): the machine's error rate as R1 sees it. */
    rejectRate: number;
    /** Keys that two R1 files decided differently. The reject wins. */
    conflicts: number;
    approveByLabel: Record<string, number>;
    rejectByLabel: Record<string, number>;
  };
  r2: {
    /** R1-approved keys that R2 checked. */
    checked: number;
    /** R1-approved keys that R2 flagged. */
    flagged: number;
    /** R1-approved keys that R2 did not check. They are not applied. */
    unchecked: number;
    flagsByLabel: Record<string, number>;
  };
  approved: number;
}

export interface Decisions {
  createdAt: string;
  reviewers: string[];
  auditors: string[];
  /** The keys to apply: R1 approved, R2 checked, and R2 did not flag. */
  approved: string[];
  rejected: { key: string; by: "R1" | "R2"; label?: string; note?: string }[];
  /** R1 approved these, but no R2 file checked them. */
  unchecked: string[];
  metrics: DecisionMetrics;
}

const UNLABELLED = "(no label)";

/** Merges every R1 and R2 file into one decision per key. Conservative: any reject or flag wins. */
export function decide(r1Files: readonly R1File[], r2Files: readonly R2File[]): Decisions {
  const verdicts = new Map<string, { verdict: "approve" | "reject"; label?: string; note?: string }>();
  let conflicts = 0;
  for (const file of r1Files)
    for (const [key, decision] of Object.entries(file.decisions ?? {})) {
      const seen = verdicts.get(key);
      if (seen && seen.verdict !== decision.verdict) conflicts += 1;
      if (!seen || decision.verdict === "reject") verdicts.set(key, decision);
    }
  const checked = new Set(r2Files.flatMap((file) => file.checked ?? []));
  const flags = new Map(r2Files.flatMap((file) => Object.entries(file.flags ?? {})));

  const approved: string[] = [];
  const rejected: Decisions["rejected"] = [];
  const unchecked: string[] = [];
  const r1Approved: string[] = [];
  const tally = (counts: Record<string, number>, label: string | undefined) => {
    const name = label?.trim() || UNLABELLED;
    counts[name] = (counts[name] ?? 0) + 1;
  };
  const approveByLabel: Record<string, number> = {};
  const rejectByLabel: Record<string, number> = {};
  const flagsByLabel: Record<string, number> = {};
  for (const [key, { verdict, label, note }] of [...verdicts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (verdict === "reject") {
      tally(rejectByLabel, label);
      rejected.push({ key, by: "R1", ...withoutEmpty({ label, note }) });
      continue;
    }
    tally(approveByLabel, label);
    r1Approved.push(key);
    const flag = flags.get(key);
    if (flag) {
      tally(flagsByLabel, flag.label);
      rejected.push({ key, by: "R2", ...withoutEmpty({ label: flag.label, note: flag.note }) });
    } else if (!checked.has(key)) unchecked.push(key);
    else approved.push(key);
  }
  const r1Rejected = rejected.filter((entry) => entry.by === "R1").length;
  const reviewed = r1Approved.length + r1Rejected;
  return {
    createdAt: new Date().toISOString(),
    reviewers: r1Files.map((file) => file.reviewer),
    auditors: r2Files.map((file) => file.auditor),
    approved,
    rejected,
    unchecked,
    metrics: {
      machineAccepted: new Set([...verdicts.keys(), ...checked, ...flags.keys()]).size,
      r1: {
        approve: r1Approved.length,
        reject: r1Rejected,
        rejectRate: reviewed ? r1Rejected / reviewed : 0,
        conflicts,
        approveByLabel,
        rejectByLabel,
      },
      r2: {
        checked: r1Approved.filter((key) => checked.has(key) || flags.has(key)).length,
        flagged: r1Approved.filter((key) => flags.has(key)).length,
        unchecked: unchecked.length,
        flagsByLabel,
      },
      approved: approved.length,
    },
  };
}

/** The metrics as lines for a terminal. */
export function formatDecisions(decisions: Decisions): string {
  const { metrics } = decisions;
  const labels = (counts: Record<string, number>) =>
    Object.entries(counts)
      .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
      .map(([label, n]) => `${label} ${n}`)
      .join(", ") || "none";
  const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;
  return [
    `Machine accepted: ${metrics.machineAccepted} changes`,
    `R1 (${decisions.reviewers.join(", ") || "none"}): ${metrics.r1.approve} approve, ${metrics.r1.reject} reject (${percent(metrics.r1.rejectRate)})${metrics.r1.conflicts ? `, ${metrics.r1.conflicts} conflicts` : ""}`,
    `  approve by label: ${labels(metrics.r1.approveByLabel)}`,
    `  reject by label: ${labels(metrics.r1.rejectByLabel)}`,
    `R2 (${decisions.auditors.join(", ") || "none"}): ${metrics.r2.checked} checked, ${metrics.r2.flagged} flagged, ${metrics.r2.unchecked} R1 approvals unchecked`,
    `  flags by label: ${labels(metrics.r2.flagsByLabel)}`,
    `Approved for apply: ${metrics.approved}`,
  ].join("\n");
}

function withoutEmpty<T extends Record<string, string | undefined>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== "")) as Partial<T>;
}
