/**
 * The rule-unit manifest of two skills. Each unit keeps a run of skill lines as the skill wrote them, and names the
 * served guidance that now carries it: a docs_guidance topic, a drop with a reason, or a keep in the skill remainder.
 * The docs-system skill is deleted, so its units keep only their text. The sequence skill still exists under
 * SEQUENCE_SKILL_ROOT: every non-blank line of its SKILL.md and references/ files sits in one unit, and each unit
 * carries its file's pinned sha256. capabilities.test.ts checks the line spans, runs each unit's contract against the
 * served text and strips each unit to prove its contract fails. cli.ts manifest prints the units as JSON for the prose judge.
 */
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The sequence skill as the external/sequence submodule pins it, so the pins below move only with a submodule bump. */
export const SEQUENCE_SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../external/sequence/packages/sequence/skills/sequence");

/** The eval scenario that exercises a unit. The gate runners build one task per scenario. */
export const SCENARIOS = {
  "edit-page": "Edit one page from docs_capabilities through docs_check.",
  "read-only": "Answer a question from a corpus without editing it.",
  "multi-project": "Edit pages in two projects in one request.",
  "work-requests": "Work through the open requests on a page.",
  "choose-block": "Document a shape with the typed block that fits it.",
  "page-titles": "Create a page with a display title and body headings.",
  "move-page": "Move or rename a section of pages.",
  "delete-page": "Delete a page that owns a shared asset.",
  "html-diagram": "Add an html block that holds a drawing.",
  "implementation-change": "Document an implementation change from its source.",
  "component-example": "Write a worked component example.",
  "setup-gap": "Report a missing Docs connection.",
  "draw-sequence": "Draw a sequence diagram from a brief into a sequence block.",
} as const;
export type ScenarioId = keyof typeof SCENARIOS;

/** metadata: skill frontmatter. rule, step, link: hand-written prose. generated: a whole generated reference file. */
export type UnitKind = "metadata" | "rule" | "step" | "link" | "generated";
/**
 * Where the unit is served now. A drop is allowed only for a unit that routes output to another system. A keep stays
 * in the skill remainder, and is allowed only for a T3 Code thread step of the knowledge-session skill.
 */
export type Destination = { topic: string } | { drop: "instruments"; reason: string } | { keep: string; reason: string };
/** Recorded behavior gets a structured assertion: each tool is in tools/list, and the service refuses with this exact text. */
export type Behavior = { tools?: readonly string[]; refusal?: string };
export type ManifestUnit = {
  id: string;
  /** The skill the unit comes from. */
  skill: "docs-system" | "sequence";
  kind: UnitKind;
  /** Path in the skill folder: the deleted `packages/docs-mcp/skills/docs-system/`, or SEQUENCE_SKILL_ROOT. */
  file: string;
  /** First and last line, 1-based and inclusive. */
  lines: readonly [number, number];
  /** sha256 of the whole file, for a unit of a skill that still exists. */
  sha256?: string;
  /** The unit's lines as the file held them. */
  text: string;
  /** Exact phrases of the served text that carry the unit's rule. A generated unit has none: its served text must hold every line. */
  anchors: readonly string[];
  scenario: ScenarioId;
  destination: Destination;
  behavior?: Behavior;
};
type UnitSpec = Omit<ManifestUnit, "skill" | "sha256" | "text"> & { text?: string };

