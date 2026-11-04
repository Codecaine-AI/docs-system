// Summarizes docs/99-appendix/10-style-guide, which stays the source of truth. docs_begin returns it first.
export const STYLE_DIGEST: readonly string[] = [
  "Bullets are the default. A lead sentence that states a fact, then complete-sentence bullets, must read as one paragraph (the join test). A lead never only says that a list follows.",
  "Use bold-label parent bullets only for 2 or more groups of 3 or more facts. Otherwise keep the facts flat, and make a section label a heading. Give each bullet one idea.",
  "Match the source. List every rule, route, status code, error cause, option, or file it has. Read a file before you say what it holds. Name the function behind each behavior claim, and read its whole body first: every early return and branch. A guarantee names its check, a failure claim names which failures, and a status names every cause. Write every, all, only, never, or always only when a source line proves it. Show each command the reader runs once, in a code block that runs as written unless another block already shows it.",
  "Cap lists at about 5 items. Split or rank longer lists. Number sequential steps, one action per step.",
  "Open every page with a 2 to 4 sentence paragraph. Keep each section short enough to scan in one screen. Use Title Case headings.",
  "Give each sentence one thought. Review sentences over about 25 words.",
  "Use periods, not semicolons or em dashes. Use a colon only before a list or example. Never open a block with a label and a colon, such as \"Kernel changes:\".",
  "Show a shape in its typed block, not in bullets: fields in state-shape, folders in file-tree, an execution path in process-outline, connections in canvas, call order in sequence. Keep plain facts and reader steps as lists.",
  "Keep table cells to short facts. Put explanation in bullets near the table, and never restate its rows.",
  "Lead with the fact. Use real numbers, paths, and names. No preamble, recap, or change-log voice. Write only what the task asks for. An opening names sections only in heading order.",
  "Each section stands alone. Define or link every label and term it uses.",
  "Write results list style_findings, some model-judged, for changed blocks. Fix them as you go. docs_check with task_id blocks on the ones a task adds.",
];
