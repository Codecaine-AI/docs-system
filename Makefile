# docs-system — common commands.
# Ports match .claude/launch.json: 4801 canvas, 4802 self-docs, 4803 self-docs dev (HMR), 4805 docs-lab UI.

.PHONY: help install link test typecheck check serve dev dev-web docs app canvas spa \
	test-docs-model test-docs-style test-docs-index test-docs-cli test-docs-server \
	test-docs-viewer test-docs-workbench test-docs-mcp test-docs-publish test-repo

help: ## List available commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install workspace dependencies
	cd .. && bun install

test: ## Run every test area (scripts/test-packages.ts; never bare `bun test`)
	bun run test

link: ## Link this tree's packages so a worktree tests its own code; print resolution
	bun scripts/link-packages.ts

# One target per test area (scripts/test-packages.ts). CI runs these.
test-docs-model: ## Test area: docs-model
	bun scripts/test-packages.ts docs-model
test-docs-style: ## Test area: docs-style
	bun scripts/test-packages.ts docs-style
test-docs-index: ## Test area: docs-index
	bun scripts/test-packages.ts docs-index
test-docs-cli: ## Test area: docs-cli
	bun scripts/test-packages.ts docs-cli
test-docs-server: ## Test area: docs-server
	bun scripts/test-packages.ts docs-server
test-docs-viewer: ## Test area: docs-viewer
	bun scripts/test-packages.ts docs-viewer
test-docs-workbench: ## Test area: docs-workbench (src and web/src)
	bun scripts/test-packages.ts docs-workbench
test-docs-mcp: ## Test area: docs-mcp (runs from its folder, own bunfig)
	bun scripts/test-packages.ts docs-mcp
test-docs-publish: ## Test area: docs-publish
	bun scripts/test-packages.ts docs-publish
test-repo: ## Test area: root suites (evals/quality-climb, import-boundaries)
	bun scripts/test-packages.ts repo

typecheck: ## Typecheck the whole workspace
	bun run typecheck

check: typecheck test ## Typecheck + full test suite

serve: ## Serve the self-docs workbench (static SPA build, cached at startup) on :4802
	bun run docs serve --root docs --port 4802

dev: ## Launch the Docs Workbench Electron app with HOT RELOAD (app UI on :4804, API on :4803)
	bun run --cwd packages/docs-workbench app:dev

dev-web: ## Serve the self-docs workbench with HOT RELOAD (vite HMR) in the browser on :4803
	bun run docs serve --root docs --dev --port 4803

# Vite HMR dev-server UI on :4805 (proxying the API on :4803).
docs: ## Docs lab: dev-web UI on :4805 (API :4803)
	@if [ "$$(uname)" = "Darwin" ]; then \
		( for i in $$(seq 1 60); do \
			curl -sf http://localhost:4805/ >/dev/null 2>&1 && { open http://localhost:4805; exit 0; }; \
			sleep 0.5; \
		done ) & \
	fi; \
	bun run docs serve --root docs --dev --port 4803 --ui-port 4805

app: ## Launch the Docs Workbench Electron app (cached static SPA on :4802)
	bun run --cwd packages/docs-workbench app

canvas: ## Serve the sibling canvas project's docs with hot reload on :4801
	bun run docs:canvas

spa: ## Rebuild the static SPA cache (fixes docs-cli test timeouts after docs-viewer changes)
	cd packages/docs-workbench/web && DOCS_STATIC=1 bun x vite build