const workflow = { topic: "workflow" } as const;
const DOCS_UNITS: readonly UnitSpec[] = [
  {
    id: "skill.frontmatter", kind: "metadata", file: "SKILL.md", lines: [1, 8], scenario: "edit-page", destination: workflow,
    text: "---\nname: docs-system\ndescription: Read and update Docs System documentation through the connected Docs tools. Use when a project has a Docs System corpus or the user asks to document implementation changes, explain existing documentation, or edit documentation components.\nmetadata:\n  version: \"0.1.0\"\n  product: docs\ncompatibility: Requires the Docs System tool connection. Codex and Claude Code use MCP; pi Agent uses the installed bridge extension.\n---",
    anchors: ["Docs System corpus", "document implementation changes", "edit documentation components", "Pi reaches them through the installed bridge extension", "explain documentation", "Codex and Claude Code reach the tools through MCP"],
  },
  {
    id: "skill.intro", kind: "rule", file: "SKILL.md", lines: [10, 12], scenario: "edit-page", destination: workflow,
    text: "# Docs System\n\nUse the connected Docs tools for documentation reads and edits. They preserve typed document structure, component sidecars, revisions, and validation. Do not edit `doc.json` or Canvas/Sequence sidecars with filesystem writes.",
    anchors: ["The tools keep the typed document structure, component sidecars, revisions, and validation", "Never edit `doc.json` or a Canvas or Sequence sidecar with a filesystem write", "An agent uses the Docs tools for each read and each edit of a corpus"],
  },
  {
    id: "skill.read.discover", kind: "step", file: "SKILL.md", lines: [14, 16], scenario: "multi-project", destination: workflow,
    text: "## Read or Edit\n\n1. Call `docs_capabilities` for the active workspace. It returns the project IDs and the guidance topics. Topics come before projects in pages of at most 4,096 bytes, so pass `next_cursor` as `cursor` until you find your project or `next_cursor` is null. Select the requested project explicitly. For a request covering several projects, get each project ID through the same connection.",
    anchors: ["use a project id that it returns", "Select the requested project explicitly", "For a request on several projects, get each project id through the same connection", "Call `docs_capabilities` for the workspace", "`docs_capabilities` also lists the guidance topics", "pass `next_cursor` as `cursor` until you find your project or `next_cursor` is null"],
    behavior: { tools: ["docs_capabilities"] },
  },
  {
    id: "skill.read.begin", kind: "step", file: "SKILL.md", lines: [17, 17], scenario: "read-only", destination: workflow,
    text: "2. For reading, use the document tree and read tools. For editing, call `docs_begin` and keep its `task_id` for every edit. Read each guidance topic you need with `docs_guidance`.",
    anchors: ["need no task", "keep its `task_id` for every call", "`docs_tree`, `docs_search`, and `docs_read` need no task", "`docs_guidance` serves each topic"],
    behavior: { tools: ["docs_tree", "docs_read", "docs_begin", "docs_guidance"] },
  },
  {
    id: "skill.read.choose", kind: "step", file: "SKILL.md", lines: [18, 18], scenario: "choose-block", destination: workflow,
    text: "3. Read the target document and its relevant neighbors. Use the component catalog (`docs_guidance` topic `components`) to choose the form that explains the subject. Load a component's detailed reference when needed; use the advertised tool schemas for editing mechanics.",
    anchors: ["Read the page and its neighbors", "Choose the block form from the component catalog in topic `components`", "the full reference of one component", "the tool schemas give the arguments and the limits"],
    behavior: { tools: ["docs_read", "docs_guidance"] },
  },
  {
    id: "skill.read.apply", kind: "step", file: "SKILL.md", lines: [19, 19], scenario: "edit-page", destination: workflow,
    text: "4. Apply supported typed operations with the current document revision. Edits become visible immediately. On a revision conflict, read the current content and reconcile the requested change before retrying.",
    anchors: ["Each edit goes through a typed tool with the current revision hash", "A valid edit is saved and visible at once", "On a revision conflict, read the current page and apply the requested change to it before you retry"],
  },
  {
    id: "skill.read.complete", kind: "step", file: "SKILL.md", lines: [20, 20], scenario: "multi-project", destination: workflow,
    text: "5. Run the completion check, repair required findings, and report which documents changed and any unresolved findings. If one project fails, retain and report the successful project edits separately.",
    anchors: ["Report what changed and each finding you could not fix", "If one project fails, keep the edits in the other projects and report them apart", "Run `docs_check` with `task_id` on each changed page"],
    behavior: { tools: ["docs_check"] },
  },
  {
    id: "skill.style.apply", kind: "rule", file: "SKILL.md", lines: [22, 24], scenario: "edit-page", destination: workflow,
    text: "## Style Rules\n\n- Apply topic `style` to every block you write.",
    anchors: ["Apply topic `style` to every block you write"],
  },
  {
    id: "skill.style.gate", kind: "rule", file: "SKILL.md", lines: [25, 25], scenario: "edit-page", destination: workflow,
    text: "- Read `docs_guidance` with `task_id` and topic `style` before the first edit. The service refuses content writes until you do, once per task.",
    anchors: ["The service refuses content writes until the task reads topic `style`", "One read in each task is enough", "Read `docs_guidance` with that `task_id` and topic `style`"],
    behavior: { tools: ["docs_guidance"], refusal: "Read the style guide before your first edit: call docs_guidance with task_id and topic \"style\". Required once per task." },
  },
  {
    id: "skill.style.findings", kind: "rule", file: "SKILL.md", lines: [26, 26], scenario: "edit-page", destination: workflow,
    text: "- Write results include `style_findings` for the blocks you changed. Fix them before moving on.",
    anchors: ["Write results carry `style_findings` for the blocks you changed", "Fix them before you move on"],
  },
  {
    id: "skill.style.check", kind: "rule", file: "SKILL.md", lines: [27, 27], scenario: "edit-page", destination: workflow,
    text: "- Run `docs_check` with `task_id` on each changed page. It blocks on style violations this task introduced.",
    anchors: ["blocks on style violations that the task introduced", "Run `docs_check` with `task_id` on each changed page"],
    behavior: { tools: ["docs_check"] },
  },
  {
    id: "skill.workflow.begin", kind: "step", file: "SKILL.md", lines: [29, 33], scenario: "edit-page", destination: workflow,
    text: "## Editor Workflow\n\nFollow these steps for every edit, and for each open request on a page.\n\n1. Call `docs_begin` and keep its `task_id` for every call. Then read `docs_guidance` with that `task_id` and topic `style`.",
    anchors: ["Call `docs_begin`, and keep its `task_id` for every call", "Read `docs_guidance` with that `task_id` and topic `style`", "Follow these steps for every edit and for each open request on a page"],
    behavior: { tools: ["docs_begin", "docs_guidance"] },
  },
  {
    id: "skill.workflow.read", kind: "step", file: "SKILL.md", lines: [34, 34], scenario: "work-requests", destination: workflow,
    text: "2. Read the page with `docs_read`. When requests drive the work, read them with `docs_annotations`.",
    anchors: ["Read the page and its neighbors with `docs_read`", "When requests drive the work, read them with `docs_annotations`"],
    behavior: { tools: ["docs_read", "docs_annotations"] },
  },
  {
    id: "skill.workflow.hash", kind: "step", file: "SKILL.md", lines: [35, 35], scenario: "edit-page", destination: workflow,
    text: "3. Edit through typed tools only. Pass the `docs_read` hash as `expected_hash`.",
    anchors: ["Edit through typed tools only, and pass the `docs_read` hash as `expected_hash`"],
  },
  {
    id: "skill.workflow.component-hash", kind: "step", file: "SKILL.md", lines: [36, 36], scenario: "choose-block", destination: workflow,
    text: "   - For a Canvas or Sequence block, read `docs_component_read` first and pass its `hash` as `expected_component_hash`.",
    anchors: ["Pass its `hash` as `expected_component_hash`", "For a Canvas or Sequence block, read `docs_component_read` first"],
    behavior: { tools: ["docs_component_read"] },
  },
  {
    id: "skill.workflow.in-place", kind: "step", file: "SKILL.md", lines: [37, 37], scenario: "edit-page", destination: workflow,
    text: "   - Edit a block in place. Never delete and recreate a block to change it, and never write structure, arrows or layout as text.",
    anchors: ["Edit a block in place", "Never delete and recreate a block to change it, and never write structure, arrows, or layout as text"],
  },
  {
    id: "skill.workflow.findings", kind: "step", file: "SKILL.md", lines: [38, 38], scenario: "choose-block", destination: workflow,
    text: "   - Fix the `style_findings` and `component_findings` in each result before the next edit. A Sequence edit also returns the saved `program` and an `svg_path` to open as an image.",
    anchors: ["`component_findings` in each result before the next edit", "A Sequence edit also returns the saved `program` and an `svg_path` to open as an image"],
  },
  {
    id: "skill.workflow.refused", kind: "step", file: "SKILL.md", lines: [39, 39], scenario: "edit-page", destination: workflow,
    text: "   - If the same edit is refused twice, read the error and the current page again. If it still fails, report the exact error.",
    anchors: ["If the same edit is refused twice, read the error and the current page again", "If it still fails, report the exact error"],
  },
  {
    id: "skill.workflow.check", kind: "step", file: "SKILL.md", lines: [40, 41], scenario: "edit-page", destination: workflow,
    text: "4. Run `docs_check` with `task_id` on each changed page. Fix its `lint` and `style_gate` findings and each failing component.\n   - Leave a block alone when its entry has `touched_by_task: false`. Report its findings instead.",
    anchors: ["Fix its `lint` and `style_gate` findings and each failing component", "Leave a block alone when its entry has `touched_by_task: false`", "Report its findings instead"],
    behavior: { tools: ["docs_check"] },
  },
  {
    id: "skill.workflow.report", kind: "step", file: "SKILL.md", lines: [42, 42], scenario: "edit-page", destination: workflow,
    text: "5. Report what changed and each finding you could not fix. Never report a partial result as the requested change. A task expires 12 hours after `docs_begin`, or after 30 minutes without a `docs_guidance`, `docs_check`, or write call that passes its `task_id`.",
    anchors: ["Report what changed and each finding you could not fix", "Never report a partial result as the requested change", "or after 30 minutes without a `docs_guidance`, `docs_check`, or write call that passes its `task_id`"],
  },
  {
    id: "skill.workflow.requests", kind: "rule", file: "SKILL.md", lines: [44, 44], scenario: "work-requests", destination: workflow,
    text: "For a request, reply with the `reply` mode of `docs_annotation_write` when its intent is not clear. Resolve a request only when it needs no edit or you decline it. Write replies as plain sentences about what changed and why, with no block IDs or tool names.",
    anchors: ["Reply with the `reply` mode of `docs_annotation_write`", "when the intent of a request is not clear", "Resolve a request only when it needs no edit or when you decline it", "Write a reply as plain sentences about what changed and why, with no block IDs or tool names"],
    behavior: { tools: ["docs_annotation_write"] },
  },
  {
    id: "skill.html.block", kind: "rule", file: "SKILL.md", lines: [46, 48], scenario: "html-diagram", destination: workflow,
    text: "## HTML Diagrams\n\n- An `html` block holds one self-contained HTML and CSS drawing, such as a screen mockup or a physical layout. Its props are `title` and `html`.",
    anchors: ["holds one self-contained HTML and CSS drawing, such as a screen mockup or a physical layout", "Its props are `title` and `html`"],
  },
  {
    id: "skill.html.scripts", kind: "rule", file: "SKILL.md", lines: [49, 49], scenario: "html-diagram", destination: workflow,
    text: "- A script runs only when `allowScripts` is true. It runs in a sandbox with fetch blocked, so the file loads nothing from outside.",
    anchors: ["A script runs only when `allowScripts` is true", "The script runs in a sandbox with fetch blocked, so the file loads nothing from outside"],
  },
  {
    id: "skill.html.skill", kind: "link", file: "SKILL.md", lines: [50, 50], scenario: "html-diagram", destination: workflow,
    text: "- The `html-diagrams` skill says how to draw one. Load it before you insert an `html` block.",
    anchors: ["skill says how to draw one", "Load it before you insert an `html` block"],
  },
  {
    id: "skill.implementation.evidence", kind: "rule", file: "SKILL.md", lines: [52, 52], scenario: "implementation-change", destination: workflow,
    text: "For an implementation change, inspect the relevant source as evidence before describing current behavior. Distinguish proposed behavior from verified behavior. Publication is a separate action; documentation edits do not deploy a website.",
    anchors: ["Read the relevant source as evidence before you describe current behavior", "Keep proposed behavior apart from verified behavior", "Publication is a separate action", "A docs edit does not deploy a website"],
  },
  {
    id: "skill.implementation.layers", kind: "rule", file: "SKILL.md", lines: [54, 54], scenario: "implementation-change", destination: workflow,
    text: "The reading order is Foundation, System Design, Agents, then Implementation. Implementation briefly maps the design to the actual codebase and explains key implementation choices. Keep agent definitions in Agents. Preserve existing page structure, formatting guidance, examples, and detailed rationale when adjusting these layers.",
    anchors: ["Foundation, System Design, Agents, then Implementation", "Implementation briefly maps the design to the code and explains the key choices", "Agent definitions belong in Agents", "Keep the page structure, formatting guidance, examples, and detailed rationale"],
  },
  {
    id: "skill.guidance.typed-blocks", kind: "rule", file: "SKILL.md", lines: [56, 58], scenario: "choose-block", destination: {topic: "style"},
    text: "## Guidance and Components\n\nTyped blocks are the main value of the docs system. Before you write a section as prose or bullets, check whether it describes a shape: fields, files, an execution path, operations, layers, connections, call order, a comparison, or a screen. If it does, use the typed block for that shape, with one or two sentences around it. Keep a short list of plain facts as a list, and keep steps the reader follows as a numbered list. Specs, plans, and design pages need typed blocks most. The Structure page of the style guide (`99-appendix/10-style-guide/20-structure`) maps each shape to its block.",
    anchors: ["Typed blocks are the main value of this docs system", "Before you write a section as prose or bullets, check whether it describes one of the shapes in this table", "Put one or two sentences around the block", "Keep a short list of plain facts as a list", "Keep steps that the reader follows as a numbered list", "Specs, plans, and design pages need typed blocks most", "If the section describes a shape, use its typed block", "Shapes and the typed block for each"],
  },
  {
    id: "skill.guidance.authority", kind: "link", file: "SKILL.md", lines: [60, 60], scenario: "edit-page", destination: workflow,
    text: "The service loads current guidance from the same corpus and manifests used by the built-in Docs agents. The installed [component catalog](references/components.md) shows each component's purpose, selection criteria, and focused reference. [Standards](references/standards.md) records the installed guidance snapshot. Treat the task's `docs_guidance` topics as authoritative when the development checkout has changed.",
    anchors: ["pins the guidance snapshot of the task", "Treat the `docs_guidance` topics of the task as the authority when the checkout changes"],
  },
  {
    id: "skill.guidance.component-choice", kind: "rule", file: "SKILL.md", lines: [62, 62], scenario: "choose-block", destination: {topic: "components"},
    text: "Use State Shape for data fields and a JSON instance, Interaction Surface for operations on that state, and annotated Code for source evidence. Use Canvas for system connections, Process Outline for expected execution steps, and Sequence for participant interactions and ordering. The catalog covers all registered component families, including ordinary text, File Tree, and Structured Table.",
    anchors: ["use Canvas for system connections, Process Outline for the expected execution trace, and Sequence for a detailed interaction", "Put a state instance in State Shape alongside its field definition", "Use annotated source listings as evidence of the actual implementation", "Use Interaction Surface to describe the actions, queries, and events available on a state or system", "### file-tree", "### structured-table"],
  },
  {
    id: "skill.guidance.gaps", kind: "rule", file: "SKILL.md", lines: [64, 64], scenario: "setup-gap", destination: workflow,
    text: "A snapshot mismatch requires starting a new task and reloading guidance. If the connection is missing or a required operation is unavailable, report that setup gap; do not bypass the tools by rewriting storage files. Review-only requests remain read-only.",
    anchors: ["A snapshot mismatch needs a new task and a new read of the guidance", "report that setup gap", "Do not rewrite storage files in place of a tool call", "Keep a review-only request read-only"],
  },
  {
    id: "skill.component-authoring", kind: "link", file: "SKILL.md", lines: [66, 68], scenario: "component-example", destination: workflow,
    text: "## Component Authoring\n\nRead the relevant [component reference](references/components.md) before creating or revising a component example. Component-specific guidance owns the state/signature/result example pattern and the rule for descriptions that add non-obvious information.",
    anchors: ["before you create or revise a component example", "The component guidance owns the pattern of state, signature, and result for an example", "a description adds facts that the names do not show"],
    behavior: { tools: ["docs_guidance"] },
  },
  {
    id: "skill.titles.separate", kind: "rule", file: "SKILL.md", lines: [70, 72], scenario: "page-titles", destination: workflow,
    text: "## Page Titles and Headings\n\nThe display title and body headings are separate. H1 headings are allowed in the body. Do not begin the body with an H1 that repeats the display title.",
    anchors: ["The display title and the body headings are separate", "An H1 heading can stand in the body", "Do not start the body with an H1 that repeats the display title"],
  },
  {
    id: "skill.titles.save", kind: "rule", file: "SKILL.md", lines: [74, 74], scenario: "page-titles", destination: workflow,
    text: "Saves automatically remove only that repeated opening H1 and preserve its children. They do not demote or remove other H1s. The response returns the corrected document, revision, and normalization summary; use that state for subsequent edits. The edit and cleanup share one undo patch.",
    anchors: ["A save removes only that repeated opening H1 and keeps its children", "It does not demote or remove other H1 headings", "Use that state for the next edit", "The edit and the cleanup share one undo patch", "The save returns the corrected document, its revision, and a normalization summary"],
  },
  {
    id: "skill.titles.repair", kind: "rule", file: "SKILL.md", lines: [76, 76], scenario: "page-titles", destination: workflow,
    text: "Do not call a repair tool after ordinary edits. Run `docs_check` to review other findings before completion.",
    anchors: ["Do not call a repair tool after ordinary edits", "to review the other findings before you finish"],
    behavior: { tools: ["docs_check"] },
  },
  {
    id: "skill.pages.move", kind: "step", file: "SKILL.md", lines: [78, 80], scenario: "move-page", destination: workflow,
    text: "## Page and Asset Management\n\nUse `docs_move` for pages and whole sections with descendants. Pass `to` to move one, or `name` to rename it inside its parent. Use `docs_set_title` for the display title. These operations preview their affected files and reference rewrites; apply the reviewed plan with `preview:false` and its `tree_hash` as `expected_tree_hash`. If the apply refuses with `changed_paths`, start a new preview.",
    anchors: ["moves a page or a whole section with its descendants", "Pass `to` to move it, or pass `name` to rename it inside its parent", "changes the display title", "first return a preview of the affected files and the reference rewrites", "Apply the reviewed plan with `preview:false` and its `tree_hash` as `expected_tree_hash`", "If the apply refuses with `changed_paths`, start a new preview"],
    behavior: { tools: ["docs_move", "docs_set_title"] },
  },
  {
    id: "skill.pages.delete", kind: "step", file: "SKILL.md", lines: [82, 82], scenario: "delete-page", destination: workflow,
    text: "Before deleting an old page that owns a shared Canvas, Sequence, or media asset, read the asset hash with `docs_assets` and the asset path, and relocate it with `docs_move`. The service updates references in other pages. Then preview `docs_delete`; use `recursive:true` only when deletion of all descendants is intended. Remaining external references block deletion so they can be repaired explicitly.",
    anchors: ["Move the asset before you delete its page", "The service updates the references in other pages", "only when you intend to delete all descendants", "Remaining external references block the delete, so you can repair them first", "Read the asset hash with `docs_assets` and the asset path", "Move the asset with `docs_move` and the asset path", "Preview `docs_delete`"],
    behavior: { tools: ["docs_assets", "docs_move", "docs_delete"] },
  },
  {
    id: "skill.pages.restore", kind: "step", file: "SKILL.md", lines: [84, 84], scenario: "move-page", destination: workflow,
    text: "Check the moved pages and every returned `rewritten_sources` document. Retain `tree_change_id`; `docs_management_restore` can restore that operation from its recovery journal if affected files have not changed. This is separate from content-patch `docs_undo`.",
    anchors: ["Check the moved pages and each document in `rewritten_sources`", "Keep the `tree_change_id` of the operation", "from its recovery journal if the affected files did not change", "which reverts content patches"],
    behavior: { tools: ["docs_management_restore", "docs_undo"] },
  },
  {
    id: "skill.pages.tools", kind: "rule", file: "SKILL.md", lines: [86, 86], scenario: "edit-page", destination: workflow,
    text: "Use `docs_component_create` to create a validated Canvas or Sequence sidecar before inserting its component block. Use asset upload/read/delete tools for media and attachments, annotation tools for discussion, and proposal/changeset tools when the task calls for staged review. Use the advertised schemas for arguments and limits.",
    anchors: ["to create a validated Canvas or Sequence sidecar before you insert its component block", "Use the asset upload, read, and delete tools for media and attachments", "Use the annotation tools for discussion", "Use the proposal and changeset tools when the task asks for staged review", "the tool schemas give the arguments and the limits"],
    behavior: { tools: ["docs_component_create"] },
  },
];

