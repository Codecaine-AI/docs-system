import type { ThemeTokenDefinition } from "../types";
import { color } from "./color";
import { dsNumber } from "../../design-tokens";

export const stateShape: Record<string, Record<string, ThemeTokenDefinition>> = {
  // State Shape (theme lab, 2026-10-01): a plain reference panel (head with
  // the family tile, mono name and source reference), one field ledger, and
  // the JSON example beside it, the whole panel one code surface (the dark
  // code panel in both page modes). Colors default to the code theme's
  // syntax roles, the way the editor colors a TypeScript type (names
  // --syntax-key, types --syntax-type, ? and type punctuation
  // --syntax-punctuation; descriptions --docs-muted); the example pane's
  // furniture (link wash, pin rail) rides the shared linked-panels tokens in
  // "linking".
  "state-shape": {
    border: color("--docs-shape-border"),
    bg: color("--docs-shape-bg"),
    name: color("--docs-shape-name"),
    type: color("--docs-shape-type"),
    // Union pipes, braces and other punctuation in the type column.
    muted: color("--docs-shape-muted"),
    optionalFg: color("--docs-shape-optional-fg"),
    rule: color("--docs-shape-rule"),
    headerBg: color("--docs-shape-header-bg"),
    headerFg: color("--docs-shape-header-fg"),
    // The head's bottom rule.
    headerRule: color("--docs-shape-header-rule"),
    descFg: color("--docs-shape-desc-fg"),
    // The nesting connectors (file-tree elbows; ink at 75% like outline rows).
    childRule: color("--docs-shape-child-rule"),
    // Field rows: vertical padding and a height floor (rows still grow to fit a description).
    rowPad: {
      vars: ["--docs-shape-row-pad"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 5,
    },
    rowMinHeight: {
      vars: ["--docs-shape-row-min-height"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.7", "px"),
    },
    // Field names are the row's one weight-500 element: its focal point.
    nameWeight: {
      vars: ["--docs-shape-name-weight"],
      kind: "number",
      min: 300,
      max: 800,
      step: 100,
      defaultValue: dsNumber("font.weight.medium", ""),
    },
    // The fixed name column, shared by every field ledger (State Shape fields,
    // Interaction Surface params and returns), in ch of the mono name font so
    // the type column starts at the same x in every block.
    nameWidth: {
      vars: ["--docs-shape-name-width"],
      kind: "length",
      min: 12,
      max: 48,
      step: 1,
      unit: "ch",
      defaultValue: 24,
    },
    textSize: {
      vars: ["--docs-shape-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.code", "px"),
    },
    typeTextSize: {
      vars: ["--docs-shape-type-text-size"],
      kind: "length",
      min: 9,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.code", "px"),
    },
    descTextSize: {
      vars: ["--docs-shape-desc-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    headerTextSize: {
      vars: ["--docs-shape-header-text-size"],
      kind: "length",
      min: 10,
      max: 22,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.code", "px"),
    },
    headerWeight: {
      vars: ["--docs-shape-header-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 100,
      defaultValue: dsNumber("font.weight.semibold", ""),
    },
    // Horizontal inset shared by the head and the field rows.
    padX: {
      vars: ["--docs-shape-pad-x"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.4", "px"),
    },
    headerPadY: {
      vars: ["--docs-shape-header-pad-y"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.1-5", "px"),
    },
    borderWidth: {
      vars: ["--docs-shape-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    radius: {
      vars: ["--docs-shape-radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    // Hairline between field rows.
    ruleWidth: {
      vars: ["--docs-shape-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    headerRuleWidth: {
      vars: ["--docs-shape-header-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    // Divider between the fields and the example pane (left edge side by side, top edge stacked).
    paneRuleWidth: {
      vars: ["--docs-shape-pane-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    // Nested fields: one indent per level behind a guide of this width.
    indent: {
      vars: ["--docs-shape-indent"],
      kind: "length",
      min: 8,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.4", "px"),
    },
    childRuleWidth: {
      vars: ["--docs-shape-child-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
  },
};
