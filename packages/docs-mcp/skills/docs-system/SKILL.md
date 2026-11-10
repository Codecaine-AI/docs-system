---
name: docs-system
description: Read and update Docs System documentation through the connected Docs tools. Use when a project has a Docs System corpus or the user asks to document implementation changes, explain existing documentation, or edit documentation components.
metadata:
  version: "0.1.0"
  product: docs
compatibility: Requires the Docs System tool connection. Codex and Claude Code use MCP; pi Agent uses the installed bridge extension.
---

# Docs System

Use the connected Docs tools for documentation reads and edits. They preserve typed document structure, component sidecars, revisions, and validation. Do not edit `doc.json` or Canvas/Sequence sidecars with filesystem writes.

## Read or Edit

1. Call `docs_capabilities` for the active workspace. It returns the project IDs and the guidance topics. Topics come before projects in pages of at most 4,096 bytes, so pass `next_cursor` as `cursor` until you find your project or `next_cursor` is null. Select the requested project explicitly. For a request covering several projects, get each project ID through the same connection.
2. For reading, use the document tree and read tools. For editing, call `docs_begin` and keep its `task_id` for every edit. Read each guidance topic you need with `docs_guidance`.
3. Read the target document and its relevant neighbors. Use the component catalog (`docs_guidance` topic `components`) to choose the form that explains the subject. Load a component's detailed reference when needed; use the advertised tool schemas for editing mechanics.
4. Apply supported typed operations with the current document revision. Edits become visible immediately. On a revision conflict, read the current content and reconcile the requested change before retrying.
5. Run the completion check, repair required findings, and report which documents changed and any unresolved findings. If one project fails, retain and report the successful project edits separately.

## Style Rules

- Apply topic `style` to every block you write.
- Read `docs_guidance` with `task_id` and topic `style` before the first edit. The service refuses content writes until you do, once per task.
- Write results include `style_findings` for the blocks you changed. Fix them before moving on.
- Run `docs_check` with `task_id` on each changed page. It blocks on style violations this task introduced.

## Editor Workflow

Follow these steps for every edit, and for each open request on a page.

1. Call `docs_begin` and keep its `task_id` for every call. Then read `docs_guidance` with that `task_id` and topic `style`.
2. Read the page with `docs_read`. When requests drive the work, read them with `docs_annotations`.
3. Edit through typed tools only. Pass the `docs_read` hash as `expected_hash`.
   - For a Canvas or Sequence block, read `docs_component_read` first and pass its `hash` as `expected_component_hash`.
   - Edit a block in place. Never delete and recreate a block to change it, and never write structure, arrows or layout as text.
   - Fix the `style_findings` and `component_findings` in each result before the next edit. A Sequence edit also returns the saved `program` and an `svg_path` to open as an image.
   - If the same edit is refused twice, read the error and the current page again. If it still fails, report the exact error.
4. Run `docs_check` with `task_id` on each changed page. Fix its `lint` and `style_gate` findings and each failing component.
   - Leave a block alone when its entry has `touched_by_task: false`. Report its findings instead.
5. Report what changed and each finding you could not fix. Never report a partial result as the requested change. A task expires 12 hours after `docs_begin`, or after 30 minutes without a `docs_guidance`, `docs_check`, or write call that passes its `task_id`.

For a request, reply with the `reply` mode of `docs_annotation_write` when its intent is not clear. Resolve a request only when it needs no edit or you decline it. Write replies as plain sentences about what changed and why, with no block IDs or tool names.

## HTML Diagrams

- An `html` block holds one self-contained HTML and CSS drawing, such as a screen mockup or a physical layout. Its props are `title` and `html`.
- A script runs only when `allowScripts` is true. It runs in a sandbox with fetch blocked, so the file loads nothing from outside.
- The `html-diagrams` skill says how to draw one. Load it before you insert an `html` block.

For an implementation change, inspect the relevant source as evidence before describing current behavior. Distinguish proposed behavior from verified behavior. Publication is a separate action; documentation edits do not deploy a website.

The reading order is Foundation, System Design, Agents, then Implementation. Implementation briefly maps the design to the actual codebase and explains key implementation choices. Keep agent definitions in Agents. Preserve existing page structure, formatting guidance, examples, and detailed rationale when adjusting these layers.

## Guidance and Components

Typed blocks are the main value of the docs system. Before you write a section as prose or bullets, check whether it describes a shape: fields, files, an execution path, operations, layers, connections, call order, a comparison, or a screen. If it does, use the typed block for that shape, with one or two sentences around it. Keep a short list of plain facts as a list, and keep steps the reader follows as a numbered list. Specs, plans, and design pages need typed blocks most. The Structure page of the style guide (`99-appendix/10-style-guide/20-structure`) maps each shape to its block.

The service loads current guidance from the same corpus and manifests used by the built-in Docs agents. The installed [component catalog](references/components.md) shows each component's purpose, selection criteria, and focused reference. [Standards](references/standards.md) records the installed guidance snapshot. Treat the task's `docs_guidance` topics as authoritative when the development checkout has changed.

Use State Shape for data fields and a JSON instance, Interaction Surface for operations on that state, and annotated Code for source evidence. Use Canvas for system connections, Process Outline for expected execution steps, and Sequence for participant interactions and ordering. The catalog covers all registered component families, including ordinary text, File Tree, and Structured Table.

A snapshot mismatch requires starting a new task and reloading guidance. If the connection is missing or a required operation is unavailable, report that setup gap; do not bypass the tools by rewriting storage files. Review-only requests remain read-only.

## Component Authoring

Read the relevant [component reference](references/components.md) before creating or revising a component example. Component-specific guidance owns the state/signature/result example pattern and the rule for descriptions that add non-obvious information.

## Page Titles and Headings

The display title and body headings are separate. H1 headings are allowed in the body. Do not begin the body with an H1 that repeats the display title.

Saves automatically remove only that repeated opening H1 and preserve its children. They do not demote or remove other H1s. The response returns the corrected document, revision, and normalization summary; use that state for subsequent edits. The edit and cleanup share one undo patch.

Do not call a repair tool after ordinary edits. Run `docs_check` to review other findings before completion.

## Page and Asset Management

Use `docs_move` for pages and whole sections with descendants. Pass `to` to move one, or `name` to rename it inside its parent. Use `docs_set_title` for the display title. These operations preview their affected files and reference rewrites; apply the reviewed plan with `preview:false` and its `tree_hash` as `expected_tree_hash`. If the apply refuses with `changed_paths`, start a new preview.

Before deleting an old page that owns a shared Canvas, Sequence, or media asset, read the asset hash with `docs_assets` and the asset path, and relocate it with `docs_move`. The service updates references in other pages. Then preview `docs_delete`; use `recursive:true` only when deletion of all descendants is intended. Remaining external references block deletion so they can be repaired explicitly.

Check the moved pages and every returned `rewritten_sources` document. Retain `tree_change_id`; `docs_management_restore` can restore that operation from its recovery journal if affected files have not changed. This is separate from content-patch `docs_undo`.

Use `docs_component_create` to create a validated Canvas or Sequence sidecar before inserting its component block. Use asset upload/read/delete tools for media and attachments, annotation tools for discussion, and proposal/changeset tools when the task calls for staged review. Use the advertised schemas for arguments and limits.
