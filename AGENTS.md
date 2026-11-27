# docs-system

Run every command from the docs-system root. Never run a bare `bun test`: it
sweeps `external/` and other trees that are not suites. Use the commands below.

## Worktree setup

In a fresh git worktree, run `make link` once before you build or test. A
worktree has no installed dependencies, and no `bun install` can run in it:
the only lockfile is core's.

- `make link` links this tree's `@codecaine-ai/docs-*` packages and their
  bins (`docs-cli`, `codecaine-docs`) into this tree's `node_modules`.
- In a worktree it also mirrors the dependencies the main checkout has
  installed: each package's own `node_modules` (such as docs-workbench's
  tailwindcss 4), the root `node_modules` and, for a worktree outside core or
  inside the main checkout, core's `node_modules`.
- One rule decides each mirrored entry: where it really lands. An installed
  package or a core member's checkout (design-system, canvas) is linked. A
  broken entry, or one that lands in the main checkout's source (`packages/`,
  `external/`), never is.
- `node_modules`, each `@scope` in it and `.bin` are real folders in this
  tree, with one symlink per entry. So a build writes its caches here, never
  into the main checkout or core.
- A rerun adds what is missing and removes a link that breaks the rule.
  `bun scripts/link-packages.ts --check` exits 1 on such a link.
- In the main checkout it links only the packages and their bins.

## Test commands

Diff base for the changed-files gate: `origin/main`.

### Tier 1: every agent change

| Check | Command |
| --- | --- |
| Typecheck | `make typecheck` |
| Lint | No code lint |
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
| Touched-area keeper suites, without quarantined tests | `make test-keepers-changed` |
| All keeper suites, without quarantined tests (CI) | `bunx playwright test --grep-invert @quarantine` |

- `make test-changed` runs the Bun areas that the files changed against
  `origin/main` reach, including uncommitted and untracked files. It reads
  imports from source text, so it can miss a computed import. A change outside
  `packages/` runs every area.
- CI (`.github/workflows/test.yml`) runs on every pull request, push to main
  and manual run:
  - one `typecheck` job with `make typecheck`;
  - all 10 Bun areas, one job per area, with `make test-<area>`: docs-model,
    docs-style, docs-index, docs-cli, docs-server, docs-viewer,
    docs-workbench, docs-mcp, docs-publish and repo
    (`bun scripts/test-packages.ts --list` prints them);
  - one `e2e` job that runs every keeper suite with
    `bunx playwright test --grep-invert @quarantine`, so CI needs no area
    selection.
- Locally, `make test-keepers-changed` runs the keeper suites that the files
  changed against `origin/main` reach, without quarantined tests.
  `bun scripts/test-packages.ts --keepers origin/main` prints those suites. It
  applies the product-area map and routing rules below.
- Before a PR, also run the agent check: start the real app with
  `bun run docs serve --standalone --root <scratch docs root> --port <port>`
  and use the changed flow. Never point it at real user docs. Attach its PR
  evidence with the ui-proof skill. The agent check runs outside CI.

### Tier 3: before a release or a big merge

| Check | Command |
| --- | --- |
| Full suite | `make check` (typecheck, then all 10 Bun areas) |
| All keeper suites, with quarantined tests | `bunx playwright test` |
| Screenshot comparisons | None yet. Baselines wait until docs-viewer and docs-workbench move to Svelte. |

### Product areas

Each area's keeper suite is its known-flow registry: one case per main user
flow below. `bun scripts/test-packages.ts --keepers` reads this table.

