/**
 * The A-B report: one self-contained HTML page that helps the owner decide whether a full
 * rewrite pass over the docs is a good change. It leads with the verdict (A), tracks the
 * owner's own review (B), counts findings by rule (C), shows every before-and-after diff with
 * its guardrail results (D), samples each rule's findings (E), lists every page (F), and
 * records the run (G).
 *
 * Pure: the same SweepResult renders the same bytes. Inline CSS and JS; only the IBM Plex
 * fonts load from Google Fonts.
 */
import { thresholds } from "../profile";
import type { SweepResult } from "../types";
import { CLIENT_JS, CSS } from "./assets";
import { esc, fmtDuration, fmtStamp, jsonForScript, plural } from "./html";
import { headline, reviewPages, ruleExamples, ruleRows, summarize } from "./model";
import { panelPages, reviewKeys } from "./panel-pages";
import { hud, panelAllPages, panelExamples, panelRules, panelRun, panelTally, panelVerdict } from "./panels";
import { reviewFor, reviewerBlock, reviewerTally, type ReviewOverlay } from "./review";

export type { ReviewLabel, ReviewOverlay } from "./review";

export interface ReportOptions {
  /** The page title. Default: "STE style sweep: A-B report". */
  title?: string;
  /** An independent reviewer's label for each accepted rewrite. Adds badges, a tally in A, and a filter in D. */
  review?: ReviewOverlay;
}

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">';

const RULER = `<div class="ruler-x">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<span>${n}</span>`).join("")}</div>`;

export function renderReport(result: SweepResult, options: ReportOptions = {}): string {
  const title = options.title?.trim() || "STE style sweep: A-B report";
  const limit = thresholds.rewriteRejectLimit;
  const summary = summarize(result);
  const rules = ruleRows(result);
  const overlay = options.review;
  const pages = reviewPages(result, (path, change) => reviewFor(overlay, path, change)?.tone === "flagged");
  const keys = reviewKeys(pages);
  const inReview = new Set(pages.map((p) => p.index));
  const href = (pageIndex: number) => (inReview.has(pageIndex) ? `#p-${pageIndex}` : `#f-${pageIndex}`);
  const ms = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
  // The export needs the exact before and after of each rewrite the owner can decide on.
  const texts = Object.fromEntries([...keys].map(([change, key]) => [key, [change.before, change.after]]));
  const config = { startedAt: result.startedAt, limit, storageKey: `docs-style-review|${result.startedAt}`, texts };
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    FONTS,
    `<style>${CSS}</style>`,
    "</head>",
    "<body>",
    hud(title, keys.size, limit),
    '<div class="sheet">',
    RULER,
    '<div class="frame">',
    `<div class="titlebar"><h1>${esc(title)}</h1><span class="meta">sweep ${esc(fmtStamp(result.startedAt))} · ${fmtDuration(ms)} · ${plural(summary.pages, "page")}</span></div>`,
    '<div class="grid">',
    panelVerdict(summary, headline(summary), overlay ? reviewerBlock(overlay, reviewerTally(overlay, result), limit) : ""),
    panelTally(keys.size, limit, summary.rewrites.unchanged),
    panelRules(rules),
    panelPages(pages, rules, keys, overlay),
    panelExamples(rules, ruleExamples(result), href),
    panelAllPages(result, inReview),
    panelRun(result, title),
    "</div>",
    "</div>",
    RULER,
    "</div>",
    `<script type="application/json" id="report-config">${jsonForScript(config)}</script>`,
    `<script>${CLIENT_JS}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
