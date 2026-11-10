/**
 * The rule-unit manifest of the docs-system skill. Every non-blank line of SKILL.md and of each file under
 * references/ sits in one unit, and each unit names the served guidance that now carries it: a docs_guidance
 * topic, a component reference, or a drop with a reason. capabilities.test.ts pins each file's sha256, checks the
 * line spans, runs each unit's contract against the served text and strips each unit to prove its contract fails.
 * cli.ts manifest prints the units as JSON for the prose judge. Unit text stays as the skill wrote it.
 */
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../skills/docs-system");

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
} as const;
export type ScenarioId = keyof typeof SCENARIOS;

/** metadata: skill frontmatter. rule, step, link: hand-written prose. generated: a whole generated reference file. */
export type UnitKind = "metadata" | "rule" | "step" | "link" | "generated";
/** Where the unit is served now. A drop is allowed only for a unit that routes output to another system. */
export type Destination = { topic: string } | { component: string } | { drop: "instruments"; reason: string };
/** Recorded behavior gets a structured assertion: each tool is in tools/list, and the service refuses with this exact text. */
export type Behavior = { tools?: readonly string[]; refusal?: string };
export type ManifestUnit = {
  id: string;
  kind: UnitKind;
  /** Path relative to SKILL_ROOT. */
  file: string;
  /** First and last line, 1-based and inclusive. */
  lines: readonly [number, number];
  /** sha256 of the whole file the unit comes from. */
  sha256: string;
  /** The unit's lines as the file holds them. */
  text: string;
  /** Exact phrases of the served text that carry the unit's rule. A generated unit has none: its served text must hold every line. */
  anchors: readonly string[];
  scenario: ScenarioId;
  destination: Destination;
  behavior?: Behavior;
};
type UnitSpec = Omit<ManifestUnit, "sha256" | "text"> & { text?: string };

/** The sha256 of each file the manifest covers. A changed file fails the line-span test until its units are re-cut and re-pinned. */
export const PINNED_SHA256: Readonly<Record<string, string>> = {
  "SKILL.md": "b1e91579ccb099b356443403430999131a959213e4501ab0e0800894ed93d702",
  "references/components.md": "f070685b484a4e63def2a1094c55bdda7950103332411b413e6c3b358170b716",
  "references/components/call-stack.md": "39681ae9fa4206f83c578448ddd06e46c8c4929af22484ff94a3fb5a21817ede",
  "references/components/canvas.md": "3756eb065f444a2b46cbab10b4ae279005735ec79258f9329d33623ec0bf2f11",
  "references/components/code.md": "7787dfcb194481f4b0aac82d66cf5ecd6519409a814ee44c4b387439a6ebf45e",
  "references/components/component-tree.md": "bbbfcc9629598cdeaef12c668c8f917dac37cf29674d180c25c1ddad904b13fe",
  "references/components/file-explorer.md": "526ad27bbd3626576f6b884c582246f46c022189f2838fc34b28de45c8d06f0e",
  "references/components/file-tree.md": "788cdbe4fcd72388b8cd97410ce558f70d2147c49f948e7f122ec8d248bf5540",
  "references/components/interaction-surface.md": "fc1b522a741686e32f7466e373822525703943123aa627ac04cf986817dcc5e4",
  "references/components/process-outline.md": "bbc6c082cf714c263f2b7bbe119f89ec7275fb84cfa55ceb55ea6516e3db43a3",
  "references/components/pseudocode.md": "3ab3fe8eca6999756d07a0d6c7c9b16e1f3ab30f6c45f3ead7e3b6f036722969",
  "references/components/rich-text.md": "c9b119c383417908b72f9482e578f736c60651fa38b9c5ee16df9bf26c71e7b9",
  "references/components/sequence.md": "a0a8e4d05d83234ee9386bc294690c21bb8d86c3b8946d4b45fc9c78dd9c493d",
  "references/components/stack.md": "2489f5059f2ec410b7a1c796427f2ec404f4b18ff3968c040b1913e3cb71ef88",
  "references/components/state-shape.md": "597a9f802df0792e0709f0403273edc3d76bfe305cd58447583bc0c3efa102fa",
  "references/components/structured-table.md": "9b8a149ddd97747cf80eb971af6316ba39615515d4432bc0be474f3058247699",
  "references/standards.md": "38e8bacb29076de8a6c2e86a47a33a65a983da04d44b01f46f474e3bb73069d3",
};

