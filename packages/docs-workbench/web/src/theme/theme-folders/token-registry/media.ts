import type { ThemeTokenDefinition } from "../types";
import { color } from "./color";
import { dsNumber } from "../../design-tokens";

export const media: Record<string, Record<string, ThemeTokenDefinition>> = {
  // Callout (docs-viewer rich-text/CalloutDocsBlock — one renderer for both
  // surfaces, four variants: eyebrow, hairline, rail, tab). `border`
  // recolors every variant's rule for every tone; it is undeclared in
  // semantic.css, and unset the rule follows each tone's accent. `fg` is the
  // body ink. Each tone carries its accent (icon, rail, rules), tint (the
  // eyebrow and tab fill) and title ink; risk renders with the warning
  // palette. `railWidth` drives the eyebrow and rail variants' rail,
  // `hairlineWidth` the hairline divider and the tab's top rule. `padY` and
  // `radius` shape the filled variants (eyebrow, tab); `radius` follows the
  // global --radius in semantic.css (2px at stock). `bodyTextScale`
  // multiplies the rail's reading size.
  callout: {
    border: color("--docs-callout-border"),
    fg: color("--docs-callout-fg"),
    infoAccent: color("--docs-callout-info-accent"),
    infoTint: color("--docs-callout-info-tint"),
    infoTitleFg: color("--docs-callout-info-title-fg"),
    decisionAccent: color("--docs-callout-decision-accent"),
    decisionTint: color("--docs-callout-decision-tint"),
    decisionTitleFg: color("--docs-callout-decision-title-fg"),
    warningAccent: color("--docs-callout-warning-accent"),
    warningTint: color("--docs-callout-warning-tint"),
    warningTitleFg: color("--docs-callout-warning-title-fg"),
    riskAccent: color("--docs-callout-risk-accent"),
    riskTint: color("--docs-callout-risk-tint"),
    riskTitleFg: color("--docs-callout-risk-title-fg"),
    successAccent: color("--docs-callout-success-accent"),
    successTint: color("--docs-callout-success-tint"),
    successTitleFg: color("--docs-callout-success-title-fg"),
    railWidth: {
      vars: ["--docs-callout-rail-width"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.rail", "px"),
    },
    hairlineWidth: {
      vars: ["--docs-callout-hairline-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.none", "px"),
    },
    radius: {
      vars: ["--docs-callout-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    padX: {
      vars: ["--docs-callout-pad-x"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 14,
    },
    padY: {
      vars: ["--docs-callout-pad-y"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.0-5", "px"),
    },
    // Stock follows the body size: semantic.css declares
    // var(--style-font-size, 18px), so the label line matches the body.
    titleTextSize: {
      vars: ["--docs-callout-title-text-size"],
      kind: "length",
      min: 10,
      max: 24,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.reading", "px"),
    },
    titleWeight: {
      vars: ["--docs-callout-title-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.semibold", ""),
    },
    iconSize: {
      vars: ["--docs-callout-icon-size"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.4", "px"),
    },
    bodyTextScale: {
      vars: ["--docs-callout-body-text-scale"],
      kind: "number",
      min: 0.6,
      max: 1.5,
      step: 0.05,
      defaultValue: 1,
    },
    margin: {
      vars: ["--docs-callout-margin"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.5", "px"),
    },
  },
  divider: {
    color: color("--docs-divider-color"),
    thickness: {
      vars: ["--docs-divider-thickness"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    // Margin above and below, in em of the reading size.
    spacing: {
      vars: ["--docs-divider-spacing"],
      kind: "number",
      min: 0,
      max: 6,
      step: 0.05,
      defaultValue: 2,
    },
  },
  // Image and video share one media panel (docs-viewer media-panel.tsx):
  // `border` / `borderWidth` / `radius` frame the panel, `margin` spaces the
  // block. Image: the block is the framed panel only, with no head row, so it
  // has no caption knobs. Video: the caption knobs (unchanged) set the muted
  // line below the panel. `radius` follows the global --radius in
  // semantic.css (2px at stock).
  image: {
    border: color("--docs-image-border"),
    borderWidth: {
      vars: ["--docs-image-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    radius: {
      vars: ["--docs-image-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    margin: {
      vars: ["--docs-image-margin"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.6", "px"),
    },
  },
  video: {
    border: color("--docs-video-border"),
    caption: color("--docs-video-caption-fg"),
    borderWidth: {
      vars: ["--docs-video-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    radius: {
      vars: ["--docs-video-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    captionTextSize: {
      vars: ["--docs-video-caption-text-size"],
      kind: "length",
      min: 9,
      max: 20,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    captionGap: {
      vars: ["--docs-video-caption-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.2", "px"),
    },
    margin: {
      vars: ["--docs-video-margin"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.6", "px"),
    },
  },
  // File tree (docs-viewer file-tree/FileTreeDocsBlock; the file explorer
  // reads the same knobs). Defaults are the theme lab's trees row system:
  // 28px rows, 13px mono names, 13.5px sans notes, folders at file weight.
  // `radius` follows the global --radius in semantic.css (2px at stock). Each
  // diff state (added / removed / modified / renamed) is ONE knob writing
  // three vars — name ink, gutter marker, row tint hue — whose stock values
  // are the shared --docs-diff-* role and its roster solid. `changeTint` is a
  // UNITLESS PERCENTAGE: the component multiplies it by 1% inside
  // color-mix(), because a rail colour override is an opaque hex and the row
  // wash has to stay a soft tint (8 reproduces --docs-diff-*-bg).
  "file-tree": {
    bg: color("--docs-file-tree-bg"),
    border: color("--docs-file-tree-border"),
    borderWidth: {
      vars: ["--docs-file-tree-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("border.width.hairline", "px"),
    },
    radius: {
      vars: ["--docs-file-tree-radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("radius.base", "px"),
    },
    padY: {
      vars: ["--docs-file-tree-pad-y"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.2", "px"),
    },
    padX: {
      vars: ["--docs-file-tree-pad-x"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("space.3", "px"),
    },
    textSize: {
      vars: ["--docs-file-tree-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.code", "px"),
    },
    lineHeight: {
      vars: ["--docs-file-tree-line-height"],
      kind: "length",
      min: 14,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: dsNumber("line-height.row", "px"),
    },
    folderFg: color("--docs-file-tree-folder-fg"),
    folderWeight: {
      vars: ["--docs-file-tree-folder-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.regular", ""),
    },
    fileFg: color("--docs-file-tree-file-fg"),
    fileWeight: {
      vars: ["--docs-file-tree-file-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: dsNumber("font.weight.regular", ""),
    },
    note: color("--docs-file-tree-note-fg"),
    noteTextSize: {
      vars: ["--docs-file-tree-note-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: dsNumber("font.size.ui-md", "px"),
    },
    guide: color("--docs-file-tree-guide-fg"),
    mutedFg: color("--docs-file-tree-muted-fg"),
    added: color(
      "--docs-file-tree-added-fg",
      "--docs-file-tree-added-marker",
      "--docs-file-tree-added-tint",
    ),
    removed: color(
      "--docs-file-tree-removed-fg",
      "--docs-file-tree-removed-marker",
      "--docs-file-tree-removed-tint",
    ),
    modified: color(
      "--docs-file-tree-modified-fg",
      "--docs-file-tree-modified-marker",
      "--docs-file-tree-modified-tint",
    ),
    renamed: color(
      "--docs-file-tree-renamed-fg",
      "--docs-file-tree-renamed-marker",
      "--docs-file-tree-renamed-tint",
    ),
    changeTint: {
      vars: ["--docs-file-tree-change-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 8,
    },
  },
};