| Area | Main user flows | Keeper suite | Package globs |
| --- | --- | --- | --- |
| Viewer and navigation | Open a doc from the tree, follow a doc link, side peek, hash routes | `e2e/viewer.spec.ts` | `packages/docs-viewer/src/render/**`, `packages/docs-viewer/src/peek/**`, `packages/docs-viewer/src/styles/{rich-text,list-markers}.css`, `packages/docs-workbench/web/src/_components/{AppShell,RouterShell,TopbarTitle,TopbarActions}/**`, `packages/docs-workbench/web/src/_lib/hash-route.ts`, `packages/docs-workbench/web/src/shared/doc-title.ts`, `packages/docs-index/**` |
| Editing and autosave | Edit text in place, autosave, undo, page title edit, stale-save and draft-lock conflicts, live updates | `e2e/editor.spec.ts` | `packages/docs-viewer/src/editor/**`, `packages/docs-workbench/web/src/_components/DocPage/**`, `packages/docs-workbench/web/src/data/api/{docs,draft-lock,events}.ts`, `packages/docs-workbench/web/src/data/{client,session,shared-events}.ts` |
| Style rail and themes | Open Style, move a knob, save, export and import a theme, reset, code theme | `e2e/style-rail.spec.ts` | `packages/docs-workbench/web/src/_components/{StyleRailPanel,StyleRailOverlay}/**`, `packages/docs-workbench/web/src/theme/**`, `packages/docs-workbench/web/src/shared/style-rail-settings/**`, `packages/docs-workbench/web/src/shared/{docs-fonts,useCodeTheme}.ts`, `packages/docs-workbench/web/src/_lib/{style-rail-*,theme-boot*,useStyleInspector*,useTheme*,code-theme-style,grain-code-mask}.ts`, `packages/docs-workbench/web/src/data/api/{themes,config}.ts`, `packages/docs-workbench/web/src/data/project-storage.ts`, `themes/**` |
| Structured blocks | Read and edit a structured table, state shape, interaction surface, file tree and code block | `e2e/blocks.spec.ts` | `packages/docs-viewer/src/components/**`, `packages/docs-viewer/src/styles/code.css` |
| Embeds and full-screen viewers | Open a sequence, canvas or image embed full screen, zoom, Fit, close with Escape | `e2e/embeds.spec.ts` | `packages/docs-workbench/web/src/shared/_components/{SequenceEmbed,CanvasEmbed}/**`, `packages/docs-viewer/src/transitions/**`, `packages/docs-viewer/src/styles/{image-grid,image-viewer}.css` |
| AI panel and annotations | Show the AI panel, annotate a block, stage, accept and reject a proposal | `e2e/ai-panel.spec.ts` | `packages/docs-workbench/web/src/_components/DocPage/lab/**`, `packages/docs-viewer/src/lab/**`, `packages/docs-viewer/src/annotate/**`, `packages/docs-workbench/web/src/data/api/{annotations,changesets,proposals}.ts` |
| Export and publish | Export the open page as one PDF, export selected pages as a ZIP of PDFs (the static-site export is CLI-only and docs-publish has no workbench UI: their Bun areas own them) | `e2e/export.spec.ts` | `packages/docs-workbench/web/src/_components/ExportDialog/**`, `packages/docs-workbench/src/{export,pdf-export}.ts`, `packages/docs-publish/**` |
| MCP, CLI and writing style | Agent tools, CLI commands and prose-style lints (no browser flow) | None: the docs-mcp, docs-cli and docs-style Bun areas own these flows | `packages/docs-mcp/**`, `packages/docs-cli/**`, `packages/docs-style/**` |

`packages/docs-style` is the prose-style rule engine (rules, judge, sweep) that
the CLI runs. No UI flow reaches it, so its owner tests are its Bun area.

Routing rules:

- A file that matches more than one area runs every matched keeper suite.
- A changed keeper suite (`e2e/*.spec.ts`) runs itself.
- Any other file, such as `packages/docs-mcp/**`, `docs/**` or `scripts/**`,
  runs no keeper suite: its Bun area owns it.
- These files match no single area and run all keeper suites. This fails
  toward running more.
  - A UI file under `packages/docs-viewer/src` or
    `packages/docs-workbench/web/src` that matches no area. That covers the
    shared shell: `App.tsx`, `main.tsx`, `index.css`, `globals.d.ts`,
    `playground/**`, `data/api/{http,index}.ts`,
    `_lib/{constants,utils,useDocsShellEffects}.ts`, and docs-viewer's
    `client.tsx`, `index.ts` and `ui/**`.
  - Any file under `packages/docs-workbench/src` except `export.ts` and
    `pdf-export.ts`, which the Export area owns: the server, `run-serve.ts`,
    `spa.ts`, `shared-api.ts`, `central-service.ts` and `index.ts`. Every
    keeper flow starts this server through `e2e/fixtures.ts`.
  - The SPA build files `packages/docs-workbench/web/{index.html,playground.html,vite.config.ts}`.
  - The e2e support files: `playwright.config.ts`, `e2e/fixtures.ts`,
    `e2e/fixtures/**` and `e2e/support/**`.
  - The shared document packages `packages/docs-model/**` and
    `packages/docs-server/**`: every keeper flow reads and writes docs
    through them.
  - The dependency files: the root `package.json` and `bun.lock`, and
    `packages/docs-workbench/package.json` and
    `packages/docs-viewer/package.json`.

### Budget, parallelism and runner setup

- Budget: 10 to 15 minutes of Tier 2 CI wall time. The Bun area jobs and the
  e2e job run in parallel.
- Measured 2026-11-26 on PR #62: the longest Bun area job took 73 s.
- Playwright (`playwright.config.ts`) runs one chromium project with
  `fullyParallel: true` and `retries: 0`. Each worker gets a fresh isolated
  fixture docs root per run, copied from `e2e/fixtures/corpus` into
  `test-results/fixture-roots/<run id>/worker-<n>`, and starts its own server
  on it (`e2e/fixtures.ts`). Tests never share or write the real corpus.
- An over-budget run is a finding. Never add retries or cut keeper flows to fit.

### Fallbacks

- Without a changed-files gate, Tier 2 runs the full suite of every touched
  package (`make test-<area>` for each).
- With no stated commands, read the CI workflow, package scripts and task
  runner config, and use the commands CI runs. Do not invent a command CI
  never runs.
- `scripts/prune inventory` saves this section as `instructions` in
  `commands.json` without setting commands. Edit `commands.json` to match
  before `verify --baseline`.

### Quarantine

None.

- To quarantine a flaky keeper flow, tag its title `@quarantine` and add a row
  here with the title, the owner and a 14-day expiry. Tier 2 leaves it out
  with `--grep-invert @quarantine`; Tier 3 runs it. Fix it before the expiry.
  If you delete it, give its flow another owner test first.