const workflow = { topic: "workflow" } as const;
/** A generated reference file is one unit when its destination serves the same text. */
const generated = (file: string, scenario: ScenarioId, destination: Destination, lines: number): UnitSpec =>
  ({ id: `reference.${file.replace(/^references\//, "").replace(/\.md$/, "").replace(/\//g, ".")}`, kind: "generated", file, lines: [1, lines], anchors: [], scenario, destination });

const UNITS: readonly UnitSpec[] = [
  {
    id: "skill.frontmatter", kind: "metadata", file: "SKILL.md", lines: [1, 8], scenario: "edit-page", destination: workflow,
    text: "---\nname: docs-system\ndescription: Read and update Docs System documentation through the connected Docs tools. Use when a project has a Docs System corpus or the user asks to document implementation changes, explain existing documentation, or edit documentation components.\nmetadata:\n  version: \"0.1.0\"\n  product: docs\ncompatibility: Requires the Docs System tool connection. Codex and Claude Code use MCP; pi Agent uses the installed bridge extension.\n---",
    anchors: ["Docs System corpus", "document implementation changes", "edit documentation components", "Pi reaches them through the installed bridge extension"],
  },
  {
    id: "skill.intro", kind: "rule", file: "SKILL.md", lines: [10, 12], scenario: "edit-page", destination: workflow,
    text: "# Docs System\n\nUse the connected Docs tools for documentation reads and edits. They preserve typed document structure, component sidecars, revisions, and validation. Do not edit `doc.json` or Canvas/Sequence sidecars with filesystem writes.",
    anchors: ["The tools keep the typed document structure, component sidecars, revisions, and validation", "Never edit `doc.json` or a Canvas or Sequence sidecar with a filesystem write"],
  },
  {
    id: "skill.read.discover", kind: "step", file: "SKILL.md", lines: [14, 16], scenario: "multi-project", destination: workflow,
    text: "## Read or Edit\n\n1. Discover projects in the active workspace through the discovery tool. Select the requested project explicitly. For a request covering several projects, discover each target through the same connection.",
    anchors: ["use a project id that it returns", "For a request on several projects, get each project id through the same connection"],
    behavior: { tools: ["docs_capabilities"] },
  },
  {
    id: "skill.read.begin", kind: "step", file: "SKILL.md", lines: [17, 17], scenario: "read-only", destination: workflow,
    text: "2. For reading, use the document tree and read tools. For editing, begin a documentation task with `docs_begin`. It returns the style digest, a guidance topic index, and one-line component purposes. Keep its `task_id` for every edit.",
    anchors: ["need no task", "keep its `task_id` for every call"],
    behavior: { tools: ["docs_tree", "docs_read", "docs_begin"] },
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
    anchors: ["Report what changed and each finding you could not fix", "If one project fails, keep the edits in the other projects and report them apart"],
    behavior: { tools: ["docs_check"] },
  },
  {
    id: "skill.style.apply", kind: "rule", file: "SKILL.md", lines: [22, 24], scenario: "edit-page", destination: workflow,
    text: "## Style Rules\n\n- `docs_begin` returns the style digest first. Apply it to every block you write.",
    anchors: ["Apply topic `style` to every block you write"],
  },
  {
    id: "skill.style.gate", kind: "rule", file: "SKILL.md", lines: [25, 25], scenario: "edit-page", destination: workflow,
    text: "- Read `docs_guidance` with `task_id` and topic `style` before the first edit. The service refuses content writes until you do, once per task.",
    anchors: ["The service refuses content writes until the task reads topic `style`", "One read in each task is enough"],
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
    anchors: ["blocks on style violations that the task introduced"],
    behavior: { tools: ["docs_check"] },
  },
  {
    id: "skill.workflow.begin", kind: "step", file: "SKILL.md", lines: [29, 33], scenario: "edit-page", destination: workflow,
    text: "## Editor Workflow\n\nFollow these steps for every edit, and for each open request on a page.\n\n1. Call `docs_begin` and keep its `task_id` for every call. Then read `docs_guidance` with that `task_id` and topic `style`.",
    anchors: ["Call `docs_begin`, and keep its `task_id` for every call", "Read `docs_guidance` with that `task_id` and topic `style`"],
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
    anchors: ["Pass its `hash` as `expected_component_hash`"],
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
    text: "5. Call `docs_end`. Report what changed and each finding you could not fix. Never report a partial result as the requested change.",
    anchors: ["Report what changed and each finding you could not fix", "Never report a partial result as the requested change"],
  },
  {
    id: "skill.workflow.requests", kind: "rule", file: "SKILL.md", lines: [44, 44], scenario: "work-requests", destination: workflow,
    text: "For a request, reply with `docs_annotation_reply` when its intent is not clear. Resolve a request only when it needs no edit or you decline it. Write replies as plain sentences about what changed and why, with no block IDs or tool names.",
    anchors: ["when the intent of a request is not clear", "Resolve a request only when it needs no edit or when you decline it", "Write a reply as plain sentences about what changed and why, with no block IDs or tool names"],
    behavior: { tools: ["docs_annotation_reply"] },
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
    anchors: ["Foundation, System Design, Agents, then Implementation", "Implementation maps the design to the code and explains the key choices", "Agent definitions belong in Agents", "Keep the page structure, formatting guidance, examples, and detailed rationale"],
  },
  {
    id: "skill.guidance.typed-blocks", kind: "rule", file: "SKILL.md", lines: [56, 58], scenario: "choose-block", destination: {topic: "style"},
    text: "## Guidance and Components\n\nTyped blocks are the main value of the docs system. Before you write a section as prose or bullets, check whether it describes a shape: fields, files, an execution path, operations, layers, connections, call order, a comparison, or a screen. If it does, use the typed block for that shape, with one or two sentences around it. Keep a short list of plain facts as a list, and keep steps the reader follows as a numbered list. Specs, plans, and design pages need typed blocks most. The Structure page of the style guide (`99-appendix/10-style-guide/20-structure`) maps each shape to its block.",
    anchors: ["Typed blocks are the main value of this docs system", "Before you write a section as prose or bullets, check whether it describes one of the shapes in this table", "Put one or two sentences around the block", "Keep a short list of plain facts as a list", "Keep steps that the reader follows as a numbered list", "Specs, plans, and design pages need typed blocks most"],
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
    anchors: ["A save removes only that repeated opening H1 and keeps its children", "It does not demote or remove other H1 headings", "Use that state for the next edit", "The edit and the cleanup share one undo patch"],
  },
  {
    id: "skill.titles.repair", kind: "rule", file: "SKILL.md", lines: [76, 76], scenario: "page-titles", destination: workflow,
    text: "Do not call a repair tool after ordinary edits. `docs_fix_lints` remains available for untouched legacy documents. Run `docs_check` to review other findings before completion.",
    anchors: ["Do not call a repair tool after ordinary edits", "to review the other findings before you finish"],
    behavior: { tools: ["docs_check"] },
  },
  {
    id: "skill.pages.move", kind: "step", file: "SKILL.md", lines: [78, 80], scenario: "move-page", destination: workflow,
    text: "## Page and Asset Management\n\nUse `docs_move` or `docs_rename` for pages and whole sections with descendants. Use `docs_set_title` for the display title. These operations preview their affected files and reference rewrites; apply the reviewed plan with `preview:false` and its `tree_hash` as `expected_tree_hash`. If the apply refuses with `changed_paths`, start a new preview.",
    anchors: ["move a page or a whole section with its descendants", "changes the display title", "first returns a preview of the affected files and the reference rewrites", "Apply the reviewed plan with `preview:false` and its `tree_hash` as `expected_tree_hash`", "If the apply refuses with `changed_paths`, start a new preview"],
    behavior: { tools: ["docs_move", "docs_rename", "docs_set_title"] },
  },
  {
    id: "skill.pages.delete", kind: "step", file: "SKILL.md", lines: [82, 82], scenario: "delete-page", destination: workflow,
    text: "Before deleting an old page that owns a shared Canvas, Sequence, or media asset, read the asset hash with `docs_asset_read` and relocate it with `docs_asset_move`. The service updates references in other pages. Then preview `docs_delete`; use `recursive:true` only when deletion of all descendants is intended. Remaining external references block deletion so they can be repaired explicitly.",
    anchors: ["Move the asset before you delete its page", "The service updates the references in other pages", "only when you intend to delete all descendants", "Remaining external references block the delete, so you can repair them first"],
    behavior: { tools: ["docs_asset_read", "docs_asset_move", "docs_delete"] },
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
    anchors: ["to create a validated Canvas or Sequence sidecar before you insert its component block", "Use the asset upload, read, and delete tools for media and attachments", "Use the annotation tools for discussion", "Use the proposal and changeset tools when the task asks for staged review"],
    behavior: { tools: ["docs_component_create"] },
  },
  generated("references/components.md", "choose-block", { topic: "components" }, 143),
  generated("references/components/call-stack.md", "choose-block", { component: "call-stack" }, 175),
  generated("references/components/canvas.md", "choose-block", { component: "canvas" }, 163),
  generated("references/components/code.md", "choose-block", { component: "code" }, 372),
  generated("references/components/component-tree.md", "choose-block", { component: "component-tree" }, 161),
  generated("references/components/file-explorer.md", "choose-block", { component: "file-explorer" }, 152),
  generated("references/components/file-tree.md", "choose-block", { component: "file-tree" }, 215),
  generated("references/components/interaction-surface.md", "choose-block", { component: "interaction-surface" }, 502),
  generated("references/components/process-outline.md", "choose-block", { component: "process-outline" }, 461),
  generated("references/components/pseudocode.md", "choose-block", { component: "pseudocode" }, 156),
  generated("references/components/rich-text.md", "choose-block", { component: "rich-text" }, 207),
  generated("references/components/sequence.md", "choose-block", { component: "sequence" }, 228),
  generated("references/components/stack.md", "choose-block", { component: "stack" }, 158),
  generated("references/components/state-shape.md", "choose-block", { component: "state-shape" }, 401),
  generated("references/components/structured-table.md", "choose-block", { component: "structured-table" }, 266),
  generated("references/standards.md", "edit-page", { topic: "all" }, 1552),
];

