import type { ThemeTokenDefinition } from "../types";
import { color } from "./color";
import { dsNumber } from "../../design-tokens";

export const layout: Record<string, Record<string, ThemeTokenDefinition>> = {
  // Sequence embed (docs-workbench pages/SequenceEmbed + sequence-embed.css).
  // The frame knobs style the inline preview the docs viewer owns. The diagram
  // colors feed the sequence package's own --seq-* vars (mapped in
  // sequence-embed.css), so they recolor the SVG without touching the package;
  // a color set in the diagram's own style section still wins. Actor border
  // follows Diagram lines and Note background follows Actor fill until set.
  // The diagram is light-on-white in both modes today, so every default is the
  // same in light and dark.
  sequence: {
    border: color("--docs-sequence-border"),
    bg: color("--docs-sequence-bg"),
    expandFg: color("--docs-sequence-expand-fg"),
    diagramBg: color("--docs-sequence-diagram-bg"),
    diagramText: color("--docs-sequence-diagram-text"),
    diagramLine: color("--docs-sequence-line"),
    actorFill: color("--docs-sequence-actor-fill"),
    actorBorder: color("--docs-sequence-actor-border"),
    noteBg: color("--docs-sequence-note-bg"),
    fragment: color("--docs-sequence-fragment"),
    borderWidth: {
      vars: ["--docs-sequence-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    radius: {
      vars: ["--docs-sequence-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    padding: {
      vars: ["--docs-sequence-padding"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    // Cap on the inline preview's height; the 55vh viewport cap still applies.
    maxHeight: {
      vars: ["--docs-sequence-max-height"],
      kind: "length",
      min: 160,
      max: 1200,
      step: 20,
      unit: "px",
      defaultValue: 420,
    },
    expandTextSize: {
      vars: ["--docs-sequence-expand-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-xs", "px"),
    },
  },
  // Call stack + component tree (docs-viewer outline-rows/OutlineRows): ONE
  // file for both block types, which share the trees row system (the file
  // tree's metrics). Frame and neutrals follow the role tokens; the syntax
  // colors follow the code theme's --syntax-* roles (the rows are a code
  // surface), as semantic.css declares them; a call stack's bold callee is
  // the function color. `radius` follows the global --radius (2px at stock).
  "outline-rows": {
    bg: color("--docs-outline-rows-bg"),
    border: color("--docs-outline-rows-border"),
    borderWidth: {
      vars: ["--docs-outline-rows-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    radius: {
      vars: ["--docs-outline-rows-radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    padY: {
      vars: ["--docs-outline-rows-pad-y"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.2", "px"),
    },
    padX: {
      vars: ["--docs-outline-rows-pad-x"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    textSize: {
      vars: ["--docs-outline-rows-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.code", "px"),
    },
    lineHeight: {
      vars: ["--docs-outline-rows-line-height"],
      kind: "length",
      min: 14,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("line-height.row", "px"),
    },
    ink: color("--docs-outline-rows-ink"),
    commentFg: color("--docs-outline-rows-comment-fg"),
    commentTextSize: {
      vars: ["--docs-outline-rows-comment-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    sourceTextSize: {
      vars: ["--docs-outline-rows-source-text-size"],
      kind: "length",
      min: 8,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-xs", "px"),
    },
    guide: color("--docs-outline-rows-guide"),
    mutedFg: color("--docs-outline-rows-muted-fg"),
    added: color("--docs-outline-rows-added"),
    addedBg: color("--docs-outline-rows-added-bg"),
    removed: color("--docs-outline-rows-removed"),
    removedBg: color("--docs-outline-rows-removed-bg"),
    modified: color("--docs-outline-rows-modified"),
    modifiedBg: color("--docs-outline-rows-modified-bg"),
    variable: color("--docs-outline-rows-var-fg"),
    function: color("--docs-outline-rows-fn-fg"),
    type: color("--docs-outline-rows-type-fg"),
    tag: color("--docs-outline-rows-tag-fg"),
    keyword: color("--docs-outline-rows-keyword-fg"),
    control: color("--docs-outline-rows-control-fg"),
    constant: color("--docs-outline-rows-constant-fg"),
    string: color("--docs-outline-rows-string-fg"),
    number: color("--docs-outline-rows-number-fg"),
    punct: color("--docs-outline-rows-punct-fg"),
    bracket: color("--docs-outline-rows-bracket-fg"),
  },
  // Stack (docs-viewer stack/StackDocsBlock): nested layer containers and
  // leaf cards. Neutrals follow the role tokens; each node color maps onto
  // the category roster (blue 1, green 3, yellow and orange 4, purple 5, pink
  // and red 6; gray is the stack's muted ink). Card background is the page
  // on the light page and the ink mixed 7% into the panel on the dark page.
  // `radius` follows the global --radius (2px at stock).
  stack: {
    ink: color("--docs-stack-ink"),
    mutedFg: color("--docs-stack-muted"),
    detailFg: color("--docs-stack-detail"),
    cardBg: color("--docs-stack-card-bg"),
    arrow: color("--docs-stack-arrow"),
    boundary: color("--docs-stack-boundary"),
    gap: {
      vars: ["--docs-stack-gap"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    radius: {
      vars: ["--docs-stack-radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    blue: color("--docs-stack-blue"),
    green: color("--docs-stack-green"),
    yellow: color("--docs-stack-yellow"),
    orange: color("--docs-stack-orange"),
    purple: color("--docs-stack-purple"),
    red: color("--docs-stack-red"),
    pink: color("--docs-stack-pink"),
    gray: color("--docs-stack-gray"),
  },
  // Canvas embed (docs-workbench pages/CanvasEmbed): the frame around the
  // inline board. `radius` follows the global --radius in semantic.css (2px at
  // stock). The board paints its own opaque background (canvas package), so
  // Background shows only in the Padding mat, which is 0 by default.
  canvas: {
    border: color("--docs-canvas-border"),
    bg: color("--docs-canvas-bg"),
    borderWidth: {
      vars: ["--docs-canvas-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    radius: {
      vars: ["--docs-canvas-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    padding: {
      vars: ["--docs-canvas-padding"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.0", "px"),
    },
  },
};
