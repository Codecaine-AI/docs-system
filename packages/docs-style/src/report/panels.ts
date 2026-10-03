/**
 * The report panels other than D: A verdict, B review tally (and the sticky bar that mirrors
 * it), C findings by rule, E rule examples, F all pages, G run details. Each function returns
 * one panel as an HTML string.
 */
import type { SweepResult } from "../types";
import { esc, fmtDuration, fmtInt, fmtStamp, pct, plural, prose, relativeChange, signedPct } from "./html";
import { countChanges, layerCounts, stands, type Example, type RuleRow, type Summary } from "./model";

/** A sweep number as a finite number. The CLI reads sweep JSON unvalidated, so never trust the type. */
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** What the deep tiers did, from the run config rather than the deep flag. */
function deepTiers(s: Summary): string {
  const judge = s.judgeError ? "Tier 2 stopped" : s.tiers.judge ? "Tier 2 ran" : "Tier 2 off";
  const rewriter = s.tiers.rewriter ? "Tier 3 ran" : "Tier 3 off";
  return `${judge}, ${rewriter}`;
}

function panel(letter: string, title: string, meta: string, body: string, opts: { span: number; foot?: string; flush?: boolean }): string {
  return (
    `<section class="panel span-${opts.span}" id="${letter}">` +
    `<header><div class="tag">${letter}</div><h2>${title}</h2>${meta ? `<div class="meta">${meta}</div>` : ""}</header>` +
    `<div class="body${opts.flush ? " flush" : ""}">${body}</div>` +
    (opts.foot ? `<div class="foot">${opts.foot}</div>` : "") +
    "</section>"
  );
}

/** Blue when a count fell, red when it rose, plain when it held. */
function trend(before: number, after: number): string {
  const change = relativeChange(before, after);
  const cls = after < before ? "ok-c" : after > before ? "bad-c" : "muted";
  const text = change === undefined ? (after > 0 ? "new" : "–") : signedPct(change);
  return `<span class="${cls}">${text}</span>`;
}

function tile(stat: string, label: string, big: string, sub: string): string {
  return `<div class="tile" data-stat="${stat}"><label>${label}</label><div class="big">${big}</div><div class="sub">${sub}</div></div>`;
}

// ---------------------------------------------------------------------------------------------
// A. Verdict at a glance
// ---------------------------------------------------------------------------------------------

