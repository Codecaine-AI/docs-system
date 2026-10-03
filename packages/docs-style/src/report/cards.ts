/**
 * One card per BlockChange: badges, the word diff, a side-by-side view, the guardrail checklist,
 * and the attempts. Accepted rewrites get the owner's Accept and Reject buttons. Rejected and
 * error cards start collapsed.
 */
import type { BlockChange, GuardrailId, GuardrailResult } from "../types";
import { countWords } from "./diff";
import { diffHtml, textHtml } from "./diff-html";
import { esc, fmtMs } from "./html";
import { isReviewable, isStructural, needsReview } from "./model";
import type { CardReview } from "./review";

export interface CardContext {
  /** The element id, unique in the report. */
  id: string;
  path: string;
  /** The review key, set only for accepted rewrites. */
  key?: string;
  /** The independent reviewer's label, when an overlay has one for this change. */
  review?: CardReview;
}

/** Every guardrail in pipeline order, with the one line the legend shows for it. */
export const CHECKS: readonly { id: GuardrailId; explain: string }[] = [
  { id: "tokens", explain: "code spans and links come back exactly." },
  { id: "fact-ledger", explain: "every number, name, path, term, and quote survives." },
  { id: "content-coverage", explain: "every content word of the original survives." },
  { id: "meaning-words", explain: "not/only/must/if/unless/except/all/none keep their count." },
  { id: "shrink-limit", explain: "at most 20% of content words removed." },
  { id: "smallest-edit", explain: "unflagged sentences unchanged." },
  { id: "fixes-target", explain: "at least one targeted finding fixed." },
  { id: "no-new-findings", explain: "no rule fires more often." },
  { id: "slop", explain: "no new slop words, em dashes, or semicolons." },
  { id: "list-integrity", explain: "no semicolon became \", and\", and no list gained or lost an item." },
  { id: "sentence-shape", explain: "no And/So/But/Or openers, lowercase starts, or How/Why fragments." },
  { id: "split-integrity", explain: "a split keeps its closing colon, citation, scope, and identifier case, with no repeated subject." },
  { id: "fact-check", explain: "Jev confirms no dropped fact and no added claim." },
  { id: "meaning-equivalence", explain: "Sol confirms the change says exactly what the original says." },
];

const CHECK_RANK = new Map<string, number>(CHECKS.map((c, i) => [c.id, i]));

/** The checks in pipeline order. An unknown check keeps its place after the known ones. */
function ordered(checks: readonly GuardrailResult[]): GuardrailResult[] {
  const rank = (c: GuardrailResult) => CHECK_RANK.get(c.id) ?? CHECKS.length;
  return checks.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map(({ c }) => c);
}

/** Class-safe token: letters, digits, and dashes only. */
const token = (value: string) => value.replace(/[^A-Za-z0-9-]/g, "");

export function renderCard(change: BlockChange, ctx: CardContext): string {
  const reviewable = isReviewable(change) && ctx.key !== undefined;
  const collapsed = change.kind === "rewrite" && change.status !== "accepted";
  const classes = ["card", `k-${token(change.kind)}`, `s-${token(change.status)}`];
  if (isStructural(change)) classes.push("structural");
  if (needsReview(change)) classes.push("needs-review");
  const attrs = [
    `class="${classes.join(" ")}"`,
    `id="${esc(ctx.id)}"`,
    `data-kind="${esc(change.kind)}"`,
    `data-status="${esc(change.status)}"`,
    `data-rules="${esc(change.ruleIds.join(" "))}"`,
    `data-page="${esc(ctx.path)}"`,
    `data-block="${esc(change.blockId)}"`,
  ];
  if (reviewable) attrs.push(`data-key="${esc(ctx.key)}"`, `data-model="${esc(finalModel(change))}"`);
  if (ctx.review) attrs.push(`data-rv="${ctx.review.tone}"`, `data-rv-label="${esc(ctx.review.label)}"`);
  const head = header(change, reviewable, ctx.review);
  const body = `<div class="card-b">${reason(change)}${reviewNote(ctx.review)}${view(change)}${checks(change)}${attempts(change)}${
    reviewable ? '<input class="note" type="text" placeholder="Why reject? Optional. The export keeps it." hidden>' : ""
  }</div>`;
  return collapsed
    ? `<details ${attrs.join(" ")}><summary class="card-h">${head}</summary>${body}</details>`
    : `<article ${attrs.join(" ")}><header class="card-h">${head}</header>${body}</article>`;
}