/** The sha256 of each sequence skill file. A changed file fails the line-span test until its units are re-cut and re-pinned. */
export const SEQUENCE_PINNED_SHA256: Readonly<Record<string, string>> = {
  "SKILL.md": "1d0cfae62cb3bfe2c8fa74149e91dfa9a6c4aad04f959c36852df1a77facd1ca",
  "references/design-decisions.md": "b8a2a8f1fd470f0ba33274ad1c333938f63576c2f945fd310dffa8d536f20cfc",
  "references/language.md": "cdaf935920f65ab9dd909431dbdadf068ffb72ab002f6d3c4944708e0f208165",
};
/** The refusal of a sequence write in a task that has not read topic sequence-writing. */
export const SEQUENCE_WRITING_REFUSAL = 'Read the sequence writing guide before you write a sequence: call docs_guidance with task_id and topic "sequence-writing". Required once per task.';

const sequenceWriting = { topic: "sequence-writing" } as const;
const components = { topic: "components" } as const;
/** The sequence skill units. A prose unit holds its lines as text. A generated reference file is one unit, and its text comes from disk. */
const SEQUENCE_UNITS: readonly UnitSpec[] = [
  {
    id: "sequence.frontmatter", kind: "metadata", file: "SKILL.md", lines: [1, 8], scenario: "choose-block", destination: { drop: "instruments", reason: "The frontmatter only loads the skill. The instruments skill routes an ordered interaction with calls and returns to a sequence block." },
    text: "---\nname: sequence\ndescription: \"Write and edit UML sequence diagrams as sequence blocks in Codecaine docs pages through the docs-system MCP: request flows, call and return order, retries, failures and alternatives between named participants. Use after the instruments skill routes a diagram to a sequence block, when Ford says sequence diagram, or before any docs_sequence_* call.\"\ncompatibility: \"Needs the docs-system MCP server.\"\nmetadata:\n  version: \"0.1.0\"\n  product: sequence\n---",
    anchors: ["Ordered interaction with calls and returns", "sequence block"],
  },
  {
    id: "sequence.intro.block", kind: "rule", file: "SKILL.md", lines: [10, 13], scenario: "choose-block", destination: components,
    text: "# Sequence\n\nA sequence diagram is always a block inside the docs page it explains. The\nblock only points at a sidecar file, `assets/sequences/<name>.sequence.json`.",
    anchors: ["The block references a sequence sidecar managed through typed sequence tools"],
  },
  {
    id: "sequence.intro.write-path", kind: "rule", file: "SKILL.md", lines: [14, 16], scenario: "draw-sequence", destination: workflow,
    text: "That JSON document is the source of truth. You edit it as a short text\nprogram, and the docs-mcp `docs_sequence_*` tools are the only write path.\nThis skill has no MCP server of its own.",
    anchors: ["Never edit `doc.json` or a Canvas or Sequence sidecar with a filesystem write", "The tools keep the typed document structure, component sidecars, revisions, and validation"],
  },
  {
    id: "sequence.columns.lead", kind: "rule", file: "SKILL.md", lines: [18, 21], scenario: "draw-sequence", destination: sequenceWriting,
    text: "## Order the Columns Before You Write Them\n\nEach column that an arrow crosses makes the flow harder to follow. Before\nyou write the participant lines, do these steps:",
    anchors: ["## Order the Columns Before You Write Them", "Each column that an arrow crosses makes the flow harder to follow", "Before you write the participant lines, do these steps"],
  },
  {
    id: "sequence.columns.steps", kind: "step", file: "SKILL.md", lines: [23, 27], scenario: "draw-sequence", destination: sequenceWriting,
    text: "1. Find the first caller: the participant that sends the first message. Put it in column 1, even when an actor appears first in the brief.\n2. Add each other participant in the order it first receives a message, a return included. Most calls then run left to right.\n3. Count the messages of each pair of participants, in both directions.\n4. For each pair with 3 or more messages, check that no other column sits between the two participants.\n5. If a column sits between a busy pair, move the right one of the two left, next to the other. Then do step 4 again.",
    anchors: ["Find the first caller, the participant that sends the first message, and put it in column 1", "Do this even when an actor appears first in the brief", "Add each other participant in the order it first receives a message, a return included", "Count the messages of each pair of participants, in both directions", "For each pair with 3 or more messages, check that no other column sits between the two participants", "If a column sits between a busy pair, move the right one of the two left, next to the other. Then do step 4 again."],
  },
  {
    id: "sequence.columns.example", kind: "rule", file: "SKILL.md", lines: [29, 34], scenario: "draw-sequence", destination: sequenceWriting,
    text: "Never move a participant left of the participant that first calls it. For\nexample, a lead agent sends the first call to a builder and later asks Ford a\nquestion. The lead goes in column 1, the builder in column 2, and Ford to\nthe right of both. When a kernel plugin writes `trace.db` 6 times, put\n`trace.db` in the column right of the plugin, even when the plugin calls\ntwo providers first.",
    anchors: ["Never move a participant left of the participant that first calls it", "A lead agent that calls a builder first and asks Ford a question later goes in column 1, the builder in column 2, and Ford to the right of both", "When a kernel plugin writes `trace.db` 6 times, `trace.db` goes in the column right of the plugin, even when the plugin calls two providers first"],
  },
  {
    id: "sequence.when", kind: "rule", file: "SKILL.md", lines: [36, 42], scenario: "choose-block", destination: components,
    text: "## When to Use a Sequence Block\n\n- Use one when the order of calls and returns between named parts explains the behavior.\n- Good subjects are a request flow, a handshake, a retry, a failure path and an agent tool loop.\n- Keep it bounded: one interaction, from its first call to its last return.\n- Use a canvas for structure, ownership or a state chart. A sequence block shows time, not structure.\n- Check each message against source code or a trace before you draw it.",
    anchors: ["Use Sequence for a bounded interaction where participant order, calls, returns, waits, retries, or failures explain the behavior", "Verify the sequence against source or trace evidence", "Use Canvas for system connections, ownership boundaries, and dependencies", "tool calls, request and return paths"],
  },
  {
    id: "sequence.workflow.begin", kind: "step", file: "SKILL.md", lines: [44, 47], scenario: "draw-sequence", destination: workflow,
    text: "## Workflow\n\n1. Call `docs_capabilities` for the project ids, then call `docs_begin`. Keep its `task_id` for every call below.\n2. Read `docs_guidance` topic `style`, then read the page with `docs_read`.",
    anchors: ["Call `docs_capabilities` for the workspace, and use a project id that it returns", "Call `docs_begin`, and keep its `task_id` for every call", "Read `docs_guidance` with that `task_id` and topic `style`", "Read the page and its neighbors with `docs_read`"],
    behavior: { tools: ["docs_capabilities", "docs_begin", "docs_guidance", "docs_read"] },
  },
  {
    id: "sequence.workflow.guide", kind: "step", file: "SKILL.md", lines: [48, 48], scenario: "draw-sequence", destination: sequenceWriting,
    text: "3. Read `references/language.md` before you write a program. Read `references/design-decisions.md` before you change how a diagram is built.",
    anchors: ["# The Sequence Language, v1 Grammar", "# Sequence Design Decisions"],
    behavior: { tools: ["docs_sequence_set_program"], refusal: SEQUENCE_WRITING_REFUSAL },
  },
  {
    id: "sequence.workflow.create", kind: "step", file: "SKILL.md", lines: [49, 49], scenario: "draw-sequence", destination: workflow,
    text: "4. For a new diagram, call `docs_component_create` with `component: \"sequence\"`, then insert the block with the returned `src`.",
    anchors: ["Use `docs_component_create` to create a validated Canvas or Sequence sidecar before you insert its component block"],
    behavior: { tools: ["docs_component_create"] },
  },
  {
    id: "sequence.workflow.hashes", kind: "step", file: "SKILL.md", lines: [50, 50], scenario: "draw-sequence", destination: workflow,
    text: "5. Call `docs_component_read` on the block. Pass its `doc_hash` as `expected_hash` and its `hash` as `expected_component_hash`.",
    anchors: ["For a Canvas or Sequence block, read `docs_component_read` first", "Pass its `hash` as `expected_component_hash`"],
    behavior: { tools: ["docs_component_read"] },
  },
  {
    id: "sequence.workflow.program", kind: "step", file: "SKILL.md", lines: [51, 51], scenario: "draw-sequence", destination: sequenceWriting,
    text: "6. Call `docs_sequence_set_program` with the whole program and both hashes.",
    anchors: ["An agent rewrites the whole program", "There is no patch DSL and no incremental edit syntax"],
    behavior: { tools: ["docs_sequence_set_program"] },
  },
  {
    id: "sequence.workflow.result", kind: "step", file: "SKILL.md", lines: [52, 52], scenario: "draw-sequence", destination: workflow,
    text: "7. Read the result: the program text, the findings and the SVG path. Open the SVG, fix each finding, and send the whole program again.",
    anchors: ["A Sequence edit also returns the saved `program` and an `svg_path` to open as an image", "Fix the `style_findings` and `component_findings` in each result before the next edit"],
  },
  {
    id: "sequence.workflow.style", kind: "step", file: "SKILL.md", lines: [53, 53], scenario: "draw-sequence", destination: sequenceWriting,
    text: "8. Set colors and spacing with `docs_sequence_set_style`. Style never goes in the program. `docs_sequence_set_title` changes only the title.",
    anchors: ["Styling never appears in a program", "Accent colors, fragment color, participant fill, and scale live only in `SequenceDocument.style`", "(`setProgram` / `setStyle` / `setTitle`)"],
  },
  {
    id: "sequence.workflow.check", kind: "step", file: "SKILL.md", lines: [54, 54], scenario: "draw-sequence", destination: workflow,
    text: "9. Run `docs_check` on the page and fix what it reports.",
    anchors: ["Run `docs_check` with `task_id` on each changed page"],
    behavior: { tools: ["docs_check"] },
  },
  {
    id: "sequence.workflow.conflict", kind: "rule", file: "SKILL.md", lines: [56, 58], scenario: "draw-sequence", destination: sequenceWriting,
    text: "A hash conflict means the page or the sidecar changed. Read it again, merge\nyour change into the new program, and send it once more. A parse error\nnames its line. Fix every listed line, because a failed parse changes nothing.",
    anchors: ["It returns either a successful document or line-numbered errors", "The parser collects multiple errors where feasible", "A failed parse produces no replacement document"],
  },
  {
    id: "sequence.rules.whole", kind: "rule", file: "SKILL.md", lines: [60, 62], scenario: "draw-sequence", destination: sequenceWriting,
    text: "## Rules of the Language\n\n- Send the whole program every time. There is no patch or partial program.",
    anchors: ["An agent rewrites the whole program", "There is no patch DSL and no incremental edit syntax"],
  },
  {
    id: "sequence.rules.parts", kind: "rule", file: "SKILL.md", lines: [63, 65], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- A program has three parts in this order: an optional `title` line, the participants, then `seq`.\n  - A program without a `title` line keeps the diagram's existing title. Change or clear a title with `docs_sequence_set_title`.\n  - Put exactly one blank line before `seq`.",
    anchors: ["A program has three parts, in this order:", "**The optional title.**", "Exactly one blank line separates the participants from `seq`", "A program without this line has no title"],
  },
  {
    id: "sequence.rules.participants", kind: "rule", file: "SKILL.md", lines: [66, 67], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Number participants 1, 2, 3 with no gaps, in left-to-right order. The number is the participant's identity.\n- Write participant fields in this order: `text=`, `kind=actor`, `label=`, `stereotype=`. Only `text=` is required.",
    anchors: ["Numbers are dense and in declaration order", "The number **is** the participant's identity in the program", "participant fields in the fixed order `text=`, `kind=actor`, `label=`, `stereotype=`", "| `text=` | yes | the participant's short name |"],
  },
  {
    id: "sequence.rules.messages", kind: "rule", file: "SKILL.md", lines: [68, 73], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Write each message as `<from> <arrow> <to> text=<value>`.\n  - `>` is a sync call. `->` is an async message. `-->` is a return, drawn dashed.\n  - Use `>` for every call the caller waits on: a tool call, an RPC, an HTTP request or a write that must finish first.\n  - A waited-on call stays `>` even when the diagram draws no reply for it.\n  - Use `->` only for a message nobody waits on, such as an event, a notification or a chat message.\n  - A self-message uses one number on both sides, such as `2 > 2 text=validate`.",
    anchors: ["The form is `<from> <arrow> <to> text=<v>`", "| `-->` | return | dashed line, open arrowhead |", "A call whose caller waits for the reply is sync (`>`)", "An MCP tool call, an RPC and an HTTP request with its response are all sync", "Use async (`->`) only for a message the sender does not wait on", "A waited-on call with no listed return stays `>`", "A self-message uses the same number on both sides"],
  },
  {
    id: "sequence.rules.fragments", kind: "rule", file: "SKILL.md", lines: [74, 76], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- The fragments are `alt` with `else`, `opt` and `loop`.\n  - Each needs `guard=`. An `else` can omit it.\n  - Indent 2 spaces per level, never tabs. Dedent to close a fragment. There is no end keyword.",
    anchors: ["`alt`, `opt`, and `loop` each begin an operand", "A non-first operand may omit its guard", "requires `guard=<v>`", "Tabs are an error", "Indentation is exactly 2 spaces per level", "There is no `end` keyword"],
  },
  {
    id: "sequence.rules.notes", kind: "rule", file: "SKILL.md", lines: [77, 77], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- A note is `note over=N text=<value>`. The side can also be `left=N` or `right=N`.",
    anchors: ["The form is `note <side>=<N> text=<v>`, where `<side>` is exactly `over`, `left`, or `right`"],
  },
  {
    id: "sequence.rules.values", kind: "rule", file: "SKILL.md", lines: [78, 78], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- A value can be bare only when it holds letters, digits, `_`, `(`, `)` and `-`. Quote all other values, such as `text=\"Login page\"`.",
    anchors: ["Values used in labeled fields are bare tokens if and only if they match `/^[A-Za-z0-9_()-]*$/` and contain no space", "All other values are JSON-quoted strings"],
  },
  {
    id: "sequence.rules.layout", kind: "rule", file: "SKILL.md", lines: [79, 82], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Never write coordinates, ids or activation bars. Layout comes from the structure.\n  - A sync call activates its receiver until the matching return.\n  - A caller that waits on a sync call is active for its turn: from the message that starts the turn to its last send or reply.\n  - A sync call with no return gets a short bar over its own row.",
    anchors: ["Deterministic layout derives every position, row, frame, and path", "Document ids and item ids are never written in the language", "Layout derives each activation bar from sync calls, their matching returns and the turns of each caller", "A caller that no call holds active gets a bar for each turn in which it waits on a sync call", "sync call activates receiver until the matching return"],
  },
  {
    id: "sequence.reader.names", kind: "rule", file: "SKILL.md", lines: [84, 88], scenario: "draw-sequence", destination: sequenceWriting,
    text: "## Writing for the Reader\n\n- Name participants in the reader's words, such as `browser`, `docs server` and `database`.\n  - Keep a header to a name of 1 to 3 words, in one case style for every participant, such as `Child agent` next to `Parent agent`.\n  - Put a code name the brief gives, such as `buildLead(threads)`, in `stereotype=`. Leave any other detail about a participant out of the diagram: never move it into a note.",
    anchors: ["## Writing for the Reader", "Name participants in the reader's words, such as `browser`, `docs server` and `database`", "Keep a header to 1 to 3 words, in one case style for every participant, such as `Child agent` next to `Parent agent`", "Put a code name the brief gives, such as `buildLead(threads)`, in `stereotype=`", "Leave any other participant detail out of the diagram, and never move it into a note"],
  },
  {
    id: "sequence.reader.columns", kind: "link", file: "SKILL.md", lines: [89, 89], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Order the columns with the steps in \"Order the Columns Before You Write Them\".",
    anchors: ["## Order the Columns Before You Write Them"],
  },
  {
    id: "sequence.reader.labels", kind: "rule", file: "SKILL.md", lines: [90, 92], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Write a message label as the call or event the reader knows, such as `fetch(user)` or `200 OK`.\n  - Keep a plain-words label to 40 characters or fewer, and a code call to 56. Keep each argument the brief names, and drop the others.\n  - Use one label style in a diagram: a code call for a tool or API call, plain words for an event. Never add a prefix such as `publish:`.",
    anchors: ["Write a message label as the call or event the reader knows, such as `fetch(user)` or `200 OK`", "Keep a plain-words label to 40 characters or fewer and a code call to 56", "Keep each argument the brief names and drop the others", "Use one label style in a diagram, a code call for a tool or API call and plain words for an event", "Never add a prefix such as `publish:`"],
  },
  {
    id: "sequence.reader.brief", kind: "rule", file: "SKILL.md", lines: [93, 99], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Copy each detail the brief lists. Never rename, merge or drop one.\n  - Copy each argument the brief names into the call label, such as `getOrder(orderId, userId)`. When the brief lists a tool's parameters, write the required ones by name.\n  - Never abbreviate a name the brief uses, such as `baseRevision` to `baseRev`. A code call that lists the brief's arguments can run to 56 characters; shorten plain words first, such as `session_update(id, thread, phase, links)`. Never write an ellipsis, and never move a dropped argument into a note.\n  - Never write an argument the brief does not give for that call. A guessed argument, such as `read(childThreadId)` for a tool that takes `requestId`, misstates the tool.\n  - Write a guard in the brief's words, in prose with no code operator such as `!=`. Keep every condition and remark the brief puts in it, such as `(this part is proposed)` or `the last entry of models`.\n  - Draw each return the brief lists as its own arrow, in the brief's order. Never merge two returns into one.\n  - Keep the place the brief gives for a value, such as `ids in body.meta`.",
    anchors: ["Copy each detail the brief lists, and never rename, merge or drop one", "Copy each argument it names into the call label, such as `getOrder(orderId, userId)`, and write the required parameters by name", "Never abbreviate a name the brief uses, such as `baseRevision` to `baseRev`", "Shorten plain words first, never write an ellipsis, and never move a dropped argument into a note", "A guessed argument, such as `read(childThreadId)` for a tool that takes `requestId`, misstates the tool", "Write a guard in the brief's words, with no code operator such as `!=`", "Keep every condition and remark the brief puts in the guard, such as `(this part is proposed)`", "Draw each return the brief lists as its own arrow, in the brief's order", "keep the place the brief gives for a value, such as `ids in body.meta`"],
  },
  {
    id: "sequence.reader.one-arrow", kind: "rule", file: "SKILL.md", lines: [100, 100], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Draw one arrow for each call. Never join two calls in one label with \"then\", because a reply then seems to answer both.",
    anchors: ["Draw one arrow for each call", "Never join two calls in one label with \"then\", because a reply then seems to answer both"],
  },
  {
    id: "sequence.reader.returns", kind: "rule", file: "SKILL.md", lines: [101, 103], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Draw a return only where the brief lists one or the reader must see the reply.\n  - A waited-on call with no listed return stays `>` with no return.\n  - Never add a return such as `saved` or `ok` only to close a call.",
    anchors: ["Draw a return only where the brief lists one or the reader must see the reply", "A waited-on call with no listed return stays `>`", "never add a return such as `ok` only to close a call"],
  },
  {
    id: "sequence.reader.alt", kind: "rule", file: "SKILL.md", lines: [104, 106], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- When an `alt` branches on a call's reply, put each reply inside the branch it starts, as that branch's first step.\n  - Never merge two outcomes into one reply before the `alt`, such as `200 or 409`.\n  - Let each guard name the condition, and draw only the replies the brief lists.",
    anchors: ["When an `alt` branches on a reply, put each reply first in the branch it starts", "Never merge two outcomes into one reply before the `alt`, such as `200 or 409`"],
  },
  {
    id: "sequence.reader.guards", kind: "rule", file: "SKILL.md", lines: [107, 107], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Keep a guard to 60 characters or fewer by cutting filler words, never a condition. A note cannot restrict a branch, so a condition never moves to a note. Keep a reason the brief gives with `because` in the guard, in a few words, such as `after a replan`.",
    anchors: ["Keep a guard to 60 characters or fewer by cutting filler words, never a condition", "A note cannot restrict a branch, so a condition never moves to a note", "Keep a reason the brief gives with `because`, in a few words, such as `after a replan`"],
  },
  {
    id: "sequence.reader.size", kind: "rule", file: "SKILL.md", lines: [108, 108], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Keep a diagram to about 5 participants and 20 messages. Split a larger flow into two blocks.",
    anchors: ["Keep a diagram to about 5 participants and 20 messages, and split a larger flow into two blocks"],
  },
  {
    id: "sequence.reader.notes", kind: "rule", file: "SKILL.md", lines: [109, 111], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- Use a note only where the brief lists one. Keep it short, one fact a message cannot carry.\n  - Keep each condition that the brief gives for that fact.\n  - Start every note with a capital letter, and every prose label with a lowercase letter, so each kind of text has one look.",
    anchors: ["Use a note only where the brief lists one, for one fact a message cannot carry", "Keep each condition the brief gives for that fact", "Start every note with a capital letter and every prose label with a lowercase letter"],
  },
  {
    id: "sequence.reader.findings", kind: "rule", file: "SKILL.md", lines: [112, 112], scenario: "draw-sequence", destination: sequenceWriting,
    text: "- When a `docs_sequence_set_program` result lists a `long-label`, `long-guard`, `joined-calls` or `leftward-call` finding, fix it.",
    anchors: ["Fix each `long-label`, `long-guard`, `joined-calls` or `leftward-call` finding in a `docs_sequence_set_program` result", "The lints of `docs_sequence_set_program` check four of them"],
    behavior: { tools: ["docs_sequence_set_program"] },
  },
  {
    id: "sequence.references", kind: "link", file: "SKILL.md", lines: [114, 118], scenario: "draw-sequence", destination: sequenceWriting,
    text: "## References\n\n- `references/language.md` is the complete v1 grammar, with every form, the canonical layout, the errors and the parts left out on purpose.\n- `references/design-decisions.md` holds the settled design decisions: the JSON document as source of truth, the text program as a projection, and style kept apart.\n- `snapshot.json` hashes every source of this folder. If a source hash differs from the file in the sequence repo, regenerate with `bun run skill:write`.",
    anchors: ["# The Sequence Language, v1 Grammar", "# Sequence Design Decisions", "These decisions are settled"],
  },
  { id: "sequence.reference.language", kind: "generated", file: "references/language.md", lines: [1, 273], anchors: [], scenario: "draw-sequence", destination: sequenceWriting },
  { id: "sequence.reference.design-decisions", kind: "generated", file: "references/design-decisions.md", lines: [1, 12], anchors: [], scenario: "draw-sequence", destination: sequenceWriting },
];