/** `reviewer` is the second-opinion block from review.ts, when an overlay was given. */
export function panelVerdict(s: Summary, headlineText: string, reviewer = ""): string {
  const { accepted, rejected, error, total } = s.rewrites;
  const noDeep = s.deepPages === 0;
  const arrow = "<small> → </small>";
  const tiles = [
    tile("pages", "Pages scanned", fmtInt(s.pages), `${fmtInt(s.deepPages)} deep: ${deepTiers(s)}`),
    tile(
      "findings",
      "Findings caught",
      fmtInt(s.findings),
      `Tier 1 ${fmtInt(s.tier1)} · Tier 2 ${fmtInt(s.tier2)}${s.overruled ? ` · ${fmtInt(s.overruled)} overruled by Jev` : ""}`,
    ),
    tile("autofixes", "Autofixes applied", fmtInt(s.autofixes), "safe swaps, no review needed"),
    tile(
      "rewrites",
      "Rewrites",
      `<span class="ok-c">${fmtInt(accepted)}</span><small> / </small><span class="bad-c">${fmtInt(rejected)}</span><small> / </small><span class="err-c">${fmtInt(error)}</span>`,
      `accepted / rejected / error${total ? ` · ${pct(accepted / total)}% passed` : ""}` +
        (s.rewrites.needsReview ? ` · <span class="warn-c">${fmtInt(s.rewrites.needsReview)} ${s.rewrites.needsReview === 1 ? "needs" : "need"} review</span>` : "") +
        (s.rewrites.unchanged ? ` · ${fmtInt(s.rewrites.unchanged)} unchanged` : ""),
    ),
    tile(
      "words",
      "Words on deep pages",
      noDeep ? "–" : `${fmtInt(s.deepWords.before)}${arrow}${fmtInt(s.deepWords.after)}`,
      noDeep ? "no deep pages" : `${signedPct(relativeChange(s.deepWords.before, s.deepWords.after))} words`,
    ),
    tile(
      "deep-findings",
      "Tier 1 findings on deep pages",
      noDeep ? "–" : `${fmtInt(s.deepFindings.before)}${arrow}${fmtInt(s.deepFindings.after)}`,
      noDeep
        ? "no deep pages"
        : `${trend(s.deepFindings.before, s.deepFindings.after)} · structure ${s.deepStructure.before} → ${s.deepStructure.after} · vocabulary ${s.deepVocabulary.before} → ${s.deepVocabulary.after}`,
    ),
  ];
  const next =
    accepted > 0
      ? `<b>Next:</b> review the ${plural(accepted, "accepted rewrite")} in panel D. Reject any rewrite that changes meaning. <button type="button" class="btn primary" data-act="next">Start review</button>`
      : rejected > 0
        ? "<b>Next:</b> open the rejected rewrites in panel D. Check that each guardrail caught a real problem."
        : "<b>Next:</b> nothing in this sweep needs a decision.";
  const banner = s.judgeError
    ? `<p class="banner warn" role="alert">Jev was unavailable: ${esc(s.judgeError)}. Tier 2 and fact checks were skipped; accepted rewrites need review.</p>`
    : "";
  const body = `${banner}<p class="headline" data-headline>${esc(headlineText)}</p><p class="next">${next}</p><div class="tiles">${tiles.join("")}</div>${reviewer}`;
  return panel("A", "Verdict at a glance", `${plural(s.pages, "page")} · ${fmtInt(s.deepPages)} deep`, body, {
    span: 8,
    foot: "Deep numbers compare each deep page before and after its accepted changes. They count Tier 1 matches as linted, including the ones Jev overruled, because Jev does not judge the page again after a rewrite.",
  });
}

// ---------------------------------------------------------------------------------------------
// B. Your review tally, and the sticky bar that mirrors it
// ---------------------------------------------------------------------------------------------

function statePill(limit: number, short: boolean): string {
  const l = `${pct(limit)}%`;
  const texts = short
    ? { idle: "no decisions", good: `under ${l}`, over: `over ${l}` }
    : { idle: "No decisions yet", good: `Under the ${l} limit`, over: `Over the ${l} limit: tighten the guardrails` };
  return `<span class="pill idle" data-t="state" data-idle="${esc(texts.idle)}" data-good="${esc(texts.good)}" data-over="${esc(texts.over)}">${esc(texts.idle)}</span>`;
}

export function panelTally(total: number, limit: number, unchanged = 0): string {
  const l = `${pct(limit)}%`;
  const same = unchanged
    ? `<p class="hint">${plural(unchanged, "block")} came back unchanged. They need no decision and stay out of these counts.</p>`
    : "";
  if (total === 0) {
    return panel("B", "Your review tally", "saved in this browser", `<p class="muted">No accepted rewrites to review in this sweep.</p>${same}`, {
      span: 4,
    });
  }
  const body =
    `<div class="tally-big"><span data-t="reviewed">0</span><small> of </small><span data-t="total">${fmtInt(total)}</span><small> reviewed</small></div>` +
    '<div class="prog"><i data-t="bar"></i></div>' +
    '<dl class="tally">' +
    '<div><dt>Rejected by you</dt><dd data-t="rejected">0</dd></div>' +
    `<div><dt>Rejection rate</dt><dd><span data-t="rate">–</span> <small>limit ${l}</small></dd></div>` +
    "</dl>" +
    `<p>${statePill(limit, false)}</p>` +
    '<div class="actions"><button type="button" class="btn primary" data-act="next">Next unreviewed</button>' +
    '<button type="button" class="btn" data-act="export">Export decisions</button></div>' +
    '<p class="hint">Keys: <kbd>n</kbd> next · <kbd>a</kbd> accept and go to next · <kbd>r</kbd> reject, then type why and press <kbd>Enter</kbd></p>' +
    '<p class="msg" data-t="msg" role="status"></p>' +
    same;
  return panel("B", "Your review tally", "saved in this browser", body, {
    span: 4,
    foot: `If you reject more than ${l} of the rewrites that passed the guardrails, tighten the guardrails before a full pass.`,
  });
}