function header(change: BlockChange, reviewable: boolean, review: CardReview | undefined): string {
  const parts = [`<span class="b kind">${esc(change.kind)}</span>`];
  if (isStructural(change)) parts.push('<span class="b kind">list</span>');
  parts.push(statusBadges(change));
  if (review) parts.push(`<span class="b rv-${review.tone}" title="${esc(review.note)}">reviewer: ${esc(review.label)}</span>`);
  parts.push(...change.ruleIds.map((id) => `<span class="rid">${esc(id)}</span>`));
  const meta = [finalModel(change), `${change.blockType} ${change.blockId}`, wordDelta(change)].filter(Boolean);
  parts.push(`<span class="cmeta">${meta.map(esc).join(" · ")}</span>`);
  // The badges wrap on the left. The decision buttons stay on the right edge of the first line.
  const decide = reviewable
    ? '<span class="decide" role="group" aria-label="Your decision">' +
      '<button type="button" data-decide="accept" aria-pressed="false">✓ Accept</button>' +
      '<button type="button" data-decide="reject" aria-pressed="false">✕ Reject</button></span>'
    : "";
  return `<span class="hm">${parts.join("")}</span>${decide}`;
}

function statusBadges(change: BlockChange): string {
  if (change.kind === "autofix") {
    return change.status === "accepted" ? '<span class="b ok">applied</span>' : `<span class="b err">${esc(change.status)}</span>`;
  }
  if (change.status === "accepted") {
    const flag = needsReview(change) ? `<span class="b warn" title="${esc(change.reason)}">needs review</span>` : "";
    return `<span class="b ok">passed guardrails</span>${flag}<span class="b warn stamp">pending</span>`;
  }
  if (change.status === "unchanged") return '<span class="b err">unchanged</span>';
  if (change.status === "rejected") {
    const failed = failedChecks(change).map((c) => c.id);
    return `<span class="b bad">rejected${failed.length ? `: ${esc(failed.join(", "))}` : ""}</span>`;
  }
  return '<span class="b err">error</span>';
}

/** "gpt-6.1-sol (strong, retry)", from the attempt that decided the status. Autofixes say "code". */
function finalModel(change: BlockChange): string {
  if (change.kind === "autofix") return "code";
  const last = change.attempts?.[change.attempts.length - 1];
  if (!last) return "";
  const retry = (change.attempts?.length ?? 0) > 1 ? ", retry" : "";
  return `${last.model || "no response"} (${last.strength}${retry})`;
}

function hasAfter(change: BlockChange): boolean {
  return change.after.trim() !== "" && !(change.status === "error" && change.after === change.before);
}

/** "−4 words", "+1 word", or "±0 words". Empty when no rewrite text came back. */
function wordDelta(change: BlockChange): string {
  if (!hasAfter(change)) return "";
  const delta = countWords(change.after) - countWords(change.before);
  if (delta === 0) return "±0 words";
  return `${delta < 0 ? "−" : "+"}${Math.abs(delta)} word${Math.abs(delta) === 1 ? "" : "s"}`;
}

function reviewNote(review: CardReview | undefined): string {
  if (!review) return "";
  const who = review.reviewer ? `<b>${esc(review.reviewer)}</b>: ` : "";
  return `<p class="rv-note rv-${review.tone}">${who}${esc(review.label)}${review.note ? `. ${esc(review.note)}` : ""}</p>`;
}

function reason(change: BlockChange): string {
  if (!change.reason?.trim()) return "";
  const tone = change.status === "accepted" ? "warn" : change.status === "error" ? "err" : "bad";
  return `<p class="reason ${tone}">${esc(change.reason)}</p>`;
}

