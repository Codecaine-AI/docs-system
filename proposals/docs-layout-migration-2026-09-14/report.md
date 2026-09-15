# Docs Ordering Migration

12 corpora applied; 3 blocked by legacy storage. One agent was assigned to each of the 15 old-order corpora. Docs System was already current.

Implementation moves to `30`; existing top-level Agents sections move to `20`. Projects without an Agents section reserve `20` without new pages. Foundation, System Design, and existing project-specific sections retain their contents.

| Corpus | Result | Details |
| --- | --- | --- |
| [GameCube Harness](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness>) | Applied | [migrate_gamecube.json](migrate_gamecube.json) |
| [Token Burner](</Users/Ford/Github Repos/Codecaine/Apps/token-burner>) | Applied | [migrate_token_burner.json](migrate_token_burner.json) |
| [Variator](</Users/Ford/Github Repos/Codecaine/tools/variator>) | Applied | [migrate_variator.json](migrate_variator.json) |
| [Personal Budget](</Users/Ford/Github Repos/Lascari AI/personal-budget>) | Applied | [migrate_budget.json](migrate_budget.json) |
| [Personal Site](</Users/Ford/Github Repos/Lascari AI/personal-site>) | Applied | [migrate_personal_site.json](migrate_personal_site.json) |
| [Core Canvas](</Users/Ford/Github Repos/Codecaine/Core/canvas>) | Applied | [migrate_core_canvas.json](migrate_core_canvas.json) |
| [Core Canvas / Docs Framework](</Users/Ford/Github Repos/Codecaine/Core/canvas/tools/docs-framework>) | Applied | [migrate_core_canvas_framework.json](migrate_core_canvas_framework.json) |
| [Docs System / External Canvas](</Users/Ford/Github Repos/Codecaine/Core/docs-system/external/canvas>) | Applied | [migrate_docs_external_canvas.json](migrate_docs_external_canvas.json) |
| [Budget / Docs Framework](</Users/Ford/Github Repos/Lascari AI/personal-budget/packages/docs-framework>) | Applied | [migrate_budget_framework.json](migrate_budget_framework.json) |
| [Budget / Framework / Canvas](</Users/Ford/Github Repos/Lascari AI/personal-budget/packages/docs-framework/external/canvas>) | Applied | [migrate_budget_canvas.json](migrate_budget_canvas.json) |
| [Budget / Framework / Canvas / Framework](</Users/Ford/Github Repos/Lascari AI/personal-budget/packages/docs-framework/external/canvas/tools/docs-framework>) | Applied | [migrate_budget_nested_framework.json](migrate_budget_nested_framework.json) |
| [Kurate Catalog](</Users/Ford/Github Repos/Clients/linkt/master/mplrisk-ai/clients/kurate/catalog>) | Applied | [migrate_kurate.json](migrate_kurate.json) |
| [Spectre](</Users/Ford/Github Repos/Codecaine/Apps/spectre>) | Blocked: legacy format | [migrate_spectre.json](migrate_spectre.json) |
| [Spectre / Canvas](</Users/Ford/Github Repos/Codecaine/Apps/spectre/packages/canvas>) | Blocked: legacy format | [migrate_spectre_canvas.json](migrate_spectre_canvas.json) |
| [Spectre / Pi Agent Kernel](</Users/Ford/Github Repos/Codecaine/Apps/spectre/packages/pi-agent-kernel>) | Blocked: legacy format | [migrate_spectre_kernel.json](migrate_spectre_kernel.json) |

## Verification

Completed migrations preserve block IDs, types, nesting, examples, and detailed context. Changes are folder locations, reference paths, and minimal ordering examples. Each agent compared final link checks against its pre-migration baseline. Existing unrelated broken links and writing findings remain. Native moves shortened some bundle-relative Canvas and Sequence paths; those were restored and verified through the viewer path resolvers.

Two framework copies passed 10 focused tests each. The deepest Budget framework could not run tests because its dependencies are absent; structural and link checks passed. No commits or pushes were made.

## Remaining Work

Spectre and its nested Canvas and Pi Agent Kernel corpora use the retired `flavour` field. Current Docs discovery rejects all three, so no reorder was applied there. They require a supported storage-format migration or compatible move tool before the same path-only reorder can run.

## Recovery

Each details file includes the native move recovery IDs and available patch IDs. Native move journals remain under the affected corpus `.changesets/file-management/`. Full baseline and final snapshots are retained in the linked `/tmp/docs-layout-review` reports.

Discovery covered live repositories, not archived backups or cloud storage.
