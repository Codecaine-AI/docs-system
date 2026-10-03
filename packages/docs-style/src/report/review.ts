/**
 * The optional reviewer overlay: an independent agent reads each accepted rewrite and labels it.
 * The report shows each label on its card, a tally with a "would reject" rate in panel A, and a
 * "reviewer: flagged" filter in panel D.
 */
import type { BlockChange, SweepResult } from "../types";
import { esc, pct, plural, prose } from "./html";

export type ReviewLabel = "improved" | "neutral" | "lost-context" | "meaning-changed" | "added-slop" | "worse-readability";

export interface ReviewOverlay {
  /** Short markdown-ish text: paragraphs and "- " bullets. */
  summary: string;
  reviewer: string;
  /**
   * Keyed by `${pagePath}#${blockId}`. A label for an autofix carries kind "autofix", or uses the
   * key `${pagePath}#${blockId}@autofix` when the same block also has a rewrite.
   */
  labels: Record<string, { label: ReviewLabel; note: string; kind?: "rewrite" | "autofix" }>;
}

/** Every label, in the order the tally lists them. */
export const REVIEW_LABELS: readonly ReviewLabel[] = [
  "improved",
  "neutral",
  "lost-context",
  "meaning-changed",
  "added-slop",
  "worse-readability",
];

/** The labels that mean the reviewer would reject the rewrite. */
const REJECTS: ReadonlySet<string> = new Set(["lost-context", "meaning-changed", "added-slop", "worse-readability"]);

/** good = green, flagged = red, neutral = gray. An unknown label reads as neutral. */
export type ReviewTone = "good" | "neutral" | "flagged";

export function labelTone(label: string): ReviewTone {
  if (label === "improved") return "good";
  return REJECTS.has(label) ? "flagged" : "neutral";
}

/** One rewrite's label, ready for its card. */
export interface CardReview {
  label: string;
  note: string;
  reviewer: string;
  tone: ReviewTone;
}

/** The label entry for one change, matched by key and kind. */
function labelEntry(overlay: ReviewOverlay, path: string, change: BlockChange) {
  const key = `${path}#${change.blockId}`;
  const plain = overlay.labels?.[key];
  if (change.kind === "autofix") return overlay.labels?.[`${key}@autofix`] ?? (plain?.kind === "autofix" ? plain : undefined);
  return plain && plain.kind !== "autofix" ? plain : undefined;
}

/** Finds the label for one change: a rewrite, or an autofix the reviewer labeled. */
export function reviewFor(overlay: ReviewOverlay | undefined, path: string, change: BlockChange): CardReview | undefined {
  if (!overlay || (change.kind !== "rewrite" && change.kind !== "autofix")) return undefined;
  const entry = labelEntry(overlay, path, change);
  if (!entry) return undefined;
  const label = String(entry.label ?? "");
  return { label, note: String(entry.note ?? ""), reviewer: String(overlay.reviewer ?? ""), tone: labelTone(label) };
}

export interface ReviewerTally {
  reviewer: string;
  /** Labels per kind, for the labels that match a rewrite in this sweep. */
  counts: Record<string, number>;
  reviewed: number;
  wouldReject: number;
  /** Labels whose key matches no rewrite in this sweep. */
  unmatched: number;
}

export function reviewerTally(overlay: ReviewOverlay, result: SweepResult): ReviewerTally {
  const rewrites = new Set(
    result.pages.flatMap((page) => page.changes.filter((c) => c.kind === "rewrite").map((c) => `${page.path}#${c.blockId}`)),
  );
  const counts: Record<string, number> = Object.fromEntries(REVIEW_LABELS.map((label) => [label, 0]));
  const tally = { reviewer: String(overlay.reviewer ?? ""), counts, reviewed: 0, wouldReject: 0, unmatched: 0 };
  for (const [key, entry] of Object.entries(overlay.labels ?? {})) {
    // Autofix labels show on their cards. The tally counts rewrites, the changes a person reviews.
    if (entry?.kind === "autofix" || key.endsWith("@autofix")) continue;
    if (!rewrites.has(key)) {
      tally.unmatched++;
      continue;
    }
    const label = String(entry?.label ?? "");
    tally.reviewed++;
    counts[label] = (counts[label] ?? 0) + 1;
    if (REJECTS.has(label)) tally.wouldReject++;
  }
  return tally;
}

/**
 * Markdown-ish text as HTML: blank lines split paragraphs, "- " or "* " lines become bullets,
 * `code` and **bold** render. Everything is escaped first.
 */
export function summaryHtml(text: string): string {
  let html = "";
  let paragraph: string[] = [];
  let bullets: string[] = [];
  const inline = (line: string) => prose(line).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const flush = () => {
    if (paragraph.length) html += `<p>${inline(paragraph.join(" "))}</p>`;
    if (bullets.length) html += `<ul>${bullets.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`;
    paragraph = [];
    bullets = [];
  };
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (bullet) {
      if (paragraph.length) flush();
      bullets.push(bullet[1]!);
    } else {
      if (bullets.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return html;
}

/** The second-opinion block in panel A. */
export function reviewerBlock(overlay: ReviewOverlay, tally: ReviewerTally, limit: number): string {
  const rate = tally.reviewed ? tally.wouldReject / tally.reviewed : 0;
  const tone = !tally.reviewed ? "muted" : rate > limit ? "bad-c" : "ok-c";
  const counts = Object.entries(tally.counts)
    .map(([label, n]) => `<li class="rv-${labelTone(label)}">${esc(label)} <b>${n}</b></li>`)
    .join("");
  const unmatched = tally.unmatched
    ? `<p class="muted">${plural(tally.unmatched, "label")} matched no rewrite in this sweep.</p>`
    : "";
  return (
    '<div class="reviewer">' +
    `<div class="rv-head"><b>Second opinion: ${esc(tally.reviewer || "reviewer")}</b><span class="muted">${plural(tally.reviewed, "rewrite")} labeled</span></div>` +
    `<div class="rv-row"><div class="rv-big ${tone}" data-stat="would-reject">would reject ${tally.wouldReject} of ${tally.reviewed}` +
    `${tally.reviewed ? ` (${pct(rate)}%)` : ""}</div><ul class="rv-counts">${counts}</ul></div>` +
    `<div class="rv-summary">${summaryHtml(overlay.summary)}</div>${unmatched}` +
    "</div>"
  );
}