export function hud(title: string, total: number, limit: number): string {
  const review =
    total > 0
      ? `<span>Reviewed <b data-t="reviewed">0</b>/<span data-t="total">${fmtInt(total)}</span></span>` +
        '<span class="prog small"><i data-t="bar"></i></span>' +
        '<span>Rejected <b data-t="rejected">0</b> (<span data-t="rate">–</span>)</span>' +
        statePill(limit, true)
      : '<span class="muted">nothing to review</span>';
  const actions =
    total > 0
      ? '<button type="button" class="btn primary" data-act="next">Next unreviewed</button><button type="button" class="btn" data-act="export">Export</button>'
      : "";
  return (
    `<div class="hud"><b class="t">${esc(title)}</b>${review}` +
    '<span class="hud-filter" hidden>rule <code data-t="rule"></code> <button type="button" class="link" data-act="clear-rule" aria-label="Clear the rule filter">×</button></span>' +
    `<span class="sp"></span>${actions}</div>`
  );
}

// ---------------------------------------------------------------------------------------------
// C. Findings by rule
// ---------------------------------------------------------------------------------------------

export function panelRules(rows: readonly RuleRow[]): string {
  if (!rows.length) return panel("C", "Findings by rule", "", '<p class="muted">No findings.</p>', { span: 12 });
  const max = Math.max(...rows.map((r) => r.findings), 1);
  const body = rows
    .map((r) => {
      const { before, after } = r.deep;
      const change = relativeChange(before, after);
      const deep =
        before === 0 && after === 0
          ? `<td class="num" data-v="9">${r.deepTier2 ? `<span class="muted">${fmtInt(r.deepTier2)} judged, not rechecked</span>` : "–"}</td>`
          : `<td class="num" data-v="${change ?? 9}">${fmtInt(before)} → ${fmtInt(after)} ${trend(before, after)}</td>`;
      const width = Math.max(2, Math.round((r.findings / max) * 100));
      return (
        `<tr data-rule="${esc(r.ruleId)}" title="${esc(r.hint)}">` +
        `<td><button type="button" class="rule-pick">${esc(r.ruleId)}</button></td>` +
        `<td>${esc(r.source)}</td><td>${esc(r.layer)}</td><td class="num">${esc(r.tiers)}</td>` +
        `<td class="num bar-cell" data-v="${r.findings}"><span class="bar"><i class="${r.layer === "vocabulary" ? "voc" : "str"}" style="width:${width}%"></i></span>${fmtInt(r.findings)}${
          r.overruled ? ` <span class="muted">+${fmtInt(r.overruled)} overruled</span>` : ""
        }</td>` +
        `<td class="num">${fmtInt(r.pages)}</td>` +
        `<td class="num" data-v="${r.autofixable}">${r.autofixable ? fmtInt(r.autofixable) : "–"}</td>` +
        deep +
        "</tr>"
      );
    })
    .join("");
  const table =
    '<table class="sortable rules"><thead><tr>' +
    '<th data-sort>Rule</th><th data-sort>Source</th><th data-sort>Layer</th><th data-sort class="num">Tier</th>' +
    '<th data-sort class="num">Findings</th><th data-sort class="num">Pages</th><th data-sort class="num">Autofixable</th>' +
    '<th data-sort data-first="asc" class="num">Deep pages: before → after</th>' +
    `</tr></thead><tbody>${body}</tbody></table>`;
  return panel("C", "Findings by rule", "click a rule to filter D and E · click a column to sort", table, {
    span: 12,
    flush: true,
    foot: "Bar: findings on every page. Dark bars are structure rules, which can trigger a rewrite. Grey bars are vocabulary rules, which only advise. Overruled: Tier 1 matches that Jev judged no problem. They do not count as findings.",
  });
}

