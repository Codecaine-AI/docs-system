# Review ledger — docs dogfood review

One row per corpus doc. Verdict: `clean` (read, no changes) / `edited`
(changed during review) / `follow-up` (issue parked in current_state.md) /
blank (not yet reviewed). Keep rows current within the sitting.

Paths reflect the 2026-07-20 R2-D13 restructure (Ford's 6-step narrative
flow): interaction-surfaces 00→10; doc-architecture 10→20 and became a
SECTION (its overview + 7 new standards docs); data-model 20→30 with
mutation-model folded in at 60; block-vocabulary 30→40; packages moved to
20-implementation/10-packages with a new design-level 50-package-boundaries
doc staying in system design; 20-implementation/10-package-map DELETED
(absorbed into 10-packages/00-overview). Corpus 45→53. Earlier annotations:
"vocab sweep" = 2026-07-17 projection→render sweep (edits landed, Ford has
not read the doc yet). "title strip" (R2-D11) = leading duplicate H1
removed when fixed page titles landed; docs WITHOUT the note kept a richer
opening H1. "audit Wn" = flagged by the new `docs audit` command (R2-D14)
— read-through fodder.

| Doc | Reviewed | Verdict | Actions |
|---|---|---|---|
| docs/00-foundation/00-manifesto | 2026-07-17 | edited | REWRITTEN end-to-end (knowledge-transfer thesis, R2-D1); needs Ford's read; title strip; audit W1: 5 level-1 headings |
| docs/10-system-design (was 00-overview) | 2026-07-20 | edited | Ford APPROVED after 3 rewrites ("good enough"): primer with H2 per piece + bullets, no in-doc H1, at folder-level doc.json (parallel session moved all section overviews to folder level mid-sitting). v4: section order changed per Ford — DOC ARCHITECTURE FIRST (docs define the function w/o code), then surfaces/data-model/vocab/boundaries; refs re-pathed. v5 (2026-07-20 later): Ford hand-edited the Docs Architecture section into his MATTER-OF-FACT register (opener paragraph deleted, page starts at H2 — audit W4 now flags it, his call) and the agent matched the four remaining sections to it (one plain lead sentence + fact bullets; flourishes dropped). Ford's blocks untouched — note his docarch-p grammar slip "allowing every new piece of knowledge has one clear home". RESOLVED 2026-07-20: section renamed to doc standards — sd-overview's link label/text swept to "Doc standards" (Ford's blocks otherwise untouched) |
| docs/10-system-design/20-interaction-surfaces | 2026-07-17 | edited | NEW — authored fresh (R2-D1); needs Ford's read. R2-D3/D4 canvas embed de-framing + content-fit previews; R2-D10 staircase repair. Renumbered 00→10 (R2-D13), then 10→20 (2026-07-20: Ford put doc-architecture first); audit W4: opens with canvas block, not a paragraph |
| docs/10-system-design/10-doc-standards | 2026-07-20 | edited | FULL REWRITE from Ford's step-2 answer (.tmp/rewrite-docarch-overview-v2.ts): the bet (docs first-class, code = output) + many-agents scale rationale (one home per fact / reviewable by AI / learnable by humans) + three-layer table with foundation-as-comparison + "the why travels with every decision" + file-tree block of the corpus shape. THEN (same sitting, Ford's interview): SECTION RENAMED doc-architecture→doc-standards and restructured to FIVE children (.tmp/restructure-doc-standards.ts); standards list now 5 links, title field "Doc standards". LAID-OUT RESHAPE (.tmp/standards-laidout-reshape.ts + tree-entries-dirslash.ts, Ford's directive): every standard now flows "How it's laid out" (file-tree or annotated code block) → rule → why; "In this corpus" prose sections REMOVED, facts moved into component notes; intro line matches. DE-CORPUS + BULLETIZE 2026-07-21 (.tmp/decorpus-bulletize.ts): "the corpus" phrasing → "the docs"/"the doc tree" section-wide; why-sections → bold-lead bullets; sub-bullets in in-code-docs flow; Ford's live edits (overview opener merge, structure Layer/Depth bullets, litmus deletion) honored as disk truth. FLAG: structure intro grammar slip "decided on two axes decide it". Awaiting Ford's read |
| docs/10-system-design/10-doc-standards/10-structure | 2026-07-21 | edited | NEW 07-20 as merge of 10-hierarchy-layers + 20-directory-structure; ladder generalized to every layer. REFOCUSED 07-21 (.tmp/structure-substructure-focus.ts, Ford: overview now teaches the layers): layers section REMOVED, page is the L1–L6 substructure — tree annotated with L1/L2/L3 levels, ladder table + bullets, folders/bundles rules, 4 why bullets (Rate-of-change bullet left with the layers). Ford's own deletions honored (litmus para, purity callout BOTH deleted by him in live edits); his two-axes intro replaced per the refocus (nested pm sub-bullets dropped with it — recoverable via workbench undo if wanted). WHY REWRITTEN 07-21 from Ford's dictation: on-disk-next-to-code / progressive disclosure / a clear place for everything (lead bullets + subs). Needs Ford's read. NOTE: framework operational copies content still describes the old split — pointers re-pathed, content sync pending |
| docs/10-system-design/10-doc-standards/20-numbering | 2026-07-21 | edited | was 30-numbering (renumbered in the 5-child restructure). 07-21: file-tree now SHOWS the mechanics per Ford — children start at 10, siblings gap by ten, a marked hypothetical 25-new-standard mid-gap insertion, the 10–17 dense deviation, 00/99 slots; deviation callout sits under the tree. WHY REWRITTEN 07-21 from Ford's dictation: human-first ("Ordered for human reading"), agent-second ("A clean search path for agents"); his misplaced repo-alongside sub moved to structure's on-disk bullet; his "Insertion is local" + "Exhaustion is a signal" kept verbatim. FORD APPROVED 2026-07-21 ("looks good now"); same day: why leads split to bold-label + sub-bullet pattern (no em-dash leads) |
| docs/10-system-design/10-doc-standards/30-cross-doc-linking | 2026-07-21 | edited | was 50-doc-linking; 07-20 rewritten w/ Ford's four rules + Decision callout (open call resolved; 14 up-refs unwrapped). 07-21 REWRITTEN AGAIN (link-objects directive): doc ref = {kind:"doc", path} — NO label, span text = the doc's name; new laid-out JSON example; bold-label bullet pattern throughout. Rides the corpus-wide label sweep (112 labels dropped) + render/convert code changes. Needs Ford's read |
| docs/10-system-design/10-doc-standards/40-code-linking | 2026-07-21 | edited | was 60-code-linking; 07-21 REWRITTEN (link-objects directive): code link = typed {kind:"source", path} span verified by links check (now accepts directory targets — package roots are legal); laid-out JSON example; bold-label bullet pattern. Rides the corpus sweep: 66 real-path code spans → typed source refs. Needs Ford's read |
| docs/10-system-design/10-doc-standards/50-in-code-docs | 2026-07-20 | edited | NEW — Ford's interview: the L4/L5 story as its own standard. File headers (contract before code, <50 lines), function docstrings, inline comments; reading flow (header rules the file in/out); doc-title.ts as the corpus example; why the corpus stops at L3. Needs Ford's read |
| DELETED 2026-07-20: 10-hierarchy-layers + 20-directory-structure | | | merged into 10-doc-standards/10-structure (Ford: structure is one story now that the layers share the same shape) |
| DELETED 2026-07-20: 40-titles-and-openings | | | Ford: more style than structure — titles/openings + SCAN/SKIM/READ ported to writingstyle.md ("Titles and openings" section); framework 25-frontmatter-schema.md pointer retargeted. Corpus 52→51 |
| docs/10-system-design/10-doc-architecture/70-writing-standards | 2026-07-20 | edited | DELETED per Ford: writing style is agent guidance, not system design. Full content (register + block conventions + why) ported to top-level writingstyle.md; framework 60-writing-standards.md deleted too (created and removed same sitting); doc-arch overview now "Six standards" and its writing-standards list item dropped; Corpus 53→52 |
| docs/10-system-design/30-data-model | | | vocab sweep; renumbered 20→30 (R2-D13) |
| docs/10-system-design/30-data-model/10-document-tree | | | vocab sweep |
| docs/10-system-design/30-data-model/20-rich-text | | | vocab sweep |
| docs/10-system-design/30-data-model/30-block-state | | | vocab sweep |
| docs/10-system-design/30-data-model/40-comments | | | |
| docs/10-system-design/30-data-model/50-canonical-bytes | | | vocab sweep (incl. doc title: "projection"→"rendering") |
| docs/10-system-design/30-data-model/60-mutation-model | | | was 40-mutation-model; folded into data-model as the behavior half (R2-D13) |
| docs/10-system-design/40-block-vocabulary | | | vocab sweep; OPEN: "written primarily for agents" lead; overview's claimed 10s/20s/30s numbering axis contradicts the real tree (flagged R2-D13 research) |
| docs/10-system-design/40-block-vocabulary/10-rich-text | 2026-07-16 | edited | Authored fresh (directive 13: component grouping); needs Ford read |
| docs/10-system-design/40-block-vocabulary/10-rich-text/10-paragraph | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/10-rich-text/11-heading | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/10-rich-text/12-list-item | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/10-rich-text/13-quote | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/10-rich-text/14-callout | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/10-rich-text/15-divider | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/10-rich-text/16-image | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/10-rich-text/17-video | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/20-code | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/30-structured-table | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/40-file-tree | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/50-interaction-surface | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/60-mermaid | | | vocab sweep; title strip |
| docs/10-system-design/40-block-vocabulary/70-canvas | | | vocab sweep; title strip |
| docs/10-system-design/50-package-boundaries | 2026-07-20 | edited | NEW — design residue of the packages section: why seven, dependency chain, forced-vs-judgment, 3 boundary-review callouts, schema authority (R2-D13); needs Ford's read |
| docs/20-implementation | 2026-07-20 | edited | package-map ref repointed to 10-packages/00-overview (R2-D13); otherwise unreviewed |
| docs/20-implementation/10-packages | 2026-07-20 | edited | was 50-packages/00-overview; reframed as "Package map" — inventory + enforcement kept, design spine moved to 50-package-boundaries, Makefile pointer absorbed from deleted 10-package-map (R2-D13); needs Ford's read |
| docs/20-implementation/10-packages/10-docs-model | | | vocab sweep; moved from system design (R2-D13) |
| docs/20-implementation/10-packages/20-docs-index | | | moved from system design (R2-D13) |
| docs/20-implementation/10-packages/30-docs-server | | | moved from system design (R2-D13) |
| docs/20-implementation/10-packages/40-docs-viewer | | | vocab sweep; moved from system design (R2-D13) |
| docs/20-implementation/10-packages/50-docs-workbench | | | moved from system design (R2-D13) |
| docs/20-implementation/10-packages/60-docs-cli | 2026-07-20 | edited | vocab sweep; moved (R2-D13); command table gained `audit` row (R2-D14); needs Ford's read of the new row |
| docs/20-implementation/10-packages/70-framework | 2026-07-17 | edited | REWRITTEN for narrowed "loadable skill" role (R2-D1); moved (R2-D13); 2026-07-20: "doc architecture" span label/text swept to "doc standards" (rename cascade); needs Ford's read — NOTE: its "what it owns" wording predates the standards migration, may need a touch-up |
| docs/20-implementation/10-packages/80-external-canvas | | | moved from system design (R2-D13) |
| docs/20-implementation/20-workbench | | | |
| docs/20-implementation/30-save-pipeline | | | overlap with 10-packages/30-docs-server noted (R2-D13 research) — dedupe parked |
| docs/20-implementation/40-theming | 2026-07-16 | edited | Authored fresh (directives 7-10); needs Ford's read pass |
| docs/20-implementation/40-theming/10-global-themes | 2026-07-16 | edited | Authored fresh; needs Ford's read pass; title strip |
| docs/20-implementation/40-theming/20-component-themes | 2026-07-16 | edited | Authored fresh; needs Ford's read pass; title strip |
| docs/20-implementation/40-theming/30-fonts | 2026-07-16 | edited | Authored fresh; needs Ford's read pass; title strip |
| docs/20-implementation/40-theming/40-system-ui | 2026-07-16 | edited | Authored fresh; needs Ford's read pass |
| docs/20-implementation/99-appendix/00-local-dev-loop | | | audit W3/W4: 00-slot non-overview; opens with heading |

Deleted 2026-07-20 (R2-D13): docs/20-implementation/10-package-map —
absorbed into 10-packages/00-overview (Makefile pointer carried; roles
table redundant with the richer package list).
