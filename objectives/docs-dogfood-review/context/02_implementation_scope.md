<implementation_scope>
    <owned_surfaces>
        - `docs/**/doc.json`: all 37 corpus bundles — content, block choices,
          references.
        - `packages/docs-viewer/src/components/**`: the seven read-surface
          component folders (descriptors, block components, editor-nodes).
        - `packages/docs-viewer/src/editor/**`: TipTap editor UX (slash menu,
          input rules, menus, node views).
        - `packages/docs-viewer/src/render/**`: DocBlockRenderer, descriptor
          helpers, block registry.
        - `packages/docs-workbench/web/**`: workbench SPA pages, shell, theme
          (theme/notion-palette.css + semantic.css).
        - `packages/docs-model/src/__tests__/goldens/**` + the two corpus test
          files: kept in lockstep with doc edits.
    </owned_surfaces>

    <read_only_references>
        - `packages/docs-model/src/components/**`: state schemas/actions are
          the source of truth docs must match; changing the model is a scoped
          decision, not a doc-review side effect.
        - `reference/` (AFFiNE/BlockSuite), `external/canvas`: inspiration and
          embedded neighbor respectively.
        - `BLOCK-ARCHITECTURE.md`, `BLOCK-ARCHITECTURE-PLAN.md` (repo root,
          untracked): design rationale for the current shape.
    </read_only_references>

    <generated_outputs>
        - `packages/docs-model/src/__tests__/goldens/projection/*.md`:
          regenerate via projectToMarkdown per doc (see the normalization
          scripts pattern under .tmp/).
        - `docs/.index/backlinks.db`: `bun run docs backlinks rescan docs`.
    </generated_outputs>

    <commands_and_entrypoints>
        - `make dev`: THE way to run the app — Electron shell, API :4803, UI
          :4804 (vite HMR, IPv4-pinned, strictPort). Ford's primary surface.
        - `make check`: typecheck + full suite (835 tests). `make spa` first
          if viewer code changed.
        - `bun run docs links check docs` / `bun run docs backlinks rescan docs`:
          reference integrity (positional docsRoot, not --root).
        - `bun test packages/docs-model` / `packages/docs-viewer`: targeted
          gates during a directive.
    </commands_and_entrypoints>

    <adjacent_surfaces_requiring_caution>
        - `packages/docs-workbench/electron/main.cjs` + src/run-serve.ts: the
          dev-mode process lifecycle (port pinning, child teardown, IPv4) was
          hard-won on 2026-07-15; touch only with the full launch/quit/relaunch
          verification cycle.
        - `packages/docs-server`: mutation authority; editor UX changes that
          need new server behavior are a scoped decision with route tests.
    </adjacent_surfaces_requiring_caution>

    <out_of_scope>
        - Package-layout restructuring (framework/index/cli boundary
          questions) — documented in 30-packages, decided separately.
        - Canvas engine internals.
        - New block types.
    </out_of_scope>
</implementation_scope>
