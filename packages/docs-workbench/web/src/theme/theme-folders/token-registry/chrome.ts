import type { ThemeTokenDefinition } from "../types";
import { color } from "./color";
import { dsNumber } from "../../design-tokens";

export const chrome: Record<string, Record<string, ThemeTokenDefinition>> = {
  // -- non-block surfaces ---------------------------------------------------
  shell: {
    background: color("--background", "--card", "--popover"),
    sidebar: color("--sidebar"),
    text: color(
      "--foreground",
      "--card-foreground",
      "--popover-foreground",
      "--sidebar-foreground",
      "--docs-viewer-text-body",
      "--docs-viewer-text-heading",
    ),
    accent: color("--accent"),
    link: color("--docs-viewer-link"),
  },
  surfaces: {
    border: color("--border", "--input", "--sidebar-border", "--docs-border-default"),
    muted: color("--muted", "--docs-surface-muted"),
    icon: color("--docs-icon-muted"),
    radius: {
      vars: ["--radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
  },
  // The inline `code` mark chip (docs-viewer render/block-classes.ts
  // INLINE_CODE_CLASSES + the workbench's unlayered index.css rule — both
  // read every var below). Text size and padding are UNITLESS em multipliers
  // (the consumers multiply by 1em), so the chip keeps scaling with the text
  // it sits in; a px knob would flatten a heading's chip to a paragraph's.
  "inline-code": {
    fg: color("--docs-inline-code-fg"),
    // Typed inline code: the chip's text color per kind of content (the
    // viewer's components/typed-chip.ts classifier). Each defaults to the VS
    // Code color (Light+ / Dark+); set all seven to the chip ink for neutral
    // chips.
    pathFg: color("--docs-inline-code-path-fg"),
    stringFg: color("--docs-inline-code-string-fg"),
    typeFg: color("--docs-inline-code-type-fg"),
    callFg: color("--docs-inline-code-call-fg"),
    literalFg: color("--docs-inline-code-literal-fg"),
    keywordLiteralFg: color("--docs-inline-code-keyword-fg"),
    propFg: color("--docs-inline-code-prop-fg"),
    bg: color("--docs-inline-code-bg"),
    border: color("--docs-inline-code-border"),
    // 0px by default: the chip is borderless until a theme widens it.
    borderWidth: {
      vars: ["--docs-inline-code-border-width"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.none", "px"),
    },
    // semantic.css points the default at the global --radius (2px at stock).
    radius: {
      vars: ["--docs-inline-code-radius"],
      kind: "length",
      min: 0,
      max: 12,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    textSize: {
      vars: ["--docs-inline-code-text-size"],
      kind: "number",
      min: 0.6,
      max: 1.2,
      step: 0.05,
      defaultValue: 0.85,
    },
    padX: {
      vars: ["--docs-inline-code-pad-x"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.35,
    },
    padY: {
      vars: ["--docs-inline-code-pad-y"],
      kind: "number",
      min: 0,
      max: 0.5,
      step: 0.05,
      defaultValue: 0.1,
    },
    // The var is unset by default so the chip INHERITS its weight (bold text
    // and headings keep theirs); 400 is what that resolves to in body text.
    weight: {
      vars: ["--docs-inline-code-weight"],
      kind: "number",
      min: 300,
      max: 800,
      step: 100,
      defaultValue: dsNumber("font.weight.regular", ""),
    },
  },
  "editor-controls": {
    highlight: color("--docs-highlight-color"),
    dropLine: color("--docs-dropcursor-color"),
    grip: color("--docs-grip-color"),
  },
  // The shared linked-panels layer (docs-viewer components/linked-panels):
  // zebra stripe on even code lines, the lit-extent background wash, and
  // the pin/rail accent — consumed by the state-shape, interaction-surface,
  // and code blocks. Registered ONCE here, not per component.
  // The code block's own zebra (code.zebra) defaults to this zebra, so this
  // knob restripes code blocks too until that one is set.
  linking: {
    zebra: color("--docs-zebra"),
    highlight: color("--docs-link-bg"),
    pin: color("--docs-link-pin"),
    // How strongly the lit wash mixes off the pin color — a UNITLESS PERCENT
    // (semantic.css multiplies by 1%). Dark runs cooler (12, so the pin-blue
    // lit numbers keep 4.5:1 on dark panels); the registry default is the
    // light value. Setting Link highlight outright bypasses it.
    washStrength: {
      vars: ["--docs-link-wash"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 14,
    },
    railWidth: {
      vars: ["--docs-link-rail-width"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.rail", "px"),
    },
    ringWidth: {
      vars: ["--docs-link-ring-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.ring", "px"),
    },
    // The CodeLines panel (state-shape example, interaction-surface
    // signature): its own metrics, independent of the code block's.
    textSize: {
      vars: ["--docs-link-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.code", "px"),
    },
    lineHeight: {
      vars: ["--docs-link-line-height"],
      kind: "length",
      min: 14,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("line-height.code", "px"),
    },
    gutterTextSize: {
      vars: ["--docs-link-gutter-text-size"],
      kind: "length",
      min: 8,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-xs", "px"),
    },
    gutterWidth: {
      vars: ["--docs-link-gutter-width"],
      kind: "length",
      min: 24,
      max: 96,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.10", "px"),
    },
  },
  annotate: {
    accent: color("--annotation-accent"),
    surface: color("--annotation-surface"),
    text: color("--annotation-text"),
    muted: color("--annotation-muted"),
    border: color("--annotation-border"),
    danger: color("--annotation-danger"),
    add: color("--docs-annotation-add"),
    del: color("--docs-annotation-del"),
    wash: color("--docs-annotation-wash"),
  },
};
