/**
 * The report's inline CSS and browser script. The look follows the STE explainer sheet
 * (proposals/ste-writing-profile-2026-10-02/ste100-explainer.html): IBM Plex, black rules,
 * lettered panels. Colors carry meaning: blue = kept or approved, red = removed, a problem, or
 * rejected, green = added, amber = needs review.
 *
 * The script reads only the DOM and one JSON config element, so the HTML embeds no data twice.
 */

export const CSS = `
:root {
  --ink: #111; --muted: #666; --faint: #999; --line: #d6d6d6; --rule: #111; --row: #f4f4f4;
  --blue: #1f5fa8; --blue-soft: #e6eef8; --red: #c0332b; --red-soft: #fbeaea;
  --green: #1d7a3a; --green-soft: #e3f3e7; --amber: #a86a00; --amber-soft: #fff4dd;
  --sans: "IBM Plex Sans", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, monospace;
}
* { box-sizing: border-box; }
html { scroll-padding-top: 64px; }
body { margin: 0; background: #ececec; color: var(--ink); font: 14px/1.45 var(--sans); }
code, .mono, kbd { font-family: var(--mono); }
code { font-size: 12.5px; }
kbd { font-size: 11px; border: 1px solid var(--rule); padding: 0 4px; background: #fff; }
a { color: var(--blue); text-decoration: none; }
a:hover { text-decoration: underline; }
[hidden] { display: none !important; }
.muted { color: var(--muted); }
.ok-c { color: var(--blue); } .bad-c { color: var(--red); } .warn-c { color: var(--amber); } .err-c { color: var(--muted); }

/* sticky review bar */
.hud { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 8px 16px; flex-wrap: wrap;
  padding: 7px 22px; background: #fff; border-bottom: 1.5px solid var(--rule); font: 12px var(--mono); }
.hud .t { font: 600 13px var(--sans); margin-right: 4px; }
.sp { flex: 1; }
.prog { height: 10px; border: 1px solid var(--rule); background: #fff; position: relative; margin: 8px 0 12px; }
.prog i { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--blue); transition: width .2s; }
.prog.small { display: inline-block; width: 110px; height: 8px; margin: 0; }
.pill { font: 11.5px var(--mono); padding: 2px 8px; border: 1px solid currentColor; display: inline-block; }
.pill.idle { color: var(--muted); }
.pill.good { color: var(--green); background: var(--green-soft); }
.pill.over { color: var(--red); background: var(--red-soft); }
.hud-filter { border: 1px solid var(--amber); color: var(--amber); background: var(--amber-soft); padding: 1px 6px; }

/* controls */
.btn { all: unset; cursor: pointer; font: 12px var(--mono); padding: 4px 10px; border: 1px solid var(--rule); background: #fff; color: var(--ink); white-space: nowrap; }
.btn:hover { background: var(--row); }
.btn.primary { background: var(--ink); color: #fff; }
.btn.primary:hover { background: #333; }
.link { all: unset; cursor: pointer; font: 11.5px var(--mono); color: var(--blue); border-bottom: 1px dotted var(--blue); }
.chip { all: unset; cursor: pointer; font: 11.5px var(--mono); padding: 3px 8px; border: 1px solid var(--line); }
.chip .cn { color: var(--muted); }
.chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
.chip.on .cn { color: #bbb; }
.btn:focus-visible, .chip:focus-visible, .link:focus-visible, .rule-pick:focus-visible, .decide button:focus-visible,
summary:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }

/* drawing sheet */
.sheet { max-width: 1680px; margin: 20px auto 40px; background: #fff; border: 1.5px solid var(--rule); padding: 0 22px; }
.ruler-x { display: grid; grid-template-columns: repeat(8, 1fr); font: 11px var(--mono); color: var(--muted); text-align: center; height: 22px; line-height: 22px; }
.ruler-x span { border-left: 1px solid var(--rule); }
.ruler-x span:first-child { border-left: 0; }
.frame { border: 1px solid var(--rule); padding: 22px; }
.titlebar { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 16px;
  border-bottom: 1.5px solid var(--rule); padding-bottom: 10px; margin-bottom: 22px; }
.titlebar h1 { margin: 0; font-size: 22px; font-weight: 600; }
.titlebar .meta { font: 11.5px var(--mono); color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 22px; }
.span-4 { grid-column: span 4; } .span-8 { grid-column: span 8; } .span-12 { grid-column: span 12; }
@media (max-width: 1200px) { .grid > * { grid-column: span 12 !important; } }

/* panels */
.panel { border: 1.5px solid var(--rule); display: flex; flex-direction: column; min-width: 0; }
.panel > header { display: flex; align-items: stretch; border-bottom: 1.5px solid var(--rule); }
.panel > header .tag { background: var(--ink); color: #fff; font-weight: 600; width: 34px; flex: none; display: grid; place-items: center; }
.panel > header h2 { margin: 0; font-size: 16px; font-weight: 600; padding: 8px 12px; flex: 1; }
.panel > header .meta { font: 11px var(--mono); color: var(--muted); padding: 0 12px; align-self: center; text-align: right; }
.panel > .body { padding: 14px 16px; flex: 1; min-width: 0; }
.panel > .body.flush { padding: 0; overflow-x: auto; }
.panel > .foot { border-top: 1px solid var(--line); padding: 9px 16px; font-size: 12px; color: var(--muted); }

/* A: verdict */
.banner.warn { margin: 0 0 12px; padding: 8px 12px; background: var(--amber-soft); border: 1px solid var(--amber); border-left: 6px solid var(--amber); color: #6b4500; font-weight: 500; }
.headline { font: 600 21px/1.3 var(--sans); margin: 0 0 8px; }
.next { margin: 0 0 16px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--rule); border-left: 1px solid var(--rule); }
.tile { border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 10px 12px 12px; min-width: 0; }
.tile label { display: block; font: 11px var(--mono); color: var(--muted); margin-bottom: 2px; }
.tile .big { font: 500 30px/1.15 var(--sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile .big small { font-size: 16px; color: var(--muted); font-weight: 400; }
.tile .sub { font: 11.5px var(--mono); color: var(--muted); margin-top: 3px; }
@media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

/* B: tally */
.tally-big { font: 500 34px/1.1 var(--sans); }
.tally-big small { font-size: 15px; color: var(--muted); font-weight: 400; }
dl.tally { display: grid; grid-template-columns: 1fr 1fr; margin: 0 0 10px; border-top: 1px solid var(--line); }
dl.tally div { padding: 6px 0; border-bottom: 1px solid var(--line); }
dl.tally dt { font: 11px var(--mono); color: var(--muted); }
dl.tally dd { margin: 0; font: 500 20px var(--sans); }
dl.tally dd small { font: 11px var(--mono); color: var(--muted); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 8px; }
.hint { font-size: 12px; color: var(--muted); margin: 6px 0; }
.msg { font: 12px var(--mono); color: var(--blue); margin: 4px 0 0; min-height: 1em; }

/* tables (C, F) */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; font: 400 11px var(--mono); color: var(--muted); padding: 7px 8px; border-bottom: 1px solid var(--rule); white-space: nowrap; }
th[data-sort] { cursor: pointer; user-select: none; }
th[data-sort]:hover { color: var(--ink); }
th.asc::after { content: " ▲"; } th.desc::after { content: " ▼"; }
td { padding: 6px 8px; border-bottom: 1px solid #fff; vertical-align: top; }
tbody tr:nth-child(odd) td { background: var(--row); }
th.num, td.num { text-align: right; }
td.num { font: 12.5px var(--mono); white-space: nowrap; }
td.num .muted { font-size: 11px; }
table.rules tbody tr { cursor: pointer; }
table.rules tbody tr:hover td { background: var(--blue-soft); }
table.rules tbody tr.on td { background: var(--amber-soft); }
.rule-pick { all: unset; cursor: pointer; font: 12.5px var(--mono); border-bottom: 1px dotted var(--faint); }
.bar { display: inline-block; width: 140px; height: 9px; background: #e6e6e6; margin-right: 10px; position: relative; vertical-align: middle; }
.bar i { position: absolute; inset: 0 auto 0 0; background: var(--ink); }
.bar i.voc { background: var(--faint); }
td.path { font: 12px var(--mono); }

/* D: pages */
.first { border: 1px solid var(--rule); padding: 10px 14px 12px; margin-bottom: 14px; background: #fafafa; }
.first h3, .ex-rule h3 { margin: 0 0 8px; font-size: 14px; }
.first ol { list-style: none; margin: 0; padding: 0; counter-reset: f; display: grid; gap: 7px; }
.first li { counter-increment: f; display: grid; grid-template-columns: 22px 1fr; column-gap: 10px; }
.first li::before { content: counter(f); grid-row: span 2; background: var(--ink); color: #fff; font: 600 12px var(--sans); width: 22px; height: 22px; display: grid; place-items: center; }
.first code { font-size: 11.5px; color: var(--muted); }
.first .why { font-size: 12.5px; color: var(--muted); }
.filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 4px 0 10px; border-bottom: 1px solid var(--line); }
.filters .chips { display: flex; gap: 4px; flex-wrap: wrap; }
.filters select, .filters input { font: 12px var(--mono); padding: 3px 6px; border: 1px solid var(--rule); background: #fff; border-radius: 0; }
.filters input { width: 150px; }
.filters select { max-width: 170px; }
.showing { font: 11.5px var(--mono); color: var(--muted); margin-left: auto; }
details.page { border: 1.5px solid var(--rule); margin: 14px 0 0; }
details.page > summary { list-style: none; cursor: pointer; padding: 9px 12px 9px 36px; background: var(--row); display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; position: relative; }
details.page > summary::-webkit-details-marker { display: none; }
details.page > summary::before { content: "+"; position: absolute; left: 0; top: 0; bottom: 0; width: 24px; display: grid; place-items: center; background: var(--ink); color: #fff; font: 600 14px var(--mono); }
details.page[open] > summary::before { content: "−"; }
details.page[open] > summary { border-bottom: 1px solid var(--rule); }
details.page .ttl { flex: 1 1 420px; }
details.page .ttl b { font-size: 15px; }
details.page .ttl code { color: var(--muted); font-size: 11.5px; }
details.page .stats { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 3px 18px; font: 11.5px var(--mono); color: var(--muted); }
details.page .stats b { color: var(--ink); font-weight: 500; }
.pprog { font: 11.5px var(--mono); padding: 1px 6px; border: 1px solid var(--amber); color: var(--amber); background: var(--amber-soft); }
.pprog.done { border-color: var(--blue); color: var(--blue); background: var(--blue-soft); }
.cards { padding: 2px 12px 12px; }
.empty { margin: 10px 0 0; }
details.autofixes { margin-top: 10px; border: 1px dashed var(--faint); padding: 0 10px; }
details.autofixes > summary { cursor: pointer; padding: 6px 0; font: 12px var(--mono); color: var(--blue); }
details.autofixes[open] { padding-bottom: 10px; }

/* reviewer overlay */
.b.rv-good { color: var(--green); background: var(--green-soft); }
.b.rv-neutral { color: var(--muted); background: var(--row); }
.b.rv-flagged { color: var(--red); background: var(--red-soft); }
.rv-note { margin: 0 0 8px; font-size: 13px; padding: 3px 8px; border-left: 3px solid currentColor; }
.rv-note.rv-good { color: var(--green); background: var(--green-soft); }
.rv-note.rv-neutral { color: var(--muted); background: var(--row); }
.rv-note.rv-flagged { color: var(--red); background: var(--red-soft); }
.reviewer { margin-top: 14px; border: 1px solid var(--rule); padding: 10px 12px; }
.rv-head { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; margin-bottom: 6px; }
.rv-head .muted { font: 11.5px var(--mono); }
.rv-row { display: flex; gap: 8px 18px; align-items: baseline; flex-wrap: wrap; margin-bottom: 6px; }
.rv-big { font: 500 20px var(--sans); }
.rv-counts { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; font: 12px var(--mono); }
.rv-counts .rv-good { color: var(--green); } .rv-counts .rv-neutral { color: var(--muted); } .rv-counts .rv-flagged { color: var(--red); }
.rv-summary { font-size: 13px; }
.rv-summary p { margin: 4px 0; }
.rv-summary ul { margin: 4px 0; padding-left: 20px; }

/* guardrail legend */
.legend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px 22px; margin: 0 0 14px; padding: 8px 14px; border: 1px solid var(--line); font-size: 12.5px; }
.legend h3 { grid-column: 1 / -1; margin: 0 0 2px; font: 400 11px var(--mono); color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.legend code { font-size: 12px; margin-right: 4px; }
@media (max-width: 1000px) { .legend { grid-template-columns: 1fr; } }

/* cards */
.card { border: 1px solid var(--line); border-left: 4px solid var(--amber); margin: 10px 0 0; background: #fff; }
.card.k-autofix { border-left-color: var(--blue); }
.card.d-accept { border-left-color: var(--blue); }
.card.d-reject { border-left-color: var(--red); }
.card.s-rejected { border-left-color: var(--red); background: #fffbfb; }
.card.s-error { border-left: 4px dashed var(--faint); background: #fcfcfc; }
.card.s-unchanged { border-left-color: var(--line); background: #fcfcfc; }
.card.s-unchanged > .card-h { padding: 3px 10px; color: var(--muted); }
.card.cur { outline: 2px solid var(--ink); outline-offset: 1px; }
.card.flash { animation: flash 1.4s ease-out; }
@keyframes flash { from { background: var(--amber-soft); } to { background: #fff; } }
.card-h { display: flex; align-items: flex-start; gap: 10px; padding: 6px 10px; border-bottom: 1px solid var(--line); font: 11.5px var(--mono); }
.card-h .hm { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 5px 7px; padding-top: 2px; }
summary.card-h { cursor: pointer; list-style: none; }
summary.card-h::-webkit-details-marker { display: none; }
summary.card-h::before { content: "▸"; color: var(--muted); }
details.card[open] > summary.card-h::before { content: "▾"; }
details.card:not([open]) > summary.card-h { border-bottom: 0; }
.b { font: 11px var(--mono); padding: 1px 6px; border: 1px solid currentColor; white-space: nowrap; }
.b.kind { color: var(--ink); }
.b.ok { color: var(--blue); background: var(--blue-soft); }
.b.warn { color: var(--amber); background: var(--amber-soft); }
.b.bad { color: var(--red); background: var(--red-soft); }
.b.err { color: var(--muted); background: var(--row); }
.rid { background: #efefef; padding: 1px 5px; }
.cmeta { color: var(--muted); }
.decide { display: inline-flex; flex: none; }
.decide button { all: unset; cursor: pointer; font: 12px var(--mono); padding: 3px 10px; border: 1px solid var(--rule); background: #fff; }
.decide button + button { border-left: 0; }
.decide button:hover { background: var(--row); }
.decide button[data-decide="accept"][aria-pressed="true"] { background: var(--blue); border-color: var(--blue); color: #fff; }
.decide button[data-decide="reject"][aria-pressed="true"] { background: var(--red); border-color: var(--red); color: #fff; }
.card-b { padding: 8px 12px 10px; }
.reason { margin: 0 0 8px; font-size: 13px; }
.reason.bad { color: var(--red); } .reason.err { color: var(--muted); }
.reason.warn { color: var(--amber); background: var(--amber-soft); border-left: 3px solid var(--amber); padding: 3px 8px; }
.card.needs-review { border-left-width: 6px; }
.tools { float: right; margin: 2px 0 4px 12px; }
.diff, .pane { font-size: 14.5px; line-height: 1.65; }
.diff p, .pane p { margin: 0 0 4px; }
.diff ul, .pane ul { margin: 2px 0 4px; padding-left: 22px; }
.diff li, .pane li { margin: 1px 0; }
del { color: var(--red); background: var(--red-soft); text-decoration: line-through; }
ins { color: var(--green); background: var(--green-soft); text-decoration: none; box-shadow: inset 0 -1px 0 var(--green); }
code.cs { font: 12.5px var(--mono); background: #f2f2f2; border: 1px solid var(--line); padding: 0 3px; }
del code.cs, ins code.cs { background: transparent; border-color: currentColor; }
.ph { font: 10.5px var(--mono); color: var(--muted); border: 1px dashed var(--faint); padding: 0 3px; }
.sbs { display: none; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; clear: both; }
.sbs .pane { border: 1px solid var(--line); padding: 8px 10px; }
.sbs h4, .attempts h4 { margin: 0 0 4px; font: 400 11px var(--mono); color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.card.sbs-on .sbs { display: grid; }
.card.sbs-on .diff { display: none; }
details.checks { margin-top: 8px; clear: both; }
details.checks > summary { cursor: pointer; font: 11.5px var(--mono); color: var(--muted); }
details.checks table { margin-top: 4px; font-size: 12.5px; }
details.checks td { padding: 3px 8px; background: transparent !important; border-bottom: 1px solid #f0f0f0; }
details.checks td.ic { width: 18px; font-weight: 600; }
details.checks td.id { width: 140px; font: 12px var(--mono); white-space: nowrap; }
details.checks tr.ok td.ic { color: var(--blue); }
details.checks tr.skip td { color: var(--muted); }
details.checks tr.bad td { background: var(--red-soft) !important; color: var(--red); }
.attempts { margin-top: 8px; }
.attempts ol { list-style: none; margin: 0; padding: 0; font: 12px var(--mono); }
.attempts li { padding: 2px 0; }
.attempts .n { display: inline-grid; place-items: center; width: 16px; height: 16px; background: var(--ink); color: #fff; font-size: 10px; margin-right: 6px; }
.attempts .mono { margin-right: 2px; }
details.att-text { margin: 4px 0 6px 22px; }
details.att-text > summary { cursor: pointer; color: var(--blue); font: 11.5px var(--mono); }
details.att-text .diff { font-family: var(--sans); }
.note { display: block; width: 100%; margin-top: 8px; font: 13px var(--sans); padding: 5px 8px; border: 1px solid var(--red); background: var(--red-soft); }

/* E: examples */
.examples { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 26px; }
@media (max-width: 1000px) { .examples { grid-template-columns: 1fr; } }
.ex-rule { border-top: 1.5px solid var(--rule); padding-top: 8px; min-width: 0; }
.ex-rule h3 { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.ex-rule h3 .meta { font: 400 11px var(--mono); color: var(--muted); }
.ex-rule .hint { margin: 0 0 6px; font-size: 12.5px; color: var(--muted); }
ol.samples { margin: 0; padding-left: 20px; font-size: 13px; }
ol.samples li { margin: 0 0 7px; }
ol.samples .where { font: 11px var(--mono); color: var(--muted); margin-top: 1px; }
ol.samples .prob { color: var(--amber); }
mark { background: none; color: var(--red); border-bottom: 2px solid var(--red); }

/* G: title block */
.titleblock .t { padding: 8px 12px; border-bottom: 1px solid var(--rule); }
.titleblock .t b { font-size: 16px; font-weight: 600; }
.titleblock label { display: block; font: 10.5px var(--mono); color: var(--muted); }
.titleblock .row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--rule); }
.titleblock .row:last-child { border-bottom: 0; }
.titleblock .row.one { grid-template-columns: 1fr; }
.titleblock .row > div { padding: 6px 12px; font-size: 13px; min-width: 0; }
.titleblock .row > div + div { border-left: 1px solid var(--rule); }
.titleblock code { font-size: 12px; background: #efefef; padding: 0 4px; }
.deep-list { margin: 2px 0 0; padding-left: 16px; font: 12px var(--mono); }
`;

