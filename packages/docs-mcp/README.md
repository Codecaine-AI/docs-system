# Codecaine Docs MCP

Direct documentation tools for Codex, Claude Code, and pi Agent, backed by the existing Docs store. No model process or Agent Kernel runtime starts. A user-level stdio connection auto-starts one authenticated loopback service; all clients use explicit workspace/project IDs.

From the Docs System checkout:

```sh
bun packages/docs-mcp/src/cli.ts install
bun packages/docs-mcp/src/cli.ts install --write
bun packages/docs-mcp/src/cli.ts doctor
```

Installation previews first, preserves unrelated client settings, and backs up changed files. Save the write command's JSON output for `restore REPORT` inspection. Codex and pi use `~/.agents/skills/codecaine-docs`; Claude uses `~/.claude/skills/codecaine-docs`. pi's extension forwards the MCP tools because pi has no native MCP client. Restart Codex/Claude; use `/reload` in pi.

## Daily Use

1. `docs_discover` finds normalized corpora in the client workspace and declared members.
2. `docs_begin` loads standards and the complete component catalog and returns `task_id`.
3. `docs_read` returns stable IDs, rendered content, and `hash`; pass that value as `expected_hash` on edits.
4. Typed edits require `task_id` and the current hash. Component sidecars require both hashes. Valid changes apply immediately.
5. `docs_check` verifies completion; `docs_end` releases the task context.

Read tools also work without opening an authoring task. `docs_guidance` accepts a component name to retrieve its canonical detailed reference. A task is only a pinned authoring context, not an internal agent run.

## Discovery

A conventional `docs/` directory must contain normalized `doc.json` bundles. At a workspace root, discovery uses `members.json`, supported package workspace globs, and explicit projects. It does not migrate Markdown or scan your whole machine. Optional `codecaine.docs.json`:

```json
{
  "name": "my-project",
  "docsRoot": "docs",
  "products": ["docs"],
  "projects": ["child-project"]
}
```

Paths stay inside the project/workspace. Symlink escapes are rejected. Unsupported recursive workspace globs are not expanded; declare member paths instead. Only the Docs product adapter is implemented initially.

## Shared Workbench

```sh
bun packages/docs-mcp/src/cli.ts discover --workspace ..
bun packages/docs-mcp/src/cli.ts ui --workspace .. --project docs-system --port 4808
```

This workbench proxies its API to the same authority as MCP clients. Existing standalone workbench and kernel sessions retain their current process-local state. Do not mix simultaneous edits to the same document through those separate authorities. Internal-agent context and session regressions are tested; no remote kernel-store adapter was added.

## Maintenance

```sh
bun packages/docs-mcp/src/cli.ts status
bun packages/docs-mcp/src/cli.ts stop
bun packages/docs-mcp/src/cli.ts snapshot --out snapshot.json
bun test packages/docs-mcp/src
bunx tsc -p packages/docs-mcp/tsconfig.json --noEmit
```

Source changes to imported code require stopping/restarting the service and reconnecting clients. Restart shared workbenches too because their service port/token are bound at launch. Canonical writing guidance reloads between tasks; installed references refresh on reinstall. Runtime changes are rejected during active authoring. The snapshot records package source hashes, repository commits, tool contracts, and guidance identity.

Runtime metadata/logs live at `~/.local/state/codecaine-docs/`, or `CODECAINE_DOCS_STATE_DIR`. `daemon.json` contains the local credential; do not share it. No API key is needed for this service. Code execution remains in the external client.

Content/component undo lasts for the service process lifetime and checks revision/project ownership. Page creation has no exposed undo because existing tree inverses are not safe after later additions.

The [setup guide](../../objectives/docs-mcp-integration/setup-guide.html) records the development installation, evidence, file locations, and user acceptance stations.

## Maintained Documentation

Start with [Docs MCP Maintenance](../../docs/40-guides/10-docs-mcp/doc.json) in the Docs corpus. It links setup and discovery, skills and component knowledge, synchronization and updates, and validation and recovery. The [Docs MCP implementation page](../../docs/30-implementation/10-packages/85-docs-mcp/doc.json) owns architecture and source locations.

The [HTML maintenance reference](../../objectives/docs-mcp-integration/maintenance-reference.html) is a generated reading copy of those pages. After changing them through Docs tools, regenerate it from this checkout with:

```sh
bun objectives/docs-mcp-integration/artifacts/export-maintenance.ts
```

The setup handoff holds dated acceptance evidence. Keep current operating instructions in the corpus, generated skill references derived from canonical sources, and client-installed copies refreshed through the installer.

## Document and Asset Management

Page operations cover whole sections, including descendants. `docs_move` and `docs_rename` rewrite descendant document links, Canvas links, and shared or external asset paths. `docs_set_title` changes the display title without changing its address. `docs_delete` supports `recursive:true` for a reviewed subtree.

Management calls preview by default. Read the source hash, review `files`, `children`, and `rewritten_sources`, then apply with `preview:false` and `expected_tree_hash` from `tree_hash`. Corpus changes invalidate the preview. Destinations must be absent and stay inside the selected project.

Use `docs_assets` to inventory assets, `docs_asset_read` for hashes, and `docs_asset_move` to transfer shared Canvas, Sequence, or media files into their new owning page. The service rewrites referencing pages. Only then delete the old owner. Deletion refuses remaining references from outside the deletion set.

`docs_management_restore` restores a management operation from `tree_change_id` after a preview. It refuses later edits or added descendants. Journals live in `.changesets/file-management/`; `docs_undo` remains the separate content-patch mechanism. Storage failures report their recovery journal and any rollback failure.

Asset upload/delete, validated component creation, annotations, staged proposals, and changeset review are also exposed. `tools` prints the authoritative schemas. Runtime startup, client configuration, publication, and model runs remain separate commands or workflows.

The canonical [Document and Asset Management guide](../../docs/40-guides/10-docs-mcp/50-document-management/doc.json) gives the procedure and source ownership. This replaces the earlier leaf-page-only limitation.
