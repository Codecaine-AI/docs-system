# Cross-Project Docs Audit — Implementation-Layer Standard

2026-08-15. Audit-only pass over every Core member repo with the docs system, against
`10-doc-standards/60-implementation-layer/` (+ the three-layer contract). Analysis by Codex
(gpt-5.6-sol, low, fast_mode, read-only), one worker per repo, 15 invocations total. No files
were modified anywhere. Full per-page verdict tables live in the worker transcripts; this is
the decision-grade summary.

## Scoreboard

| Repo | Format | Conformance | Implementation tier | Effort |
| --- | --- | --- | --- | --- |
| gamecube-decomp-harness | doc.json | ✅ done (this session's rewrite — the reference) | — | — |
| agent-kernel | markdown | 13 / 48 files | 0 conform; 10 MOVEs to design, 17 REFRAMEs | **Medium** (~2–3 days, mostly mechanical) |
| docs-system | doc.json | 0 / 18 impl pages; 21 more flagged in design/foundation | 0 conform | **Medium-large** (~2 fan-out days) |
| prompt-kit | markdown | 11 / 36 files | 0 / 19 conform | **Large** (rebuild around package layout) |
| canvas | doc.json | 1 / 56 bundles | 0 / 9 conform; wrong source mirror | **Large** (multi-session) |

Excluded (no docs system): observatory, sequence, annotations.

## Per-repo headlines

### agent-kernel — healthiest
- Foundation + most of design conform. Ten implementation files are wholesale behavior/schema
  docs → MOVE to design; 3 single-child FLATTENs, 3 appendix DELETEs (dev-setup, source-doc-map,
  tui-setup runbooks/reports).
- `explainers/` (5 HTML files): design contracts tangled with superseded proposals and audit
  residue; unprefixed filenames. All REFRAME.
- **`30-authoring`: keep as a declared extension tier** (how-to recipes for bundle authors —
  no home in the three layers). Needs a sanction in the standard.

### docs-system — the standard's own house
- All 18 implementation pages nonconforming: behavior walkthroughs, schemas, "live candidate"
  deliberation language, report sections. Theming over-split (3 sub-pages fragment one source
  file → collapse; only system-ui is a genuine subdivision). 99-appendix violates single-child
  + holds a dev runbook.
- 13 design pages prescribe directory layout / file-ownership (the "Typed Actions" boilerplate
  repeats across 8 block-vocabulary pages — semi-mechanical to extract) → those rules become
  implementation decision entries.
- 7 design pages carry report language ("not implemented yet", "remains undecided") → scrub.

### prompt-kit — inverted content
- 0/19 implementation pages conform; ~8 are behavior docs that MOVE up into design (which is
  already well-formed and will absorb them). Appendix DELETEs. Implementation must be rebuilt
  mirroring the real workspace (`packages/prompt-kit` vs `packages/prompt-kit-agent` — the agent
  package has no area page at all).
- `30-prompt-structure` (6 files): dissolve → design subject area `10-system-design/70-prompt-structure/`,
  extracting code-placement rules into implementation entries.
- **Live contradiction:** design's authoring-model documents TypeScript builders that
  implementation records as removed 2026-08-05. Needs reconciliation, not just moving.

### canvas — most displaced
- 1/56 bundles conform (`10-system-design/30-layering`). Implementation mirrors directories that
  don't exist (real root: `packages/canvas/src`); `50-editor`/`60-trim` break the one-level mirror.
- `30-agent-layout` (39 bundles) is a shadow design tier: ~29 pages MOVE into
  `10-system-design` (language DSL + rulebook + tool surface), 1 page (registration-and-seam) is
  the tier's only genuine implementation content, 9 pages DELETE (worked-example tutorial against
  a retired tool surface + the `60-running` runbook).
- Evict from docs: `90-findings-log` (dated dogfood log; salvage 4 entries first) and
  `agent-eval/` (33 files of eval protocols/trial reports/prototypes → eval-suite artifact area).
  `99-appendix` splits across the tiers; history DELETEs. `20-figjam-parity` in design is a
  self-described historical report → salvage + DELETE.

## Cross-project themes

1. **Every pre-standard implementation tier scored zero.** They were all written as
   "describe the current code" — exactly the mode the standard replaces. Conformance isn't
   drift; it's a different genre. Expect rewrites, not edits.
2. **The how-to category keeps recurring**: agent-kernel `30-authoring` (keep recommended),
   canvas `60-running`, prompt-kit dev appendix, harness operator-runbook. The standard bans
   runbooks from the tree but names no home. Decide once: a sanctioned `30-guides`-style
   extension tier per repo, or out of docs entirely.
3. **Reports are everywhere despite the ban** — findings logs, parity analyses, coverage
   audits, "not built yet" status lines inside otherwise-durable pages. Each cleanup needs a
   salvage-then-delete pass, not blind deletion.
4. **Design leaks both ways.** md-era design pages prescribe file layout (→ implementation
   entries); implementation pages narrate behavior (→ design). The migration is mostly
   content re-homing between existing tiers.
5. **Format divergence**: agent-kernel + prompt-kit are markdown, not doc.json bundles.
   Separate migration decision; audits scored content placement only.
6. Numbering is broadly fine everywhere (isolated fixes: canvas agent-eval, explainer prefixes).

## Recommended sequence

1. **Amend the standard first** (small): sanction the how-to/guides extension tier and name
   the report-salvage rule. Every repo cleanup depends on these two calls.
2. **agent-kernel** — cheapest win, mostly mechanical moves.
3. **docs-system** — the standard's own repo should model it; design absorption is defined.
4. **prompt-kit** — includes the builders-contradiction reconciliation.
5. **canvas** — largest; the 30-agent-layout re-homing doubles as its design-tier restructure,
   so consider folding it into the planned design-session work.