/**
 * Browser behavior: the review tally (localStorage), filters, sorting, side-by-side toggles,
 * keyboard keys, and the decision export. Written as plain ES2017 with no backticks and no
 * template interpolation, because it lives inside String.raw.
 */
export const CLIENT_JS = String.raw`
(function () {
  "use strict";
  var cfgEl = document.getElementById("report-config");
  var C = {};
  try { C = JSON.parse(cfgEl ? cfgEl.textContent : "{}") || {}; } catch (e) { C = {}; }
  var LIMIT = typeof C.limit === "number" ? C.limit : 0.1;
  var KEY = C.storageKey || "docs-style-review";
  var store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { store = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* storage off: keep decisions in memory */ } }

  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function one(sel, root) { return (root || document).querySelector(sel); }
  function setText(name, value) { all('[data-t="' + name + '"]').forEach(function (el) { el.textContent = String(value); }); }

  var reviewCards = all(".card[data-key]");
  var current = null;
  var filter = { status: "all", rule: "", q: "" };

  function decision(card) { var s = store[card.getAttribute("data-key")]; return s ? s.d : ""; }

  function paint(card) {
    var d = decision(card);
    card.classList.toggle("d-accept", d === "accept");
    card.classList.toggle("d-reject", d === "reject");
    all("[data-decide]", card).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-decide") === d)); });
    var stamp = one(".stamp", card);
    if (stamp) {
      stamp.textContent = d === "accept" ? "approved by you" : d === "reject" ? "rejected by you" : "pending";
      stamp.className = "b stamp " + (d === "accept" ? "ok" : d === "reject" ? "bad" : "warn");
    }
    var note = one(".note", card);
    if (note) {
      note.hidden = d !== "reject";
      var s = store[card.getAttribute("data-key")];
      if (document.activeElement !== note) note.value = (s && s.note) || "";
    }
  }

  function tally() {
    var reviewed = 0, rejected = 0;
    reviewCards.forEach(function (c) { var d = decision(c); if (d) reviewed++; if (d === "reject") rejected++; });
    var total = reviewCards.length;
    var rate = reviewed ? rejected / reviewed : 0;
    var state = !reviewed ? "idle" : rate > LIMIT ? "over" : "good";
    setText("reviewed", reviewed);
    setText("rejected", rejected);
    setText("total", total);
    setText("left", total - reviewed);
    setText("rate", reviewed ? Math.round(rate * 1000) / 10 + "%" : "–");
    all('[data-t="bar"]').forEach(function (el) { el.style.width = (total ? (reviewed / total) * 100 : 0) + "%"; });
    all('[data-t="state"]').forEach(function (el) { el.className = "pill " + state; el.textContent = el.getAttribute("data-" + state) || ""; });
    all("[data-page-progress]").forEach(function (el) {
      var cards = all(".card[data-key]", el.closest("details.page"));
      var done = cards.filter(function (c) { return !!decision(c); }).length;
      el.textContent = done + "/" + cards.length + " reviewed";
      el.classList.toggle("done", done === cards.length);
    });
  }

  function say(text) { setText("msg", text); }

  function setCurrent(card) {
    if (current) current.classList.remove("cur");
    current = card;
    if (card) card.classList.add("cur");
  }

  /* A click on the pressed button clears the decision. A key press only sets it. */
  function decide(card, d, toggle) {
    if (!card) return;
    var key = card.getAttribute("data-key");
    var prev = store[key];
    if (prev && prev.d === d && toggle) delete store[key];
    else if (!prev || prev.d !== d) store[key] = { d: d, at: new Date().toISOString(), note: (prev && prev.note) || "" };
    save();
    paint(card);
    tally();
    setCurrent(card);
    var note = one(".note", card);
    if (d === "reject" && store[key] && note) note.focus({ preventScroll: true });
  }

  function hiddenByFilter(card) {
    var page = card.closest("details.page");
    return card.hidden || !!(page && page.hidden);
  }

  function reveal(card) {
    if (hiddenByFilter(card)) resetFilters();
    var page = card.closest("details.page");
    if (page) page.open = true;
    setCurrent(card);
    card.classList.remove("flash");
    void card.offsetWidth;
    card.classList.add("flash");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function next() {
    if (!reviewCards.length) return;
    var start = current ? reviewCards.indexOf(current) : -1;
    for (var i = 1; i <= reviewCards.length; i++) {
      var c = reviewCards[(start + i) % reviewCards.length];
      if (!decision(c)) { say(""); reveal(c); return; }
    }
    say("Every rewrite has a decision. Export them next.");
  }

  function cardMatches(c) {
    var kind = c.getAttribute("data-kind"), status = c.getAttribute("data-status"), s = filter.status, ok;
    if (s === "all") ok = true;
    else if (s === "autofix") ok = kind === "autofix";
    else if (s === "review") ok = c.hasAttribute("data-key") && !decision(c);
    else if (s === "needs-review") ok = c.classList.contains("needs-review");
    else if (s === "rv-flagged") ok = c.getAttribute("data-rv") === "flagged";
    else ok = kind === "rewrite" && status === s;
    if (ok && filter.rule) ok = (" " + c.getAttribute("data-rules") + " ").indexOf(" " + filter.rule + " ") >= 0;
    return ok;
  }

  function apply() {
    var q = filter.q.trim().toLowerCase();
    var narrowed = filter.status !== "all" || !!filter.rule;
    var shown = 0, pages = 0;
    all("details.page").forEach(function (p) {
      var pathOk = !q || (p.getAttribute("data-search") || "").indexOf(q) >= 0;
      var n = 0;
      all(".card", p).forEach(function (c) { var m = pathOk && cardMatches(c); c.hidden = !m; if (m) n++; });
      all("details.autofixes", p).forEach(function (g) {
        var any = all(".card", g).some(function (c) { return !c.hidden; });
        g.hidden = !any;
        if (narrowed && any) g.open = true;
      });
      var show = pathOk && (!narrowed || n > 0);
      p.hidden = !show;
      if (show) { pages++; shown += n; if (narrowed) p.open = true; }
    });
    var total = all("details.page .card").length;
    setText("showing", narrowed || q ? "showing " + shown + " of " + total + (total === 1 ? " change" : " changes") + " on " + pages + (pages === 1 ? " page" : " pages") : "");
    all(".chip[data-status]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-status") === filter.status); });
    var sel = one(".f-rule");
    if (sel && sel.value !== filter.rule) sel.value = filter.rule;
    all("tr[data-rule]").forEach(function (r) { r.classList.toggle("on", r.getAttribute("data-rule") === filter.rule); });
    all(".ex-rule").forEach(function (b) { b.hidden = !!filter.rule && b.getAttribute("data-rule") !== filter.rule; });
    var hf = one(".hud-filter");
    if (hf) hf.hidden = !filter.rule;
    setText("rule", filter.rule);
  }

  function resetFilters() {
    filter = { status: "all", rule: "", q: "" };
    var q = one(".f-q");
    if (q) q.value = "";
    apply();
  }

  function sortBy(th) {
    var table = th.closest("table"), body = table.tBodies[0];
    var idx = Array.prototype.indexOf.call(th.parentNode.children, th);
    var rows = Array.prototype.slice.call(body.rows);
    function val(r) {
      var c = r.cells[idx];
      if (!c) return "";
      var v = c.getAttribute("data-v");
      return v !== null ? v : c.textContent.trim();
    }
    var numeric = rows.every(function (r) { var v = val(r); return v !== "" && isFinite(Number(v)); });
    var dir = th.getAttribute("data-dir");
    dir = dir ? (dir === "asc" ? "desc" : "asc") : th.getAttribute("data-first") || (numeric ? "desc" : "asc");
    all("th", table).forEach(function (h) { h.removeAttribute("data-dir"); h.classList.remove("asc", "desc"); });
    th.setAttribute("data-dir", dir);
    th.classList.add(dir);
    rows.sort(function (a, b) {
      var x = val(a), y = val(b);
      var r = numeric ? Number(x) - Number(y) : x.localeCompare(y);
      return dir === "asc" ? r : -r;
    });
    rows.forEach(function (r) { body.appendChild(r); });
  }

  function exportDecisions() {
    var texts = C.texts || {};
    var decisions = reviewCards.map(function (c) {
      var key = c.getAttribute("data-key");
      var s = store[key] || null;
      var text = texts[key] || ["", ""];
      return {
        page: c.getAttribute("data-page"),
        blockId: c.getAttribute("data-block"),
        ruleIds: (c.getAttribute("data-rules") || "").split(" ").filter(Boolean),
        model: c.getAttribute("data-model") || "",
        reviewerLabel: c.getAttribute("data-rv-label") || null,
        decision: s ? s.d : null,
        note: s ? s.note || "" : "",
        decidedAt: s ? s.at : null,
        before: text[0],
        after: text[1]
      };
    });
    var reviewed = decisions.filter(function (d) { return d.decision; }).length;
    var rejected = decisions.filter(function (d) { return d.decision === "reject"; }).length;
    var out = {
      sweepStartedAt: C.startedAt || null,
      exportedAt: new Date().toISOString(),
      rejectLimit: LIMIT,
      total: decisions.length,
      reviewed: reviewed,
      rejected: rejected,
      rejectionRate: reviewed ? rejected / reviewed : null,
      decisions: decisions
    };
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "style-review-" + String(C.startedAt || "sweep").replace(/[^0-9A-Za-z]+/g, "-") + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    say("Exported " + reviewed + " of " + decisions.length + " decisions.");
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var b = t.closest("[data-decide]");
    if (b) { decide(b.closest(".card"), b.getAttribute("data-decide"), true); return; }
    var act = t.closest("[data-act]");
    if (act) {
      var a = act.getAttribute("data-act");
      if (a === "next") next();
      else if (a === "export") exportDecisions();
      else if (a === "clear-rule") { filter.rule = ""; apply(); }
      else if (a === "expand" || a === "collapse") all("details.page").forEach(function (d) { if (!d.hidden) d.open = a === "expand"; });
      else if (a === "sbs") {
        var on = act.closest(".card").classList.toggle("sbs-on");
        act.textContent = on ? "Inline diff" : "Side by side";
        act.setAttribute("aria-pressed", String(on));
      }
      return;
    }
    var chip = t.closest(".chip[data-status]");
    if (chip) { filter.status = chip.getAttribute("data-status"); apply(); return; }
    var th = t.closest("th[data-sort]");
    if (th) { sortBy(th); return; }
    var row = t.closest("tr[data-rule]");
    if (row) { var r = row.getAttribute("data-rule"); filter.rule = filter.rule === r ? "" : r; apply(); return; }
    var link = t.closest('a[href^="#p-"]');
    if (link) {
      var target = document.getElementById(link.getAttribute("href").slice(1));
      if (target) { if (target.hidden) resetFilters(); target.open = true; }
    }
    var card = t.closest(".card[data-key]");
    if (card) setCurrent(card);
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (t.classList.contains("note")) {
      var key = t.closest(".card").getAttribute("data-key");
      if (store[key]) { store[key].note = t.value; save(); }
    } else if (t.classList.contains("f-q")) {
      filter.q = t.value;
      apply();
    }
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t instanceof Element && t.classList.contains("f-rule")) { filter.rule = t.value; apply(); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target instanceof Element ? e.target : null;
    if (t && t.classList.contains("note")) {
      if (e.key === "Enter") { e.preventDefault(); t.blur(); next(); }
      else if (e.key === "Escape") t.blur();
      return;
    }
    var tag = t ? t.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "n") { e.preventDefault(); next(); }
    else if (e.key === "a" && current) { e.preventDefault(); decide(current, "accept", false); next(); }
    else if (e.key === "r" && current) { e.preventDefault(); decide(current, "reject", false); }
  });

  reviewCards.forEach(paint);
  tally();
  apply();
  if (location.hash.indexOf("#p-") === 0) {
    var opened = document.getElementById(location.hash.slice(1));
    if (opened) opened.open = true;
  }
})();
`;
