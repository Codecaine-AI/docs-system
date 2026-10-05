import type { StyleRailSettings } from "../shell/style-rail-settings";
import { dsNumber } from "./design-tokens";

/**
 * Theme folders — the canonical theme-file format (see
 * docs/20-implementation/40-theming).
 *
 * A theme is a folder: `theme.json` (manifest: name, `base` inheritance,
 * font stacks, optional style-rail defaults) plus `components/<file>.json`
 * token files where every token value is either one string (both modes) or
 * a `{ light, dark }` pair. The loader validates values against
 * THEME_TOKEN_REGISTRY — the closed map from component file + key to the
 * tier-2 CSS vars of the canonical contract (theme/semantic.css) — and
 * compiles one <style> tag with a light and a dark block, so themes are
 * purely an alternative SOURCE for tier-2 tokens; component code and the
 * style-rail overlay are untouched (inline rail overrides still win over
 * any theme).
 *
 * BUILT-IN themes are compiled-in constants with the same shape (they are
 * not user-editable, so they don't need to be files); CUSTOM themes live
 * as folders under the repo's `themes/` directory, served by docs-server
 * (`GET/POST /api/themes`).
 */

export type ThemeModeValue = string | { light: string; dark: string };

export type ThemeComponents = Record<string, Record<string, ThemeModeValue>>;

/** Theme manifests may override any rail leaf without restating its siblings. */
export type StyleRailDefaults = {
  [Key in keyof StyleRailSettings]?: StyleRailSettings[Key] extends object
    ? DeepPartial<StyleRailSettings[Key]>
    : StyleRailSettings[Key];
};

type DeepPartial<Value> = Value extends object
  ? { [Key in keyof Value]?: DeepPartial<Value[Key]> }
  : Value;

export type ThemeManifest = {
  name: string;
  /** Id of the theme this one layers over; missing token values fall through. */
  base?: string;
  /** Dark-mode flag applied when the theme is selected. */
  dark?: boolean;
  /** Font stacks written to the per-surface font tokens (custom stacks allowed). */
  fonts?: Partial<Record<"body" | "heading" | "code" | "number", string>>;
  /**
   * The repo-side style-rail settings file: this block IS where the rail's
   * knobs persist, and loading a theme installs it as the rail's BASELINE
   * (StyleRail.tsx setStyleRailBaseline) — what "default" means, what Reset
   * returns to, and what a --theme-locked serve or static export renders.
   * Browser localStorage is only a cache/fallback when this block is absent;
   * it never overrides a loaded repo value.
   */
  railDefaults?: StyleRailDefaults;
};

export type ThemeDefinition = {
  id: string;
  manifest: ThemeManifest;
  components: ThemeComponents;
  source: "builtin" | "repo";
};

export type ThemeTokenDefinition =
  | {
      vars: string[];
      kind: "color";
    }
  | {
      vars: string[];
      kind: "length";
      min: number;
      max: number;
      step: number;
      /** px for most lengths; ch where the length is a count of mono glyphs (the ledger name column). */
      unit: "px" | "ch";
      defaultValue: number;
    }
  | {
      vars: string[];
      kind: "number";
      min: number;
      max: number;
      step: number;
      unit?: never;
      defaultValue: number;
    };

const color = (...vars: string[]): ThemeTokenDefinition => ({ vars, kind: "color" });

/**
 * The closed token vocabulary: component file -> token key -> the CSS vars
 * it writes. Unknown files/keys in a theme are ignored (tolerant reads,
 * same policy as the style-rail settings blob).
 *
 * The file names mirror the frozen 16-type BLOCK VOCABULARY exactly (one
 * theme file per block type; each type's vocabulary doc states its keys),
 * plus six non-block files: shell, surfaces, inline-code (the text mark),
 * editor-controls, linking (the shared linked-panels layer), and annotate.
 * One file is shared by two block types: outline-rows (call-stack and
 * component-tree draw the same rows).
 */
