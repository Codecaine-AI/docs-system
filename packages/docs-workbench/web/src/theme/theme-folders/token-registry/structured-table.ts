import type { ThemeTokenDefinition } from "../types";
import { color } from "./color";
import { dsNumber } from "../../design-tokens";

export const structuredTable: Record<string, Record<string, ThemeTokenDefinition>> = {
  // Every value the table renders is a token here. Some of them DERIVE their
  // semantic.css default from another token rather than holding a literal:
  // Corner radius and Handle radius follow the global --radius (2px at
  // stock), Header text size follows Text size (size - 1px), and the three
  // Column rule tokens follow their Row rule twins. For those, the registry
  // default is what the derivation yields at stock, and a slider parked ON
  // that default means "follow the source token".
  "structured-table": {
    border: color("--docs-table-border"),
    borderWidth: {
      vars: ["--docs-table-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    radius: {
      vars: ["--docs-table-radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    bg: color("--docs-table-bg"),
    headerBg: color("--docs-table-header-bg"),
    headerFg: color("--docs-table-header-fg"),
    headerTextSize: {
      vars: ["--docs-table-header-text-size"],
      kind: "length",
      min: 10,
      max: 24,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    headerWeight: {
      vars: ["--docs-table-header-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.medium", ""),
    },
    headerRule: color("--docs-table-header-rule"),
    headerRuleWidth: {
      vars: ["--docs-table-header-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    headerRuleOpacity: {
      vars: ["--docs-table-header-rule-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 1,
    },
    rowRule: color("--docs-table-row-rule"),
    rowRuleWidth: {
      vars: ["--docs-table-row-rule-width"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    rowRuleOpacity: {
      vars: ["--docs-table-row-rule-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 1,
    },
    columnRule: color("--docs-table-column-rule"),
    // No column rules at stock; raise the width to bring them back.
    columnRuleWidth: {
      vars: ["--docs-table-column-rule-width"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.none", "px"),
    },
    columnRuleOpacity: {
      vars: ["--docs-table-column-rule-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 1,
    },
    rowHoverBg: color("--docs-table-row-hover-bg"),
    cellPaddingY: {
      vars: ["--docs-table-cell-pad-y"],
      kind: "length",
      min: 4,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.1", "px"),
    },
    cellPaddingX: {
      vars: ["--docs-table-cell-pad-x"],
      kind: "length",
      min: 8,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    // Floor for a body row's height; rows still grow to fit wrapped cells.
    // 0px lets Row padding alone set the height.
    rowMinHeight: {
      vars: ["--docs-table-row-min-height"],
      kind: "length",
      min: 0,
      max: 96,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.7", "px"),
    },
    // Body cell text. The range reaches past the prose default (18px) so a
    // table can be set level with the text around it.
    fontSize: {
      vars: ["--docs-table-font-size"],
      kind: "length",
      min: 10,
      max: 24,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    // Unitless multiplier of the cell's own font size, header and body alike.
    lineHeight: {
      vars: ["--docs-table-line-height"],
      kind: "number",
      min: 1,
      max: 2.2,
      step: 0.05,
      defaultValue: dsNumber("line-height.reading", ""),
    },
    bodyWeight: {
      vars: ["--docs-table-body-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.regular", ""),
    },
    fg: color("--docs-table-fg"),
    // Identifier (mono) cells in the first column; other mono cells stay ink.
    keyFg: color("--docs-table-key-fg"),
    handleRadius: {
      vars: ["--docs-table-handle-radius"],
      kind: "length",
      min: 0,
      max: 10,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    handleOffset: {
      vars: ["--docs-table-handle-offset"],
      kind: "length",
      min: 4,
      max: 20,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    selectionPadding: {
      vars: ["--docs-table-selection-pad"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: 3,
    },
  },
};
