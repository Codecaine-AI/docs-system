import type { ThemeTokenDefinition } from "../types";
import { color } from "./color";
import { dsNumber } from "../../design-tokens";

export const text: Record<string, Record<string, ThemeTokenDefinition>> = {
  // -- one file per block-vocabulary type ------------------------------------
  // Rich-text blocks (docs-viewer render/block-classes.ts + components/
  // rich-text). Both surfaces share one class string per block, so a knob
  // moves read and edit together.
  //
  // `spacing`, the heading `h*Size` knobs and the `*TextScale` knobs are
  // UNITLESS multipliers — the class multiplies by 1em (or by the rail's
  // reading size). The values they replaced came from Tailwind Typography's
  // em-relative prose-sm metrics, which is also why their defaults are the
  // long decimals below: they are those metrics exactly, so nothing moves
  // until a knob does, at any reading size.
  paragraph: {
    fg: color("--docs-paragraph-fg"),
    // Margin above and below, in em of the paragraph's own text size.
    spacing: {
      vars: ["--docs-paragraph-spacing"],
      kind: "number",
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 1,
    },
  },
  heading: {
    fg: color("--docs-heading-fg"),
    weight: {
      vars: ["--docs-heading-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.semibold", ""),
    },
    marginTop: {
      vars: ["--docs-heading-margin-top"],
      kind: "length",
      min: 0,
      max: 72,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.10", "px"),
    },
    marginBottom: {
      vars: ["--docs-heading-margin-bottom"],
      kind: "length",
      min: 0,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    // Per-level size, in em of the reading size. h4-h6 render at the reading
    // size itself and have no knob.
    h1Size: {
      vars: ["--docs-heading-h1-size"],
      kind: "number",
      min: 1,
      max: 4,
      step: 0.05,
      defaultValue: 1.875,
    },
    h2Size: {
      vars: ["--docs-heading-h2-size"],
      kind: "number",
      min: 1,
      max: 3,
      step: 0.05,
      defaultValue: 1.25,
    },
    h3Size: {
      vars: ["--docs-heading-h3-size"],
      kind: "number",
      min: 1,
      max: 3,
      step: 0.05,
      defaultValue: 1,
    },
  },
  // Marker sizes and the indent step are rail settings of their own
  // (StyleRailSettings.list), not registry tokens.
  "list-item": {
    marker: color("--docs-list-marker-fg"),
    fg: color("--docs-list-item-fg"),
    itemGap: {
      vars: ["--docs-list-item-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("space.1", "px"),
    },
  },
  // Every var below is read by all three code surfaces — plain read,
  // annotated read, and the editor node view — through the shared constants
  // in docs-viewer components/code/classes.ts and render/block-classes.ts.
  code: {
    bg: color("--docs-code-block-bg"),
    border: color("--docs-code-block-border"),
    borderWidth: {
      vars: ["--docs-code-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    // semantic.css points the default at the global --radius (2px at stock).
    radius: {
      vars: ["--docs-code-radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    textSize: {
      vars: ["--docs-code-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.code", "px"),
    },
    // ONE token drives row height, zebra period and annotation overlays.
    lineHeight: {
      vars: ["--docs-code-line-height"],
      kind: "length",
      min: 14,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("line-height.code", "px"),
    },
    padX: {
      vars: ["--docs-code-pad-x"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    padTop: {
      vars: ["--docs-code-pad-top"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    padBottom: {
      vars: ["--docs-code-pad-bottom"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    // Header strip: family tile, language label, copy button.
    headerHeight: {
      vars: ["--docs-code-header-height"],
      kind: "length",
      min: 20,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.8", "px"),
    },
    headerBg: color("--docs-code-header-bg"),
    headerFg: color("--docs-code-header-fg"),
    headerTextSize: {
      vars: ["--docs-code-header-text-size"],
      kind: "length",
      min: 8,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-xs", "px"),
    },
    headerWeight: {
      vars: ["--docs-code-header-weight"],
      kind: "number",
      min: 300,
      max: 800,
      step: 100,
      defaultValue: dsNumber("font.weight.regular", ""),
    },
    // Syntax roles (VS Code Dark+ / Light+ semantics) — docs-viewer
    // styles/code.css maps every hljs class onto one of these.
    punctuation: color("--syntax-punctuation"),
    keyword: color("--syntax-keyword"),
    control: color("--syntax-control"),
    function: color("--syntax-function"),
    type: color("--syntax-type"),
    key: color("--syntax-key"),
    string: color("--syntax-string"),
    number: color("--syntax-number"),
    boolean: color("--syntax-boolean"),
    null: color("--syntax-null"),
    comment: color("--syntax-comment"),
    regex: color("--syntax-regex"),
    tag: color("--syntax-tag"),
    constant: color("--syntax-constant"),
    selector: color("--syntax-selector"),
    // Hover / chevron color of the EDIT surface's language picker only — the
    // label's resting color is headerFg.
    languageFg: color("--docs-code-lang-fg"),
    annotationAccent: color("--docs-code-annotation-accent"),
    gutterFg: color("--docs-code-gutter-fg"),
    gutterBg: color("--docs-code-gutter-bg"),
    gutterTextSize: {
      vars: ["--docs-code-gutter-text-size"],
      kind: "length",
      min: 8,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-xs", "px"),
    },
    gutterWidth: {
      vars: ["--docs-code-gutter-width"],
      kind: "length",
      min: 24,
      max: 96,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.10", "px"),
    },
    gutterPadX: {
      vars: ["--docs-code-gutter-pad-x"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    // Defaults to the shared linking zebra (semantic.css), so it only needs
    // setting when code blocks should stripe differently from linked panels.
    zebra: color("--docs-code-zebra"),
    rule: color("--docs-code-rule"),
    ruleWidth: {
      vars: ["--docs-code-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    ruleOpacity: {
      vars: ["--docs-code-rule-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.5,
    },
    zebraOpacity: {
      vars: ["--docs-code-zebra-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 1,
    },
    // The notes column inside annotated code panels (annotated read + edit
    // surfaces): the note body size (titles are 1px larger) and column width.
    noteTextSize: {
      vars: ["--docs-code-note-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-sm", "px"),
    },
    notesWidth: {
      vars: ["--docs-code-notes-width"],
      kind: "length",
      min: 200,
      max: 480,
      step: 10,
      unit: "px",
      defaultValue: 280,
    },
    // The notes column's surface. Undeclared in semantic.css: unset, the
    // component mixes the panel's own bg 6% toward white (both page modes).
    notesBg: color("--docs-code-notes-bg"),
    // Selected text inside any code panel; stock is the UA's `Highlight`.
    selection: color("--docs-code-selection"),
  },
};