// ---------------------------------------------------------------------------------------------
// E. Rule examples
// ---------------------------------------------------------------------------------------------

/** Clips long text to about `max` characters around the evidence, so each example stays one glance. */
function clip(text: string, evidence: string, max = 320): { text: string; at: number } {
  let at = evidence ? text.indexOf(evidence) : -1;
  if (at < 0 && evidence) at = text.toLowerCase().indexOf(evidence.toLowerCase());
  if (text.length <= max) return { text, at };
  const from = Math.max(0, Math.min(at < 0 ? 0 : at - 80, text.length - max));
  const clipped = `${from > 0 ? "…" : ""}${text.slice(from, from + max)}${from + max < text.length ? "…" : ""}`;
  return { text: clipped, at: at < 0 ? -1 : at - from + (from > 0 ? 1 : 0) };
}

function exampleText(example: Example): string {
  const evidence = example.evidence.trim();
  const { text, at } = clip(example.text, evidence);
  if (at < 0 || !evidence || evidence === text) return prose(text);
  const end = Math.min(text.length, at + evidence.length);
  return `${prose(text.slice(0, at))}<mark>${prose(text.slice(at, end))}</mark>${prose(text.slice(end))}`;
}

export function panelExamples(rows: readonly RuleRow[], examples: ReadonlyMap<string, Example[]>, href: (pageIndex: number) => string): string {
  const blocks = rows
    .map((r) => {
      const list = examples.get(r.ruleId) ?? [];
      const items = list
        .map((e) => {
          const prob = typeof e.probability === "number" && Number.isFinite(e.probability) ? ` · <span class="prob">P ${e.probability.toFixed(2)}</span>` : "";
          return `<li><div class="s">${exampleText(e)}</div><div class="where"><a href="${href(e.pageIndex)}">${esc(e.path)}</a> · ${esc(e.message)}${prob}</div></li>`;
        })
        .join("");
      return (
        `<div class="ex-rule" data-rule="${esc(r.ruleId)}">` +
        `<h3><code>${esc(r.ruleId)}</code><span class="meta">${esc(r.layer)} · tier ${esc(r.tiers)} · ${plural(r.findings, "finding")}</span></h3>` +
        (r.hint ? `<p class="hint">${prose(r.hint)}</p>` : "") +
        `<ol class="samples">${items || '<li class="muted">No findings before the changes.</li>'}</ol></div>`
      );
    })
    .join("");
  return panel("E", "Rule examples", "up to 5 findings per rule, from different pages where possible", `<div class="examples">${blocks || '<p class="muted">No findings.</p>'}</div>`, {
    span: 12,
    foot: "Judge false positives here. If most examples of a rule read fine, that rule needs a narrower detect or a higher Tier 2 threshold.",
  });
}

// ---------------------------------------------------------------------------------------------
// F. All pages
// ---------------------------------------------------------------------------------------------

