// Summarizes docs/99-appendix/10-style-guide, which stays the source of truth. docs_begin returns it first.
export const STYLE_DIGEST: readonly string[] = [
  "Bullets are the default shape. Write a lead sentence, then bullets that are complete sentences. The lead plus the bullets must read as a well-written paragraph (the join test).",
  "Put a bold label or short phrase in the parent bullet and its supporting facts in sub-bullets. Give each bullet one idea. Nest a second idea instead of packing the line.",
  "Cap lists at about 5 items. Split or rank longer lists. Number sequential steps, one action per step.",
  "Open every page with a 2 to 4 sentence paragraph. Keep each section short enough to scan in one screen. Use Title Case headings.",
  "Give each sentence one thought. Review sentences over about 25 words.",
  "Use periods, not semicolons or em dashes. Use a colon only before a list or example. Never open a block with a label and a colon, such as \"Kernel changes:\".",
  "Keep table cells to short facts. Put explanation in bullets near the table, and never restate its rows.",
  "Lead with the fact. Use real numbers, paths, and names. No preamble, recap, or change-log voice.",
  "Each section stands alone. Define or link every label and term it uses.",
  "Write results list style_findings, some model-judged, for changed blocks. Fix them as you go. docs_check with task_id blocks on the ones a task adds.",
];
