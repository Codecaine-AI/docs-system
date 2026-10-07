import type { ThemeTokenDefinition } from "../types";
import { color } from "./color";
import { dsNumber } from "../../design-tokens";

export const processOutline: Record<string, Record<string, ThemeTokenDefinition>> = {
  // Process Outline (docs-viewer process-outline/ProcessOutlineDocsBlock).
  // Theme-lab look: each root step is a panel (frame, head strip with the flow
  // tile and the root text as Title text) that follows the page, coloured in
  // the VS Code theme for the mode: Light+ on the light page, Dark+ on the
  // dark page (Keyword #AF00DB / #C586C0, Note text and the // marker
  // #008000 / #6A9955; typed chips likewise). Steps are sans text on neutral
  // 1px rails ending in plain file-tree elbows (no arrowhead), and the Depth
  // 1..6 colors tint only the note accent and the selection (levels past 6
  // inherit depth 6). Every default is the value the component draws, read
  // with that same literal (the LIGHT value) as its fallback; semantic.css
  // sets the per-mode values. The strength knobs (-tint / accent) are UNITLESS
  // PERCENTAGES, not lengths: the component multiplies them by 1% inside
  // color-mix() at the use site, because a var() in a custom property resolves
  // at :root where the depth color does not exist. The note box (background,
  // border, rule, padding) defaults to nothing; a theme that wants the
  // bordered note card back sets those. Text-size minimums sit at the 12px
  // floor (13px for the title), so no slider travel is dead.
  "process-outline": {
    ink: color("--docs-process-outline-ink"),
    deepInk: color("--docs-process-outline-deep-ink"),
    titleFg: color("--docs-process-outline-title-fg"),
    bg: color("--docs-process-outline-bg"),
    headerBg: color("--docs-process-outline-header-bg"),
    rail: color("--docs-process-outline-rail"),
    cycle1: color("--docs-process-outline-cycle-1"),
    cycle2: color("--docs-process-outline-cycle-2"),
    cycle3: color("--docs-process-outline-cycle-3"),
    cycle4: color("--docs-process-outline-cycle-4"),
    cycle5: color("--docs-process-outline-cycle-5"),
    cycle6: color("--docs-process-outline-cycle-6"),
    keywordFg: color("--docs-process-outline-keyword-fg"),
    noteFg: color("--docs-process-outline-note-fg"),
    // Note rule and bullet dots are flat colors of their own; Note accent
    // strength mixes the level's depth color into both and is 0 by default.
    noteRule: color("--docs-process-outline-note-rule"),
    noteBullet: color("--docs-process-outline-note-bullet"),
    noteBg: color("--docs-process-outline-note-bg"),
    noteBorder: color("--docs-process-outline-note-border"),
    // Typed chips: the chip fill; the text color comes from the syntax role
    // the chip's content matches (path, type, call, literal, property).
    codeBg: color("--docs-process-outline-code-bg"),
    selectBg: color("--docs-process-outline-select-bg"),
    // The panel frame and the padding inside the body (bottom padding is
    // Padding Y + 4px).
    border: color("--docs-process-outline-border"),
    borderWidth: {
      vars: ["--docs-process-outline-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    padY: {
      vars: ["--docs-process-outline-pad-y"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    padX: {
      vars: ["--docs-process-outline-pad-x"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    indent: {
      vars: ["--docs-process-outline-indent"],
      kind: "length",
      min: 16,
      max: 72,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.7", "px"),
    },
    rowGap: {
      vars: ["--docs-process-outline-row-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.1", "px"),
    },
    // Branch gap spaces the phases (a root's children) when they have
    // substeps; Root gap spaces root panels.
    branchGap: {
      vars: ["--docs-process-outline-branch-gap"],
      kind: "length",
      min: 0,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.4", "px"),
    },
    rootGap: {
      vars: ["--docs-process-outline-root-gap"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    // Clear space between the end of each elbow's tick and the step text.
    arrowGap: {
      vars: ["--docs-process-outline-arrow-gap"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.1", "px"),
    },
    lineHeight: {
      vars: ["--docs-process-outline-line-height"],
      kind: "length",
      min: 16,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.6", "px"),
    },
    textSize: {
      vars: ["--docs-process-outline-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    rootTextSize: {
      vars: ["--docs-process-outline-root-text-size"],
      kind: "length",
      min: 13,
      max: 22,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    rootWeight: {
      vars: ["--docs-process-outline-root-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.semibold", ""),
    },
    branchWeight: {
      vars: ["--docs-process-outline-branch-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.semibold", ""),
    },
    stepWeight: {
      vars: ["--docs-process-outline-step-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.regular", ""),
    },
    keywordWeight: {
      vars: ["--docs-process-outline-keyword-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.medium", ""),
    },
    emptyTextSize: {
      vars: ["--docs-process-outline-empty-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-xs", "px"),
    },
    noteTextSize: {
      vars: ["--docs-process-outline-note-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    noteLineHeight: {
      vars: ["--docs-process-outline-note-line-height"],
      kind: "length",
      min: 12,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("line-height.code", "px"),
    },
    noteInset: {
      vars: ["--docs-process-outline-note-inset"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.0", "px"),
    },
    noteBorderWidth: {
      vars: ["--docs-process-outline-note-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.none", "px"),
    },
    noteRuleWidth: {
      vars: ["--docs-process-outline-note-rule-width"],
      kind: "length",
      min: 0,
      max: 6,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.none", "px"),
    },
    notePadY: {
      vars: ["--docs-process-outline-note-pad-y"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.0-5", "px"),
    },
    notePadX: {
      vars: ["--docs-process-outline-note-pad-x"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.0", "px"),
    },
    // Space between the left rule and the note text, on top of Note padding X.
    noteRuleGap: {
      vars: ["--docs-process-outline-note-rule-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.0", "px"),
    },
    // The trace mark is a quiet mono "trace" tag after the step text.
    traceTextSize: {
      vars: ["--docs-process-outline-trace-text-size"],
      kind: "length",
      min: 12,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-xs", "px"),
    },
    // A focus-ring outline marks the step being hand-edited (the block-wide
    // selection wash is suppressed); 0 leaves just the caret.
    focusRing: {
      vars: ["--docs-process-outline-focus-ring"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    // Rails and elbows draw at Stroke.
    stroke: {
      vars: ["--docs-process-outline-stroke"],
      kind: "length",
      min: 0.5,
      max: 4,
      step: 0.25,
      unit: "px",
      defaultValue: dsNumber("border.width.ring", "px"),
    },
    noteAccent: {
      vars: ["--docs-process-outline-note-accent"],
      kind: "number",
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 0,
    },
    // Dragging across step lines highlights each line in its own depth colour
    // instead of washing the block. Tint 0 turns the range invisible; a theme
    // that wants a flat selection colour sets select-bg opaque and drops the
    // tint.
    selectTint: {
      vars: ["--docs-process-outline-select-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 15,
    },
    selectPad: {
      vars: ["--docs-process-outline-select-pad"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("space.0-5", "px"),
    },
  },
};
