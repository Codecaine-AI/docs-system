/**
 * Panel D: before and after by page. It opens with the pages to look at first, then the
 * filters, then one collapsible section per page with a card for each change. Within a page,
 * accepted rewrites come first because they need a decision (flagged ones before the rest), and
 * autofixes sit in one closed group because they need none.
 */
import type { BlockChange } from "../types";
import { CHECKS, renderCard } from "./cards";
import { esc, fmtInt, plural, relativeChange, signedPct } from "./html";
import { isReviewable, lookFirst, needsReview, type ReviewPage, type RuleRow } from "./model";
import { reviewFor, type ReviewOverlay } from "./review";

/** Gives each accepted rewrite a stable review key: page + block, with a suffix for repeats. */
export function reviewKeys(pages: readonly ReviewPage[]): Map<BlockChange, string> {
  const keys = new Map<BlockChange, string>();
  const seen = new Map<string, number>();
  for (const { page } of pages) {
    for (const change of page.changes) {
      if (!isReviewable(change)) continue;
      const base = `${page.path}|${change.blockId}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      keys.set(change, n === 1 ? base : `${base}|${n}`);
    }
  }
  return keys;
}

const ORDER: Record<string, number> = { accepted: 0, rejected: 1, error: 2, unchanged: 3 };

function pageSection(r: ReviewPage, keys: ReadonlyMap<BlockChange, string>, open: boolean, overlay: ReviewOverlay | undefined): string {
  const { page, counts } = r;
  const cardId = (change: BlockChange) => `c-${r.index}-${page.changes.indexOf(change)}`;
  const rewrites = page.changes
    .filter((c) => c.kind === "rewrite")
    .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || Number(needsReview(b)) - Number(needsReview(a)));
  const autofixes = page.changes.filter((c) => c.kind === "autofix");
  const cards = rewrites
    .map((c) => renderCard(c, { id: cardId(c), path: page.path, key: keys.get(c), review: reviewFor(overlay, page.path, c) }))
    .join("");
  const fixes = autofixes.length
    ? `<details class="autofixes"><summary>${plural(autofixes.length, "autofix", "autofixes")}, applied with no review</summary>${autofixes
        .map((c) => renderCard(c, { id: cardId(c), path: page.path }))
        .join("")}</details>`
    : "";
  const empty = page.changes.length ? "" : '<p class="muted empty">No changes on this page.</p>';

  const findingsTrend = trendText(r.findings.before, r.findings.after, true);
  const wordsTrend = trendText(r.words.before, r.words.after, false);
  const breakdown = [
    counts.autofix && plural(counts.autofix, "autofix", "autofixes"),
    counts.accepted && `<span class="ok-c">${counts.accepted} accepted</span>`,
    counts.needsReview && `<span class="warn-c">${counts.needsReview} ${counts.needsReview === 1 ? "needs" : "need"} review</span>`,
    counts.rejected && `<span class="bad-c">${counts.rejected} rejected</span>`,
    counts.error && `<span class="err-c">${plural(counts.error, "error")}</span>`,
    counts.unchanged && `<span class="err-c">${counts.unchanged} unchanged</span>`,
  ].filter(Boolean);
  const progress = counts.accepted ? `<span class="pprog" data-page-progress>0/${counts.accepted} reviewed</span>` : "";
  const tier = page.deep ? "" : '<span class="b err">Tier 1 only</span>';
  const search = `${page.path} ${page.title}`.toLowerCase();
  return (
    `<details class="page" id="p-${r.index}" data-search="${esc(search)}"${open ? " open" : ""}>` +
    "<summary>" +
    `<span class="ttl"><b>${esc(page.title || page.path)}</b> <code>${esc(page.path)}</code> ${tier}</span>${progress}` +
    '<span class="stats">' +
    `<span>findings <b>${fmtInt(r.findings.before)} → ${fmtInt(r.findings.after)}</b> ${findingsTrend}${r.tier2 ? ` <span class="muted">+${r.tier2} judged</span>` : ""}</span>` +
    `<span>words <b>${fmtInt(r.words.before)} → ${fmtInt(r.words.after)}</b> ${wordsTrend}</span>` +
    `<span>${breakdown.length ? breakdown.join(" · ") : "no changes"}</span>` +
    "</span></summary>" +
    `<div class="cards">${cards}${fixes}${empty}</div></details>`
  );
}

/** Findings that fell read blue and rose read red. Words stay neutral: shorter is not always better. */
function trendText(before: number, after: number, colored: boolean): string {
  const change = relativeChange(before, after);
  if (change === undefined) return "";
  const cls = !colored || after === before ? "muted" : after < before ? "ok-c" : "bad-c";
  return `<span class="${cls}">${signedPct(change)}</span>`;
}

function firstList(pages: readonly ReviewPage[]): string {
  const first = lookFirst(pages);
  if (!first.length) return '<div class="first"><h3>Pages to look at first</h3><p class="muted">No page needs a look.</p></div>';
  const items = first
    .map(
      (r) =>
        `<li><a href="#p-${r.index}"><b>${esc(r.page.title || r.page.path)}</b> <code>${esc(r.page.path)}</code></a>` +
        `<span class="why">${esc(r.reasons.join(" · "))}</span></li>`,
    )
    .join("");
  return `<div class="first"><h3>Pages to look at first</h3><ol>${items}</ol></div>`;
}

/** One line per guardrail, in the order every card lists them. */
function legend(): string {
  const items = CHECKS.map((c) => `<div><code>${esc(c.id)}</code>${esc(c.explain)}</div>`).join("");
  return `<div class="legend"><h3>Guardrails, in check order</h3>${items}</div>`;
}

function filters(pages: readonly ReviewPage[], rules: readonly RuleRow[], overlay: ReviewOverlay | undefined): string {
  const total = (pick: (r: ReviewPage) => number) => pages.reduce((n, r) => n + pick(r), 0);
  const chips: [string, string, string][] = [
    ["all", "all", fmtInt(total((r) => r.counts.total))],
    ["review", "to review", `<span data-t="left">${fmtInt(total((r) => r.counts.accepted))}</span>`],
    ["accepted", "accepted", fmtInt(total((r) => r.counts.accepted))],
    ["rejected", "rejected", fmtInt(total((r) => r.counts.rejected))],
    ["error", "error", fmtInt(total((r) => r.counts.error))],
    ["autofix", "autofix", fmtInt(total((r) => r.counts.autofix))],
  ];
  const flagged = total((r) => r.counts.needsReview);
  if (flagged > 0) chips.splice(3, 0, ["needs-review", "needs review", fmtInt(flagged)]);
  const unchanged = total((r) => r.counts.unchanged);
  if (unchanged > 0) chips.push(["unchanged", "unchanged", fmtInt(unchanged)]);
  if (overlay) {
    const flaggedByReviewer = total((r) => r.page.changes.filter((c) => reviewFor(overlay, r.page.path, c)?.tone === "flagged").length);
    chips.push(["rv-flagged", "reviewer: flagged", fmtInt(flaggedByReviewer)]);
  }
  const ruleIds = [...new Set([...rules.map((r) => r.ruleId), ...pages.flatMap((r) => r.page.changes.flatMap((c) => c.ruleIds))])].sort();
  return (
    '<div class="filters">' +
    `<span class="chips" role="group" aria-label="Status">${chips
      .map(([v, label, n]) => `<button type="button" class="chip${v === "all" ? " on" : ""}" data-status="${v}">${label} <span class="cn">${n}</span></button>`)
      .join("")}</span>` +
    `<select class="f-rule" aria-label="Rule"><option value="">all rules</option>${ruleIds
      .map((id) => `<option value="${esc(id)}">${esc(id)}</option>`)
      .join("")}</select>` +
    '<input class="f-q" type="search" placeholder="Search pages" aria-label="Search pages">' +
    '<button type="button" class="link" data-act="expand">expand all</button>' +
    '<button type="button" class="link" data-act="collapse">collapse all</button>' +
    '<span class="showing" data-t="showing"></span>' +
    "</div>"
  );
}

export function panelPages(
  pages: readonly ReviewPage[],
  rules: readonly RuleRow[],
  keys: ReadonlyMap<BlockChange, string>,
  overlay?: ReviewOverlay,
): string {
  const changes = pages.reduce((n, r) => n + r.counts.total, 0);
  const sections = pages.map((r, i) => pageSection(r, keys, i === 0, overlay)).join("");
  const body = pages.length
    ? `${firstList(pages)}${legend()}${filters(pages, rules, overlay)}<div class="pages">${sections}</div>`
    : '<p class="muted">No deep pages and no changes in this sweep.</p>';
  return (
    '<section class="panel span-12" id="D">' +
    `<header><div class="tag">D</div><h2>Before / after by page</h2><div class="meta">${plural(changes, "change")} on ${plural(pages.length, "page")} · most accepted rewrites first</div></header>` +
    `<div class="body">${body}</div>` +
    '<div class="foot">Red strikethrough: removed words. Green: added words. Accept or reject each rewrite that passed the guardrails. Rejected and error cards start closed. Open them to check what the guardrails caught.</div>' +
    "</section>"
  );
}
