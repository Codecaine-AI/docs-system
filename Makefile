# docs-system — common commands.
# Ports match .claude/launch.json: 4801 canvas, 4802 self-docs, 4803 self-docs dev (HMR).

.PHONY: help install test typecheck check serve dev dev-web app canvas spa

help: ## List available commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install workspace dependencies
	bun install

test: ## Run the full test suite (scoped to packages/ — never bare `bun test`)
	bun run test

typecheck: ## Typecheck the whole workspace
	bun run typecheck

check: typecheck test ## Typecheck + full test suite

serve: ## Serve the self-docs workbench (static SPA build, cached at startup) on :4802
	bun run docs serve --root docs --port 4802

dev: ## Launch the Docs Workbench Electron app with HOT RELOAD (app UI on :4804, API on :4803)
	bun run --cwd packages/docs-workbench app:dev

dev-web: ## Serve the self-docs workbench with HOT RELOAD (vite HMR) in the browser on :4803
	bun run docs serve --root docs --dev --port 4803

app: ## Launch the Docs Workbench Electron app (cached static SPA on :4802)
	bun run --cwd packages/docs-workbench app

canvas: ## Serve the sibling canvas project's docs with hot reload on :4801
	bun run docs:canvas

spa: ## Rebuild the static SPA cache (fixes docs-cli test timeouts after docs-viewer changes)
	cd packages/docs-workbench/web && DOCS_STATIC=1 bun x vite build