export function panelAllPages(result: SweepResult, inReview: ReadonlySet<number>): string {
  const rows = result.pages
    .map((page, i) => {
      const layers = layerCounts(page.findings.filter(stands));
      const c = countChanges(page.changes);
      const breakdown = [
        c.autofix && `${c.autofix} auto`,
        c.accepted && `${c.accepted} ok`,
        c.rejected && `${c.rejected} rej`,
        c.error && `${c.error} err`,
        c.unchanged && `${c.unchanged} same`,
      ].filter(Boolean);
      const words =
        page.wordsAfter !== page.stats.words && (page.deep || c.total > 0)
          ? `${fmtInt(page.stats.words)} → ${fmtInt(page.wordsAfter)}`
          : fmtInt(page.stats.words);
      const shown = esc(page.path).replace(/\//g, "/<wbr>");
      const path = inReview.has(i) ? `<a href="#p-${i}">${shown}</a>` : shown;
      return (
        `<tr id="f-${i}">` +
        `<td class="path" title="${esc(page.title)}">${path}</td>` +
        `<td class="num">${fmtInt(page.stats.sentences)}</td>` +
        `<td class="num" data-v="${num(page.stats.words)}">${words}</td>` +
        `<td class="num">${fmtInt(layers.structure)}</td>` +
        `<td class="num">${fmtInt(layers.vocabulary)}</td>` +
        `<td class="num" data-v="${page.deep ? 1 : 0}">${page.deep ? "✓" : "–"}</td>` +
        `<td class="num" data-v="${c.total}">${fmtInt(c.total)}${breakdown.length ? ` <span class="muted">${breakdown.join(" · ")}</span>` : ""}</td>` +
        "</tr>"
      );
    })
    .join("");
  const table =
    '<table class="sortable pages"><thead><tr>' +
    '<th data-sort>Path</th><th data-sort class="num">Sentences</th><th data-sort class="num">Words</th>' +
    '<th data-sort class="num">Structure</th><th data-sort class="num">Vocabulary</th><th data-sort class="num">Deep</th><th data-sort class="num">Changes</th>' +
    `</tr></thead><tbody>${rows}</tbody></table>`;
  return panel("F", "All pages", `${plural(result.pages.length, "page")} · click a column to sort`, table, {
    span: 8,
    flush: true,
    foot: "Structure and Vocabulary count the findings on each page before any change, from Tier 1 and Tier 2, without the matches Jev overruled.",
  });
}

// ---------------------------------------------------------------------------------------------
// G. Run details
// ---------------------------------------------------------------------------------------------

export function panelRun(result: SweepResult, title: string): string {
  const { config } = result;
  const ms = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
  const attemptModels = result.pages.flatMap((p) => p.changes.flatMap((c) => (c.attempts ?? []).map((a) => a.model)));
  const models = [...new Set([...config.models, ...attemptModels])].filter(Boolean);
  const onOff = (on: boolean) => (on ? '<span class="ok-c">on</span>' : '<span class="muted">off</span>');
  const judge = config.judgeError ? '<span class="warn-c">down mid-run</span>' : onOff(config.judge);
  const judgeError = config.judgeError
    ? `<div class="row one"><div><label>Judge error</label><span class="warn-c">${esc(config.judgeError)}</span></div></div>`
    : "";
  const deep = config.deepPages.length
    ? `<ul class="deep-list">${config.deepPages.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
    : '<span class="muted">none</span>';
  const body =
    '<div class="titleblock">' +
    `<div class="t"><label>Title</label><b>${esc(title)}</b></div>` +
    `<div class="row"><div><label>Started</label>${esc(fmtStamp(result.startedAt))}</div><div><label>Finished</label>${esc(fmtStamp(result.finishedAt))}</div></div>` +
    `<div class="row"><div><label>Duration</label>${fmtDuration(ms)}</div><div><label>Pages</label>${fmtInt(result.pages.length)} scanned · ${fmtInt(config.deepPages.length)} deep</div></div>` +
    `<div class="row"><div><label>Judge (Tier 2)</label>${judge}</div><div><label>Rewriter (Tier 3)</label>${onOff(config.rewriter)}</div></div>` +
    judgeError +
    `<div class="row one"><div><label>Models</label>${models.length ? models.map((m) => `<code>${esc(m)}</code>`).join(" ") : '<span class="muted">none</span>'}</div></div>` +
    `<div class="row one"><div><label>Deep pages</label>${deep}</div></div>` +
    "</div>";
  return panel("G", "Run details", "", body, { span: 4, flush: true });
}
