# Review ledger — docs dogfood review

One row per corpus doc. Verdict: `clean` (read, no changes) / `edited`
(changed during review) / `follow-up` (issue parked in current_state.md) /
blank (not yet reviewed). Keep rows current within the sitting.

Paths reflect the 2026-07-17 renumber (data-model→20, block-vocabulary→30,
mutation-model→40, packages→50; two new system-design docs at 00/10).
"vocab sweep" in Actions = the 2026-07-17 projection→render vocabulary
sweep (edits landed, Ford has not read the doc yet).

| Doc | Reviewed | Verdict | Actions |
|---|---|---|---|
| docs/00-foundation/00-manifesto | 2026-07-17 | edited | REWRITTEN end-to-end (knowledge-transfer thesis, directive R2-D1); supersedes round-1 golden fail; needs Ford's read |
| docs/10-system-design/00-interaction-surfaces | 2026-07-17 | edited | NEW — authored fresh (R2-D1: dual interaction surfaces); needs Ford's read. R2-D3: canvas embed header framing removed (diagram sits bare; hover controls). R2-D4: section previews now content-fitted — no frame rect/label chip, 16px world padding, natural image height (letterbox removed); needs new `fit=content` support in the CANVAS repo (uncommitted there) — awaiting Ford's visual check |
| docs/10-system-design/10-doc-architecture | 2026-07-17 | edited | NEW — authored fresh (R2-D1: structure decisions + rationale, absorbs framework standards' why); needs Ford's read |
| docs/10-system-design/20-data-model/00-overview | | | vocab sweep |
| docs/10-system-design/20-data-model/10-document-tree | | | vocab sweep |
| docs/10-system-design/20-data-model/20-rich-text | | | vocab sweep |
| docs/10-system-design/20-data-model/30-block-state | | | vocab sweep |
| docs/10-system-design/20-data-model/40-comments | | | |
| docs/10-system-design/20-data-model/50-canonical-bytes | | | vocab sweep (incl. doc title: "projection"→"rendering") |
| docs/10-system-design/30-block-vocabulary/00-overview | | | vocab sweep; OPEN: "written primarily for agents" lead — Ford's call vs symmetric-surfaces stance |
| docs/10-system-design/30-block-vocabulary/10-rich-text/00-overview | 2026-07-16 | edited | Authored fresh (directive 13: component grouping); needs Ford read |
| docs/10-system-design/30-block-vocabulary/10-rich-text/10-paragraph | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/10-rich-text/11-heading | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/10-rich-text/12-list-item | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/10-rich-text/13-quote | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/10-rich-text/14-callout | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/10-rich-text/15-divider | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/10-rich-text/16-image | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/10-rich-text/17-video | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/20-code | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/30-structured-table | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/40-file-tree | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/50-interaction-surface | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/60-mermaid | | | vocab sweep |
| docs/10-system-design/30-block-vocabulary/70-canvas | | | vocab sweep |
| docs/10-system-design/40-mutation-model | | | |
| docs/10-system-design/50-packages/00-overview | | | vocab sweep |
| docs/10-system-design/50-packages/10-docs-model | | | vocab sweep |
| docs/10-system-design/50-packages/20-docs-index | | | |
| docs/10-system-design/50-packages/30-docs-server | | | |
| docs/10-system-design/50-packages/40-docs-viewer | | | vocab sweep |
| docs/10-system-design/50-packages/50-docs-workbench | | | |
| docs/10-system-design/50-packages/60-docs-cli | | | vocab sweep |
| docs/10-system-design/50-packages/70-framework | 2026-07-17 | edited | REWRITTEN for narrowed "loadable skill" role (R2-D1); needs Ford's read |
| docs/10-system-design/50-packages/80-external-canvas | | | |
| docs/20-implementation/00-overview | | | |
| docs/20-implementation/10-package-map | | | vocab sweep |
| docs/20-implementation/20-workbench | | | |
| docs/20-implementation/30-save-pipeline | | | |
| docs/20-implementation/40-theming/00-overview | 2026-07-16 | edited | Authored fresh (directives 7-10: theming section); needs Ford's read pass |
| docs/20-implementation/40-theming/10-global-themes | 2026-07-16 | edited | Authored fresh; needs Ford's read pass |
| docs/20-implementation/40-theming/20-component-themes | 2026-07-16 | edited | Authored fresh; needs Ford's read pass |
| docs/20-implementation/40-theming/30-fonts | 2026-07-16 | edited | Authored fresh; needs Ford's read pass |
| docs/20-implementation/40-theming/40-system-ui | 2026-07-16 | edited | Authored fresh; needs Ford's read pass |
| docs/20-implementation/99-appendix/00-local-dev-loop | | | |