/**
 * The text the card diffs: the change's own after, or else the last attempt that returned text,
 * so an error after a rejected attempt still shows what the model wrote.
 */
function shownAfter(change: BlockChange): { text: string; note: string } {
  if (hasAfter(change)) return { text: change.after, note: "" };
  const attempts = change.attempts ?? [];
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i]!;
    if (a.after.trim()) return { text: a.after, note: `The last attempt returned no text. This is attempt ${i + 1} (${a.strength}).` };
  }
  return { text: "", note: "" };
}

function view(change: BlockChange): string {
  if (change.status === "unchanged") {
    return `<div class="view"><p class="muted">The model returned the block as it was. Nothing to review.</p><div class="pane">${textHtml(change.before)}</div></div>`;
  }
  const shown = shownAfter(change);
  if (!shown.text) {
    return `<div class="view"><p class="muted">No rewrite came back. The block as it is:</p><div class="pane">${textHtml(change.before)}</div></div>`;
  }
  return (
    '<div class="view">' +
    (shown.note ? `<p class="muted">${esc(shown.note)}</p>` : "") +
    '<div class="tools"><button type="button" class="link" data-act="sbs" aria-pressed="false">Side by side</button></div>' +
    `<div class="diff">${diffHtml(change.before, shown.text)}</div>` +
    '<div class="sbs">' +
    `<div><h4>Before</h4><div class="pane pane-before">${textHtml(change.before)}</div></div>` +
    `<div><h4>After</h4><div class="pane pane-after">${textHtml(shown.text)}</div></div>` +
    "</div></div>"
  );
}

function failedChecks(change: BlockChange): GuardrailResult[] {
  return ordered(change.verdict?.checks ?? []).filter((c) => !c.ok && !c.skipped);
}

function checks(change: BlockChange): string {
  const list = ordered(change.verdict?.checks ?? []);
  if (!list.length) return "";
  const failed = failedChecks(change).length;
  const skipped = list.filter((c) => c.skipped).length;
  const passed = list.length - failed - skipped;
  const rows = list
    .map((c) => {
      const [cls, icon] = c.skipped ? ["skip", "–"] : c.ok ? ["ok", "✓"] : ["bad", "✕"];
      return `<tr class="${cls}"><td class="ic">${icon}</td><td class="id">${esc(c.id)}</td><td>${esc(c.detail)}</td></tr>`;
    })
    .join("");
  const summary =
    `Guardrails <span class="ok-c">${passed} ✓</span>` +
    (failed ? ` <span class="bad-c">${failed} ✕</span>` : "") +
    (skipped ? ` <span class="muted">${skipped} –</span>` : "");
  return `<details class="checks"${failed ? " open" : ""}><summary>${summary}</summary><table>${rows}</table></details>`;
}

function attempts(change: BlockChange): string {
  const list = change.attempts ?? [];
  if (!list.length) return "";
  const shown = shownAfter(change).text;
  const items = list
    .map((a, i) => {
      const result = a.failed.length
        ? `<span class="bad-c">✕ ${esc(a.failed.join(", "))}</span>`
        : a.accepted
          ? '<span class="ok-c">✓ passed</span>'
          : `<span class="bad-c">✕ ${!a.model && !a.after.trim() ? "error, no response" : "failed"}</span>`;
      const text =
        a.after.trim() && a.after !== shown
          ? `<details class="att-text"><summary>Show this attempt</summary><div class="diff">${diffHtml(change.before, a.after)}</div></details>`
          : "";
      const model = a.model ? esc(a.model) : '<span class="muted">no response</span>';
      return `<li><span class="n">${i + 1}</span><span class="mono">${esc(a.strength)}</span> ${model} · ${fmtMs(a.ms)} · ${result}${text}</li>`;
    })
    .join("");
  return `<div class="attempts"><h4>Attempts</h4><ol>${items}</ol></div>`;
}