/** The full manifest, a fresh copy on each call. A sequence unit carries its file's pinned sha256, and a generated unit its whole file as text. */
export async function guidanceManifest(root = SEQUENCE_SKILL_ROOT): Promise<ManifestUnit[]> {
  const docs = DOCS_UNITS.map(unit => ({ skill: "docs-system" as const, ...unit, text: unit.text! }));
  const sequence = await Promise.all(SEQUENCE_UNITS.map(async unit => ({
    skill: "sequence" as const,
    ...unit,
    sha256: SEQUENCE_PINNED_SHA256[unit.file]!,
    text: unit.text ?? (await readFile(join(root, unit.file), "utf8")).split("\n").slice(0, unit.lines[1]).join("\n"),
  })));
  return structuredClone([...docs, ...sequence]);
}

/** Writes that skip the style gate: tree, annotation, review-decision, asset, undo and restore writes. */
export const STYLE_GATE_EXEMPT: ReadonlySet<string> = new Set(["docs_create", "docs_move", "docs_delete", "docs_set_title", "docs_annotation_write", "docs_proposal_decide", "docs_changeset_stage", "docs_changeset_decide", "docs_asset_upload", "docs_undo", "docs_management_restore"]);
/** The writes that also need topic sequence-writing, each with the arguments that make a call a sequence write. */
const SEQUENCE_WRITES: Readonly<Record<string, (args: Record<string, unknown>) => boolean>> = {
  docs_sequence_set_program: () => true,
  docs_component_create: args => args.component === "sequence",
};
/**
 * The topics a write needs, read in the same task. Every write outside STYLE_GATE_EXEMPT is a content write and needs
 * topic style. A sequence write also needs topic sequence-writing. Without args the result holds every topic some call
 * of the write needs, and the index lists it as each topic's required_for.
 */
export const requiredTopics = (write: string, args?: Record<string, unknown>): readonly string[] =>
  STYLE_GATE_EXEMPT.has(write) ? [] : write in SEQUENCE_WRITES && (args === undefined || SEQUENCE_WRITES[write]!(args)) ? ["style", "sequence-writing"] : ["style"];

/** The fixed fields of the docs_capabilities index. Each other field is live. */
export const CAPABILITIES = {
  guidance_tool: "docs_guidance",
  entry_tool: "docs_begin",
  completion_tools: ["docs_check"],
  operations: ["docs_capabilities", "docs_begin", "docs_guidance", "docs_read", "docs_apply_ops", "docs_check"],
  discovery_tools: [
    { name: "docs_tree", purpose: "List the pages of a project." },
    { name: "docs_search", purpose: "Find pages by title or text in a project." },
  ],
} as const;
