# docs-system — common commands.
# Ports match .claude/launch.json: 4801 canvas, 4802 self-docs, 4803 self-docs dev (HMR), 4805 docs-lab UI.

.PHONY: help install test typecheck check serve dev dev-web docs app canvas spa

help: ## List available commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install workspace dependencies
	cd .. && bun install

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

# Combines the vite HMR dev-server UI on :4805 (proxying the API on :4803) + the docs kernel so annotate/AI editing works.
docs: ## Docs lab: dev-web UI on :4805 (API :4803) + docs kernel :4840 (DOCS_KERNEL_PORT)
	@if [ "$$(uname)" = "Darwin" ]; then \
		( for i in $$(seq 1 60); do \
			curl -sf http://localhost:4805/ >/dev/null 2>&1 && { open http://localhost:4805; exit 0; }; \
			sleep 0.5; \
		done ) & \
	fi; \
	KERNEL_PORT="$${DOCS_KERNEL_PORT:-4840}"; \
	if curl -sf http://127.0.0.1:$$KERNEL_PORT/health >/dev/null 2>&1; then \
		echo "docs kernel: already running on :$$KERNEL_PORT — leaving it"; \
		bun run docs serve --root docs --dev --port 4803 --ui-port 4805; \
	else \
		echo "docs kernel: starting on :$$KERNEL_PORT"; \
		env -u DOCS_KERNEL_DOCS_ROOT DOCS_KERNEL_PORT=$$KERNEL_PORT bun run --cwd packages/docs-kernel start & KERNEL_PID=$$!; \
		trap 'kill $$KERNEL_PID 2>/dev/null' EXIT INT TERM; \
		bun run docs serve --root docs --dev --port 4803 --ui-port 4805; \
	fi

app: ## Launch the Docs Workbench Electron app (cached static SPA on :4802)
	bun run --cwd packages/docs-workbench app

canvas: ## Serve the sibling canvas project's docs with hot reload on :4801
	bun run docs:canvas

spa: ## Rebuild the static SPA cache (fixes docs-cli test timeouts after docs-viewer changes)
	cd packages/docs-workbench/web && DOCS_STATIC=1 bun x vite build
