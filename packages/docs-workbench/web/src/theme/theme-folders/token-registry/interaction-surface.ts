import type { ThemeTokenDefinition } from "../types";
import { color } from "./color";
import { dsNumber } from "../../design-tokens";

export const interactionSurface: Record<string, Record<string, ThemeTokenDefinition>> = {
  // Interaction Surface (theme lab, 2026-10-01): one reference panel, the
  // title in its head, operations as rows. Most --docs-interaction-* colors
  // DEFAULT to the matching --docs-shape-* token in semantic.css (and in the
  // component's var() fallbacks): untouched, the block follows the State
  // shape knobs; set here, the override wins for this block only. "Header"
  // is the operation line; "Column head" the Parameters / Returns labels.
  // The kind badge reads the --docs-kind-* role tokens directly; its knobs
  // write those role vars (only this block reads them), declared once for
  // every theme scope in semantic.css's role block.
  // Every length default must equal both the semantic.css default and the
  // component's literal var() fallback, so a slider starts where the
  // unstyled block actually renders. Corner radius follows the global
  // --radius (2px at stock).
  "interaction-surface": {
    actionFg: color("--docs-kind-action"),
    actionLine: color("--docs-kind-action-line"),
    actionSoft: color("--docs-kind-action-soft"),
    queryFg: color("--docs-kind-query"),
    queryLine: color("--docs-kind-query-line"),
    querySoft: color("--docs-kind-query-soft"),
    eventFg: color("--docs-kind-event"),
    eventLine: color("--docs-kind-event-line"),
    eventSoft: color("--docs-kind-event-soft"),
    border: color("--docs-interaction-border"),
    bg: color("--docs-interaction-bg"),
    rule: color("--docs-interaction-rule"),
    titleFg: color("--docs-interaction-title-fg"),
    // The operation name on each row (default: the function syntax role).
    headerFg: color("--docs-interaction-header-fg"),
    // The "Parameters" / "Returns <Type>" card head bars (ink, a heading).
    columnHeadFg: color("--docs-interaction-column-head-fg"),
    sigName: color("--docs-interaction-sig-name"),
    sigType: color("--docs-interaction-sig-type"),
    sigPunct: color("--docs-interaction-sig-punct"),
    noteName: color("--docs-interaction-note-name"),
    noteType: color("--docs-interaction-note-type"),
    noteFg: color("--docs-interaction-note-fg"),
    childRule: color("--docs-interaction-child-rule"),
    // Panel frame: corner radius, border, and the row hairlines.
    radius: {
      vars: ["--docs-interaction-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    borderWidth: {
      vars: ["--docs-interaction-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    ruleWidth: {
      vars: ["--docs-interaction-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    // One horizontal inset for the head, operation lines, labels and ledger rows.
    padX: {
      vars: ["--docs-interaction-pad-x"],
      kind: "length",
      min: 4,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.4", "px"),
    },
    // The surface title in the panel head.
    titleTextSize: {
      vars: ["--docs-interaction-title-text-size"],
      kind: "length",
      min: 12,
      max: 22,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    titleWeight: {
      vars: ["--docs-interaction-title-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.semibold", ""),
    },
    // Operation line: its height comes from the vertical padding.
    headerPadY: {
      vars: ["--docs-interaction-header-pad-y"],
      kind: "length",
      min: 4,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 9,
    },
    headerTextSize: {
      vars: ["--docs-interaction-header-text-size"],
      kind: "length",
      min: 12,
      max: 22,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.code", "px"),
    },
    headerWeight: {
      vars: ["--docs-interaction-header-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.medium", ""),
    },
    // Operation purpose and parameter / returned-field descriptions.
    descTextSize: {
      vars: ["--docs-interaction-desc-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    descLineHeight: {
      vars: ["--docs-interaction-desc-line-height"],
      kind: "length",
      min: 12,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.5", "px"),
    },
    // The "Parameters" / "Returns" section labels.
    columnHeadTextSize: {
      vars: ["--docs-interaction-column-head-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-sm", "px"),
    },
    columnHeadPadY: {
      vars: ["--docs-interaction-column-head-pad-y"],
      kind: "length",
      min: 0,
      max: 20,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.2", "px"),
    },
    // Ledger rows (parameters and returned fields).
    rowPad: {
      vars: ["--docs-interaction-row-pad"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 5,
    },
    indent: {
      vars: ["--docs-interaction-indent"],
      kind: "length",
      min: 8,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.4", "px"),
    },
    noteNameTextSize: {
      vars: ["--docs-interaction-note-name-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.code", "px"),
    },
    noteNameWeight: {
      vars: ["--docs-interaction-note-name-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.medium", ""),
    },
    noteTypeTextSize: {
      vars: ["--docs-interaction-note-type-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.code", "px"),
    },
    // Signature text size and line height are NOT here: the signature pane
    // is a shared CodeLines panel, tuned once in the "linking" folder.
  },
};
