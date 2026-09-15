<current_state>
<last_updated>2026-09-08</last_updated>
<status>Implementation and automated QA complete; three client bindings installed with backups. The user reports successful discovery and a documentation edit in the GameCube harness. Per-client implicit skill selection remains a separate acceptance check.</status>
<completed>
- New packages/docs-mcp: 45 tools, discovery, authenticated shared service, lifecycle, direct edits, shared guidance, snapshots, Codex/Claude/pi installation.
- Root-scoped draft locks and undo, canonical path coordination, shared workbench proxy. Both built-in Docs context loaders use shared renderer.
- 31 MCP tests and 271 service/internal regression tests passed; package typecheck and Core doctor passed.
- Two real doc pages created through MCP in Docs System and Canvas, including File Tree typed operations; zero final findings.
- 29 client files installed, 2 prior configs backed up. Doctor current.
- setup-guide.html authored with five stations, file tree, evidence, controls, and limitations; HTML structure/anchors/local links checked.
</completed>
<next_actions>Read maintenance-reference.html for the maintained setup and update procedures. User-reported GameCube discovery and editing succeeded; repeat implicit skill-selection acceptance in each client as needed.</next_actions>
<risks_or_open_questions>
- Browser policy rejected file:// navigation to setup-guide.html; no workaround attempted. Live Docs MCP page is verified and kept open in Chrome.
- Separate existing kernel/standalone workbenches retain process-local state. Internal agent regressions pass, but simultaneous edits through separate authorities are not coordinated. Shared ui command coordinates MCP/UI.
- Source code changes require service/client/UI restart; standards refresh between tasks. New pages have no exposed undo.
- Existing dirty work preserved; no commits or publication. Core doctor reports pre-existing registry/cache warnings.
</risks_or_open_questions>
<important_paths>
- proposals/codecaine-mcp-and-skills.html: agreed design linked to handoff.
- objectives/docs-mcp-integration/setup-guide.html: deliverable.
- artifacts/install-result.json: installation and backup paths.
- artifacts/dogfood-results.json: real-tool evidence.
- artifacts/development-snapshot.json: resolved hashes and versions.
- artifacts-mcp-tests.log, artifacts/regression-tests.log, artifacts-typecheck.log, artifacts/clients-qa.md.
</important_paths>
<active_runs>
- Shared daemon PID 79879, http://127.0.0.1:65154. Private state/log in ~/.local/state/codecaine-docs. Stop with bun packages/docs-mcp/src/cli.ts stop.
- Shared workbench PID 83767, exec session 21955, http://127.0.0.1:4808. Stop via Ctrl-C in that session; restart with bun packages/docs-mcp/src/cli.ts ui --workspace .. --project docs-system --port 4808.
- Chrome live Docs MCP page marked deliverable. No internal model agents or GameCube server started.
</active_runs>
</current_state>

## Maintenance Documentation, September 11, 2026

- Added the Guides tier and Docs MCP maintenance index with four detailed procedures. Expanded the implementation page with process ownership, source locations, and ecosystem limits. Linked it from the package index.
- Authored through the real MCP bridge. Seven new or expanded pages passed completion checks with zero findings. The existing package index reports 24 pre-existing em-dash findings; its new typed Docs MCP link has no finding. Existing index prose was preserved.
- Exported maintenance-reference.html from canonical reads and validated 15 typed document/source references. Evidence is in artifacts/maintenance-docs-results.json and artifacts/maintenance-reference-checks.json.
- The user reported successful discovery and a real documentation edit in GameCube. This is user-reported acceptance, not a new automated test log or proof of implicit skill selection across all three clients.

## Page Lifecycle Tools

- Added docs_move, docs_rename, and preview/apply docs_delete over existing tree operations. Creation remains docs_create. The MCP now advertises 48 tools.
- Verified local Canvas bytes survive move/rename, typed inbound links update, and deletion refuses shared assets, inbound links, stale previews, child pages, and path escapes. Operations currently support leaf pages and do not rename document titles.
- 35 MCP tests passed, including actual two-client move/rename/delete protocol exercise; TypeScript passed. Canonical implementation and maintenance pages passed docs_check; HTML reference regenerated.
- Shared daemon restarted to load new tool code. Clients need to reconnect and begin fresh tasks. No live user page was moved or deleted; lifecycle tests used temporary corpora.

## Subtree and Asset Management Supersedes Leaf-only Tools

- Shared service management now previews and applies subtree moves/renames, recursive deletion, title changes, and asset relocation. It rewrites descendant links and shared/external asset paths. Stored journals support guarded docs_management_restore.
- Added asset inventory/upload/read/delete, normalized component creation, search/backlinks, annotation operations, proposal review, and changeset review. Existing content/component editing remains available.
- The blocked cleanup is tested in a temporary corpus: renumber section descendants, relocate a valid shared Canvas, delete its previous owner, and pass docs_check on the surviving overview.
- 265 tests passed across MCP, Docs Server, shared UI, and built-in authoring/session regressions. A final 43-test MCP run passed after the proposal undo adapter adjustment; TypeScript passed.
- Four maintained pages passed docs_check. Source skill updated and installation refreshed with backups. No live user cleanup was performed; only reference documentation changed in the real corpus.