export const THEME_TOKEN_REGISTRY: Record<string, Record<string, ThemeTokenDefinition>> = {
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
      defaultValue: 400,
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
      defaultValue: 20,
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
      defaultValue: 24,
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

const FONT_VARS: Record<string, string[]> = {
  body: ["--font-tx02"],
  heading: ["--font-display", "--style-heading-font"],
  code: ["--docs-font-code"],
  number: ["--docs-font-numeric"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readModeValue(value: unknown): { light: string; dark: string } | null {
  if (typeof value === "string" && value.trim()) return { light: value, dark: value };
  if (isRecord(value) && typeof value.light === "string" && typeof value.dark === "string") {
    return { light: value.light, dark: value.dark };
  }
  return null;
}

/** Tolerant reader for a wire/file theme payload; unknown fields drop, bad values skip. */
export function readThemeDefinition(
  id: string,
  raw: unknown,
  source: ThemeDefinition["source"],
): ThemeDefinition | null {
  if (!isRecord(raw)) return null;
  const manifestRaw = isRecord(raw.manifest) ? raw.manifest : raw;
  const name = typeof manifestRaw.name === "string" && manifestRaw.name.trim() ? manifestRaw.name : id;
  const manifest: ThemeManifest = { name };
  if (typeof manifestRaw.base === "string") manifest.base = manifestRaw.base;
  if (typeof manifestRaw.dark === "boolean") manifest.dark = manifestRaw.dark;
  if (isRecord(manifestRaw.fonts)) {
    const fonts: ThemeManifest["fonts"] = {};
    for (const surface of Object.keys(FONT_VARS) as Array<keyof typeof FONT_VARS>) {
      const stack = manifestRaw.fonts[surface];
      if (typeof stack === "string" && stack.trim()) fonts[surface as "body"] = stack;
    }
    if (Object.keys(fonts).length > 0) manifest.fonts = fonts;
  }
  if (isRecord(manifestRaw.railDefaults)) {
    manifest.railDefaults = manifestRaw.railDefaults as StyleRailDefaults;
  }
  const components: ThemeComponents = {};
  const componentsRaw = isRecord(raw.components) ? raw.components : {};
  for (const [file, tokens] of Object.entries(componentsRaw)) {
    if (!THEME_TOKEN_REGISTRY[file] || !isRecord(tokens)) continue;
    const kept: Record<string, ThemeModeValue> = {};
    for (const [key, value] of Object.entries(tokens)) {
      if (!THEME_TOKEN_REGISTRY[file][key]) continue;
      const mode = readModeValue(value);
      if (mode) kept[key] = mode.light === mode.dark ? mode.light : mode;
    }
    if (Object.keys(kept).length > 0) components[file] = kept;
  }
  return { id, manifest, components, source };
}

/**
 * Theme inheritance is leaf-wise for rail settings, just like it is for
 * component tokens. A child that changes one annotate color, one layout
 * dimension, or one block lane must not discard the base theme's sibling
 * settings in the same group.
 */
function mergeRailDefaults(
  base: StyleRailDefaults | undefined,
  override: StyleRailDefaults,
): StyleRailDefaults {
  const merged: Record<string, unknown> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(override)) {
    const inherited = merged[key];
    merged[key] = isRecord(inherited) && isRecord(value)
      ? mergeRailDefaults(inherited as StyleRailDefaults, value as StyleRailDefaults)
      : value;
  }
  return merged as StyleRailDefaults;
}

/** Flattens a base chain (base-first) into one definition; cycles/missing bases just stop the walk. */
export function resolveThemeChain(
  theme: ThemeDefinition,
  lookup: (id: string) => ThemeDefinition | undefined,
): ThemeDefinition {
  const chain: ThemeDefinition[] = [];
  const seen = new Set<string>();
  let current: ThemeDefinition | undefined = theme;
  while (current && !seen.has(current.id)) {
    chain.unshift(current);
    seen.add(current.id);
    current = current.manifest.base ? lookup(current.manifest.base) : undefined;
  }
  const merged: ThemeDefinition = {
    id: theme.id,
    source: theme.source,
    manifest: { name: theme.manifest.name },
    components: {},
  };
  for (const layer of chain) {
    if (layer.manifest.dark !== undefined) merged.manifest.dark = layer.manifest.dark;
    if (layer.manifest.fonts) {
      merged.manifest.fonts = { ...merged.manifest.fonts, ...layer.manifest.fonts };
    }
    if (layer.manifest.railDefaults) {
      merged.manifest.railDefaults = mergeRailDefaults(
        merged.manifest.railDefaults,
        layer.manifest.railDefaults,
      );
    }
    for (const [file, tokens] of Object.entries(layer.components)) {
      merged.components[file] = { ...merged.components[file], ...tokens };
    }
  }
  return merged;
}

/** Selector for a compiled theme's dark values: the dark page plus dark code panels. */
const THEME_DARK_SELECTOR = '[data-theme="dark"], [data-code-panels="dark"] [data-code-surface]';

/** Compiles a RESOLVED theme into the CSS injected as the theme layer. */
export function compileThemeCss(theme: ThemeDefinition): string {
  const light: string[] = [];
  const dark: string[] = [];
  for (const [file, tokens] of Object.entries(theme.components)) {
    for (const [key, value] of Object.entries(tokens)) {
      const token = THEME_TOKEN_REGISTRY[file]?.[key];
      if (!token) continue;
      const mode = readModeValue(value);
      if (!mode) continue;
      for (const cssVar of token.vars) {
        light.push(`  ${cssVar}: ${mode.light};`);
        dark.push(`  ${cssVar}: ${mode.dark};`);
      }
    }
  }
  for (const [surface, stack] of Object.entries(theme.manifest.fonts ?? {})) {
    for (const cssVar of FONT_VARS[surface] ?? []) {
      light.push(`  ${cssVar}: ${stack};`);
      dark.push(`  ${cssVar}: ${stack};`);
    }
  }
  const blocks: string[] = [];
  if (light.length > 0) blocks.push(`:root, [data-theme="light"] {\n${light.join("\n")}\n}`);
  // The dark block also targets the dark code panel island (see the dark
  // block in theme/semantic.css), so a theme's dark values reach code
  // surfaces on a light page.
  if (dark.length > 0) blocks.push(`${THEME_DARK_SELECTOR} {\n${dark.join("\n")}\n}`);
  return blocks.join("\n\n");
}

const THEME_STYLE_TAG_ID = "docs-theme-folder-css";

/** Injects (or clears, for null) the resolved theme's CSS layer. */
export function applyThemeCss(theme: ThemeDefinition | null): void {
  let tag = document.getElementById(THEME_STYLE_TAG_ID);
  if (!theme) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("style");
    tag.id = THEME_STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = compileThemeCss(theme);
}

/**
 * Built-in global themes (the former style-rail presets, plus Default).
 * Compiled-in constants sharing the folder format's shape — custom themes
 * are folders in the repo's themes/ directory.
 */
export const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: "default",
    source: "builtin",
    // The ONLY built-in while Ford iterates on what the default theme IS.
    // The repo's themes/default/ folder (auto-saved from the rail by the
    // workbench) OVERRIDES this compiled-in fallback when present — see
    // App.tsx resolveThemeById. Empty railDefaults still mean "selecting
    // Default resets the overlay to the saved core theme" via
    // normalizeSettings.
    manifest: { name: "Default", dark: false, railDefaults: {} },
    components: {},
  },
];
