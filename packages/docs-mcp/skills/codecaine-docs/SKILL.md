---
name: codecaine-docs
description: Read and update Codecaine documentation through connected Docs tools. Use when a project has a Codecaine docs corpus or the user asks to document implementation changes, explain existing documentation, or edit documentation components.
metadata:
  version: "0.1.0"
  product: docs
compatibility: Requires the Codecaine Docs tool connection. Codex and Claude Code use MCP; pi Agent uses the installed bridge extension.
---

# Codecaine Docs

Use the connected Docs tools for documentation reads and edits. They preserve typed document structure, component sidecars, revisions, and validation. Do not edit `doc.json` or Canvas/Sequence sidecars with filesystem writes.

## Read or Edit

1. Discover projects in the active workspace through the discovery tool. Select the requested project explicitly. For a request covering several projects, discover each target through the same connection.
2. For reading, use the document tree and read tools. For editing, begin a documentation task with `docs_begin` and read the returned standards, component catalog, and snapshot. Keep that task's token for its edits.
3. Read the target document and its relevant neighbors. Use the component catalog to choose the form that explains the subject. Load a component's detailed reference when needed; use the advertised tool schemas for editing mechanics.
4. Apply supported typed operations with the current document revision. Edits become visible immediately. On a revision conflict, read the current content and reconcile the requested change before retrying.
5. Run the completion check, repair required findings, and report which documents changed and any unresolved findings. If one project fails, retain and report the successful project edits separately.

For an implementation change, inspect the relevant source as evidence before describing current behavior. Distinguish proposed behavior from verified behavior. Publication is a separate action; documentation edits do not deploy a website.

The reading order is Foundation, System Design, Agents, then Implementation. Implementation briefly maps the design to the actual codebase and explains key implementation choices. Keep agent definitions in Agents. Preserve existing page structure, formatting guidance, examples, and detailed rationale when adjusting these layers.

## Guidance and Components

The service loads current guidance from the same corpus and manifests used by the built-in Docs agents. The installed [component catalog](references/components.md) shows each component's purpose, selection criteria, and focused reference. [Standards](references/standards.md) records the installed guidance snapshot. Treat the fresh `docs_begin` response as authoritative when the development checkout has changed.

Use State Shape for data fields and a JSON instance, Interaction Surface for operations on that state, and annotated Code for source evidence. Use Canvas for system connections, Process Outline for expected execution steps, and Sequence for participant interactions and ordering. The catalog covers all registered component families, including ordinary text, File Tree, and Structured Table.

A snapshot mismatch requires starting a new task and reloading guidance. If the connection is missing or a required operation is unavailable, report that setup gap; do not bypass the tools by rewriting storage files. Review-only requests remain read-only.

## Component Authoring

Read the relevant [component reference](references/components.md) before creating or revising a component example. Component-specific guidance owns the state/signature/result example pattern and the rule for descriptions that add non-obvious information.

## Page Titles and Headings

The display title and body headings are separate. H1 headings are allowed in the body. Do not begin the body with an H1 that repeats the display title.

Saves automatically remove only that repeated opening H1 and preserve its children. They do not demote or remove other H1s. The response returns the corrected document, revision, and normalization summary; use that state for subsequent edits. The edit and cleanup share one undo patch.

Do not call a repair tool after ordinary edits. `docs_fix_lints` remains available for untouched legacy documents. Run `docs_check` to review other findings before completion.

## Page and Asset Management

Use `docs_move` or `docs_rename` for pages and whole sections with descendants. Use `docs_set_title` for the display title. These operations preview their affected files and reference rewrites; apply the reviewed plan with `preview:false` and its `tree_hash` as `expected_tree_hash`. Start a new preview if the corpus changes.

Before deleting an old page that owns a shared Canvas, Sequence, or media asset, read the asset hash with `docs_asset_read` and relocate it with `docs_asset_move`. The service updates references in other pages. Then preview `docs_delete`; use `recursive:true` only when deletion of all descendants is intended. Remaining external references block deletion so they can be repaired explicitly.

Check the moved pages and every returned `rewritten_sources` document. Retain `tree_change_id`; `docs_management_restore` can restore that operation from its recovery journal if affected files have not changed. This is separate from content-patch `docs_undo`.

Use `docs_component_create` to create a validated Canvas or Sequence sidecar before inserting its component block. Use asset upload/read/delete tools for media and attachments, annotation tools for discussion, and proposal/changeset tools when the task calls for staged review. Use the advertised schemas for arguments and limits.