/** The full manifest. Each unit carries its file's pinned sha256, and a generated unit carries its whole file as text. */
export async function guidanceManifest(root = SKILL_ROOT): Promise<ManifestUnit[]> {
  return Promise.all(UNITS.map(async unit => ({
    ...unit,
    sha256: PINNED_SHA256[unit.file]!,
    text: unit.text ?? (await readFile(join(root, unit.file), "utf8")).split("\n").slice(0, unit.lines[1]).join("\n"),
  })));
}

/** Writes that skip the style gate: tree, annotation, review-decision, asset, undo, restore and lint-fix writes. */
export const STYLE_GATE_EXEMPT: ReadonlySet<string> = new Set(["docs_create", "docs_move", "docs_rename", "docs_delete", "docs_set_title", "docs_annotation_add", "docs_annotation_reply", "docs_annotation_resolve", "docs_annotation_thread", "docs_proposal_accept", "docs_proposal_reject", "docs_changeset_stage", "docs_changeset_accept", "docs_changeset_reject", "docs_asset_upload", "docs_asset_move", "docs_asset_delete", "docs_undo", "docs_management_restore", "docs_fix_lints"]);
/** The topics a write needs, read in the same task. Every write outside STYLE_GATE_EXEMPT is a content write and needs topic style. The index lists the result as each topic's required_for. */
export const requiredTopics = (write: string): readonly string[] => STYLE_GATE_EXEMPT.has(write) ? [] : ["style"];

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
