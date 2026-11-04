// Summarizes docs/99-appendix/10-style-guide, which stays the source of truth. docs_begin returns it first.
export const STYLE_DIGEST: readonly string[] = [
  "Bullets are the default shape. Write a lead sentence, then bullets that are complete sentences. The lead plus the bullets must read as a well-written paragraph (the join test).",
  "Put a bold label in a parent bullet only when 3 or more facts sit under it. Write 1 or 2 facts as plain bullets or a short paragraph. A label that names a section is a heading. Give each bullet one idea.",
  "Match the source. List every rule, route, status code, error cause, option, or file it has, or say the list is partial and where the rest lives. Write every, all, only, never, nothing, or always only when a source line proves it. A code example must run as written when copied.",
  "Cap lists at about 5 items. Split or rank longer lists. Number sequential steps, one action per step.",
  "Open every page with a 2 to 4 sentence paragraph. Keep each section short enough to scan in one screen. Use Title Case headings.",
  "Give each sentence one thought. Review sentences over about 25 words.",
  "Use periods, not semicolons or em dashes. Use a colon only before a list or example. Never open a block with a label and a colon, such as \"Kernel changes:\".",
  "Show a shape in its typed block, not in bullets: fields in state-shape, folders in file-tree, an execution path in process-outline, connections in canvas, call order in sequence. Keep plain facts and reader steps as lists.",
  "Keep table cells to short facts. Put explanation in bullets near the table, and never restate its rows.",
  "Lead with the fact. Use real numbers, paths, and names. No preamble, recap, or change-log voice.",
  "Each section stands alone. Define or link every label and term it uses.",
  "Write results list style_findings, some model-judged, for changed blocks. Fix them as you go. docs_check with task_id blocks on the ones a task adds.",
];
