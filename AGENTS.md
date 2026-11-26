# docs-system

Run every command from the docs-system root. Never run a bare `bun test`: it
sweeps `external/` and other trees that are not suites. Use the commands below.

## Test commands

Diff base for the changed-files gate: `origin/main`.

### Tier 1: every agent change

| Check | Command |
| --- | --- |
| Typecheck | `make typecheck` |
| Lint | No code lint. (`bun run docs audit` lints documents, not code.) |
| Focused tests on changed files | The command below |

```bash
{ git diff --name-only --diff-filter=d origin/main; git ls-files --others --exclude-standard; } \
  | grep -E '\.test\.tsx?$' | grep -v '^packages/docs-mcp/' | sed 's#^#./#' | xargs -r bun test
```

- The focused command runs each changed or new test file from the root, so the
  root `bunfig.toml` preloads apply. Keep the `./` prefix: without it
  `bun test` treats a path as a name filter.
- docs-mcp tests run from their own folder with their own preloads. For a
  changed docs-mcp test, run `make test-docs-mcp`.

### Tier 2: before a PR and in PR CI

| Check | Command |
| --- | --- |
| Changed-files gate | `make test-changed` |
| Touched-area keeper suites, without quarantined tests | `bunx playwright test <keeper suite> --grep-invert @quarantine` |

- `make test-changed` runs the Bun areas that the files changed against
  `origin/main` reach, including uncommitted and untracked files. It reads
  imports from source text, so it can miss a computed import. A change outside
  `packages/` runs every area.
- CI (`.github/workflows/test.yml`) runs all 10 Bun areas on every pull
  request, push to main and manual run, one job per area, with
  `make test-<area>`. The areas are docs-model, docs-style, docs-index,
  docs-cli, docs-server, docs-viewer, docs-workbench, docs-mcp, docs-publish
  and repo. `bun scripts/test-packages.ts --list` prints them.
- The keeper suites are listed in the product-area map below. Until an area's
  suite exists, `e2e/smoke.spec.ts` is the only keeper flow.
- Before a PR, also run the agent check: start the real app with
  `bun run docs serve --standalone --root <scratch docs root> --port <port>`
  and use the changed flow. Never point it at real user docs.

### Tier 3: before a release or a big merge

| Check | Command |
| --- | --- |
| Full suite | `make check` (typecheck, then all 10 Bun areas) |
| All keeper suites, with quarantined tests | `bunx playwright test` |
| Screenshot comparisons | None yet. Baselines wait until docs-viewer and docs-workbench move to Svelte. |

### Product areas

Each area's keeper suite is its known-flow registry. A suite marked "planned"
does not exist yet.

| Area | Main user flows | Keeper suite | Package globs |
| --- | --- | --- | --- |
| Viewer and navigation | Open a doc from the tree, follow a doc link, side peek, hash routes | `e2e/viewer.spec.ts` (planned; `e2e/smoke.spec.ts` today) | `packages/docs-viewer/src/render/**`, `packages/docs-workbench/web/src/_components/{AppShell,RouterShell,TopbarTitle,TopbarActions}/**`, `packages/docs-index/**` |
| Editing and autosave | Edit text in place, autosave, undo, page title edit, stale-save and draft-lock conflicts | `e2e/editor.spec.ts` (planned) | `packages/docs-viewer/src/editor/**`, `packages/docs-workbench/web/src/_components/DocPage/**`, `packages/docs-server/**`, `packages/docs-model/**` |
| Style rail and themes | Open Style, move a knob, save, export and import a theme, reset | `e2e/style-rail.spec.ts` (planned) | `packages/docs-workbench/web/src/_components/{StyleRailPanel,StyleRailOverlay}/**`, `packages/docs-workbench/web/src/theme/**`, `themes/**` |
| Structured blocks | Read and edit a structured table, state shape, interaction surface and file tree | `e2e/blocks.spec.ts` (planned) | `packages/docs-viewer/src/components/**`, `packages/docs-model/src/components/**` |
| Embeds and full-screen viewers | Open a sequence or canvas embed full screen, zoom, Fit, close with Escape | `e2e/embeds.spec.ts` (planned) | `packages/docs-workbench/web/src/shared/_components/{SequenceEmbed,CanvasEmbed}/**`, `packages/docs-viewer/src/transitions/**` |
| AI panel and annotations | Show the AI panel, annotate a block, stage, accept and reject a proposal | `e2e/ai-panel.spec.ts` (planned) | `packages/docs-workbench/web/src/_components/DocPage/lab/**`, `packages/docs-server/src/changesets/**` |
| Export and publish | Export a static site or a PDF, publish a draft editor | `e2e/export.spec.ts` (planned) | `packages/docs-workbench/web/src/_components/ExportDialog/**`, `packages/docs-workbench/src/{export,pdf-export}.ts`, `packages/docs-publish/**` |
| MCP and CLI | Agent tools and CLI commands (no browser flow) | None: the docs-mcp and docs-cli Bun areas own these flows | `packages/docs-mcp/**`, `packages/docs-cli/**` |

### Fallback

- Without a changed-files gate, Tier 2 runs the full suite of every touched
  package (`make test-<area>` for each).
- With no stated commands, read the CI workflow, package scripts and task
  runner config, and use the commands CI runs. Do not invent a command CI
  never runs.

### Quarantine

| Test | Owner | Expiry |
| --- | --- | --- |
| docs-viewer: "DocEditor save boundary > the DOM-mutation + input-event pipeline reaches ProseMirror state (dom-sync)" | Ford | 2026-12-26 |

- This is a Bun test, not a Playwright keeper flow. The `@quarantine` title tag
  and `--grep-invert @quarantine` apply to keeper flows only, so this test is
  listed here and still runs in Tier 2 and CI.
- It times out at 10 s in about 2 of 7 runs, locally and in CI. Fix it before
  the expiry. If it is deleted, its flow must keep an owner test first.

### Tier 2 budget

- Budget: 10 to 15 minutes of CI wall time. The jobs run in parallel.
- Measured 2026-11-26 on PR #62: the longest job took 73 s.
- An over-budget run is a finding. Never add retries or cut keeper flows to fit.
